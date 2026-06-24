package capture

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"image"
	"image/jpeg"
	"log"
	"sync"
	"time"

	"github.com/kbinani/screenshot"
	"github.com/pion/webrtc/v4/pkg/media"
)

const defaultFPS = 10
const maxStreamWidth = 1280
// WebRTC DataChannel 单条消息上限约 256KB；二进制帧仅 8 字节头，可传更大 JPEG
const maxJPEGBytes = 240 * 1024

// Binary screen frame header: "CDSF" + width(u16 BE) + height(u16 BE) + jpeg bytes
var binaryFrameMagic = []byte{'C', 'D', 'S', 'F'}

type ScreenMeta struct {
	Width  int
	Height int
}

type Screen struct {
	mu     sync.Mutex
	width  int
	height int
}

func NewScreen() *Screen {
	return &Screen{}
}

func (s *Screen) Meta() ScreenMeta {
	s.mu.Lock()
	defer s.mu.Unlock()
	return ScreenMeta{Width: s.width, Height: s.height}
}

func PrimaryDisplayBounds() image.Rectangle {
	n := screenshot.NumActiveDisplays()
	if n == 0 {
		return image.Rect(0, 0, 1, 1)
	}
	return screenshot.GetDisplayBounds(0)
}

func PrimaryDisplaySize() (width, height int) {
	bounds := PrimaryDisplayBounds()
	return bounds.Dx(), bounds.Dy()
}

func (s *Screen) StartStreaming(opts StreamOptions) func() {
	stop := make(chan struct{})

	go func() {
		ticker := time.NewTicker(time.Second / defaultFPS)
		defer ticker.Stop()
		loggedCaptureErr := false
		lastFPS := defaultFPS

		for {
			cfg := CurrentSettings()
			if cfg.FPS != lastFPS && cfg.FPS > 0 {
				ticker.Reset(time.Second / time.Duration(cfg.FPS))
				lastFPS = cfg.FPS
			}

			select {
			case <-stop:
				return
			case <-ticker.C:
				meta, jpegFrame, scaled, err := s.captureFrame(cfg)
				if err != nil {
					if !loggedCaptureErr {
						loggedCaptureErr = true
						log.Printf("screen capture failed: %v", err)
					}
					continue
				}

				s.mu.Lock()
				prevW, prevH := s.width, s.height
				firstFrame := s.width == 0
				sizeChanged := firstFrame || prevW != meta.Width || prevH != meta.Height
				s.width = meta.Width
				s.height = meta.Height
				s.mu.Unlock()

				if firstFrame && opts.OnReady != nil {
					opts.OnReady(meta)
				}
				if sizeChanged && !firstFrame && opts.OnStreamResize != nil {
					opts.OnStreamResize(meta)
				}

				if opts.VP8Frames != nil {
					select {
					case opts.VP8Frames <- scaled:
					default:
					}
				}

				if opts.Track != nil {
					_ = opts.Track.WriteSample(media.Sample{
						Data:     jpegFrame,
						Duration: time.Second / defaultFPS,
					})
				}

				if opts.SendBinary != nil {
					if frame := packBinaryFrame(jpegFrame, meta); frame != nil {
						opts.SendBinary(frame)
					}
				} else if opts.SendControl != nil {
					payload, err := json.Marshal(map[string]any{
						"type":   "screen_frame",
						"data":   base64.StdEncoding.EncodeToString(jpegFrame),
						"width":  meta.Width,
						"height": meta.Height,
						"format": "jpeg",
					})
					if err == nil {
						opts.SendControl(payload)
					}
				}
			}
		}
	}()

	return func() { close(stop) }
}

func (s *Screen) captureFrame(cfg StreamSettings) (ScreenMeta, []byte, image.Image, error) {
	n := screenshot.NumActiveDisplays()
	if n == 0 {
		return ScreenMeta{}, nil, nil, errNoDisplay
	}

	bounds := screenshot.GetDisplayBounds(0)
	img, err := screenshot.CaptureRect(bounds)
	if err != nil {
		return ScreenMeta{}, nil, nil, err
	}

	maxWidth := cfg.MaxWidth
	if maxWidth <= 0 {
		maxWidth = maxStreamWidth
	}
	scaled := downscale(img, maxWidth)
	sb := scaled.Bounds()
	meta := ScreenMeta{Width: sb.Dx(), Height: sb.Dy()}
	buf, err := encodeJPEG(scaled, cfg)
	if err != nil {
		return ScreenMeta{}, nil, nil, err
	}

	return meta, buf, scaled, nil
}

func encodeJPEG(img image.Image, cfg StreamSettings) ([]byte, error) {
	targetQuality := cfg.JPEGQuality
	if targetQuality <= 0 {
		targetQuality = 60
	}
	maxBytes := cfg.MaxJPEGBytes
	if maxBytes <= 0 {
		maxBytes = maxJPEGBytes
	}
	for quality := targetQuality; quality >= 25; quality -= 5 {
		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality}); err != nil {
			return nil, err
		}
		if buf.Len() <= maxBytes {
			return buf.Bytes(), nil
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 25}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func packBinaryFrame(jpegFrame []byte, meta ScreenMeta) []byte {
	if len(jpegFrame) == 0 || meta.Width <= 0 || meta.Height <= 0 {
		return nil
	}
	if len(jpegFrame)+len(binaryFrameMagic)+4 > maxJPEGBytes+len(binaryFrameMagic)+4 {
		return nil
	}
	out := make([]byte, len(binaryFrameMagic)+4, len(binaryFrameMagic)+4+len(jpegFrame))
	copy(out, binaryFrameMagic)
	binary.BigEndian.PutUint16(out[4:6], uint16(meta.Width))
	binary.BigEndian.PutUint16(out[6:8], uint16(meta.Height))
	return append(out, jpegFrame...)
}

func downscale(src image.Image, maxWidth int) image.Image {
	b := src.Bounds()
	if b.Dx() <= maxWidth {
		return src
	}
	ratio := float64(maxWidth) / float64(b.Dx())
	newW := maxWidth
	newH := int(float64(b.Dy()) * ratio)
	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	for y := 0; y < newH; y++ {
		for x := 0; x < newW; x++ {
			srcX := b.Min.X + int(float64(x)/ratio)
			srcY := b.Min.Y + int(float64(y)/ratio)
			dst.Set(x, y, src.At(srcX, srcY))
		}
	}
	return dst
}

type mediaWriter interface {
	WriteSample(sample media.Sample) error
}
