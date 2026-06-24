//go:build ignore

// VP8/libvpx encoder — enable by removing the ignore tag and building with:
//   CGO_ENABLED=1 go build -tags libvpx

package capture

import (
	"io"
	"image"
	"log"
	"time"

	"github.com/pion/mediadevices/pkg/codec/vp8"
	"github.com/pion/mediadevices/pkg/prop"
	"github.com/pion/webrtc/v4/pkg/media"
)

// VP8Available reports whether libvpx-backed VP8 encoding can be used.
func VP8Available() bool {
	_, err := vp8.NewParams()
	return err == nil
}

// StartVP8Pipeline encodes frames pushed to frameCh into VP8 samples on track.
func StartVP8Pipeline(track mediaWriter, meta ScreenMeta, frameCh <-chan image.Image, stop <-chan struct{}) func() {
	done := make(chan struct{})

	reader := &vp8FrameReader{
		frames: frameCh,
		stop:   stop,
	}

	params, err := vp8.NewParams()
	if err != nil {
		log.Printf("vp8 params: %v", err)
		return func() {}
	}
	params.BitRate = 2_000_000

	enc, err := params.BuildVideoEncoder(reader, prop.Media{
		Video: prop.Video{
			Width:     meta.Width,
			Height:    meta.Height,
			FrameRate: float32(defaultFPS),
		},
	})
	if err != nil {
		log.Printf("vp8 encoder: %v", err)
		return func() {}
	}

	go func() {
		defer enc.Close()
		buf := make([]byte, 256*1024)
		for {
			select {
			case <-done:
				return
			default:
				n, err := enc.Read(buf)
				if n > 0 && track != nil {
					sample := media.Sample{
						Data:     append([]byte(nil), buf[:n]...),
						Duration: time.Second / defaultFPS,
					}
					if writeErr := track.WriteSample(sample); writeErr != nil {
						log.Printf("vp8 write sample: %v", writeErr)
					}
				}
				if err != nil {
					if err == io.EOF {
						time.Sleep(10 * time.Millisecond)
						continue
					}
					log.Printf("vp8 read: %v", err)
					return
				}
			}
		}
	}()

	log.Printf("VP8 video track enabled %dx%d @ %dfps", meta.Width, meta.Height, defaultFPS)
	return func() { close(done) }
}

type vp8FrameReader struct {
	frames <-chan image.Image
	stop   <-chan struct{}
}

func (r *vp8FrameReader) Read() (image.Image, func(), error) {
	select {
	case <-r.stop:
		return nil, nil, io.EOF
	case img, ok := <-r.frames:
		if !ok || img == nil {
			return nil, nil, io.EOF
		}
		return img, func() {}, nil
	}
}
