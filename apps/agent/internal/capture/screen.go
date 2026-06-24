package capture

import (
	"bytes"
	"encoding/base64"
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
const maxStreamWidth = 960
// WebRTC DataChannel 单条消息上限约 256KB；base64 + JSON 后需留出余量
const maxJPEGBytes = 120 * 1024

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
				firstFrame := s.width == 0
				s.width = meta.Width
				s.height = meta.Height
				s.mu.Unlock()

				if firstFrame && opts.OnReady != nil {
					opts.OnReady(meta)
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

				if opts.SendControl != nil {
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
