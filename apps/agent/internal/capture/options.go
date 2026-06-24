package capture

import "image"

// StreamOptions configures screen capture output targets.
type StreamOptions struct {
	Track       mediaWriter
	VP8Frames   chan<- image.Image
	SendControl func([]byte)
	SendBinary  func([]byte)
	OnReady     func(ScreenMeta)
}
