//go:build !cgo || !libvpx

package capture

import (
	"image"
	"log"
)

// VP8Available is false when the agent is built without CGO/libvpx.
func VP8Available() bool {
	return false
}

// StartVP8Pipeline is a no-op without CGO/libvpx; JPEG DataChannel fallback is used.
func StartVP8Pipeline(track mediaWriter, meta ScreenMeta, frameCh <-chan image.Image, stop <-chan struct{}) func() {
	log.Printf("VP8 disabled (build with CGO_ENABLED=1 and libvpx for VideoTrack)")
	return func() {}
}
