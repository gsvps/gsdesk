package input

import (
	"image"
	"sync"
)

var (
	mappingMu                   sync.RWMutex
	streamWidth, streamHeight   = 1, 1
	desktopOriginX, desktopOriginY = 0, 0
	desktopWidth, desktopHeight   = 1, 1
)

func SetScreenMapping(streamW, streamH int, desktop image.Rectangle) {
	mappingMu.Lock()
	defer mappingMu.Unlock()
	if streamW > 0 {
		streamWidth = streamW
	}
	if streamH > 0 {
		streamHeight = streamH
	}
	desktopOriginX = desktop.Min.X
	desktopOriginY = desktop.Min.Y
	if desktop.Dx() > 0 {
		desktopWidth = desktop.Dx()
	}
	if desktop.Dy() > 0 {
		desktopHeight = desktop.Dy()
	}
}

func mapToDesktop(x, y int) (int, int) {
	mappingMu.RLock()
	sw, sh := streamWidth, streamHeight
	ox, oy := desktopOriginX, desktopOriginY
	dw, dh := desktopWidth, desktopHeight
	mappingMu.RUnlock()

	if sw <= 0 || sh <= 0 {
		return ox + x, oy + y
	}

	dx := ox + int(float64(x)*float64(dw)/float64(sw)+0.5)
	dy := oy + int(float64(y)*float64(dh)/float64(sh)+0.5)

	maxX := ox + dw - 1
	maxY := oy + dh - 1
	if dx < ox {
		dx = ox
	}
	if dy < oy {
		dy = oy
	}
	if dx > maxX {
		dx = maxX
	}
	if dy > maxY {
		dy = maxY
	}
	return dx, dy
}
