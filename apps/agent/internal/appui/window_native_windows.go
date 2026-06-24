//go:build windows && cgo

package appui

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	swHide      = 0
	swShow      = 5
	swRestore   = 9
	swMaximize  = 3
)

var (
	user32         = windows.NewLazySystemDLL("user32.dll")
	procShowWindow = user32.NewProc("ShowWindow")
	procIsZoomed   = user32.NewProc("IsZoomed")
)

func nativeWindowHandle(w interface{ Window() unsafe.Pointer }) windows.HWND {
	return windows.HWND(uintptr(w.Window()))
}

func showWindow(hwnd windows.HWND, cmd int) {
	procShowWindow.Call(uintptr(hwnd), uintptr(cmd))
}

func hideNativeWindow(w interface{ Window() unsafe.Pointer }) {
	showWindow(nativeWindowHandle(w), swHide)
}

func showNativeWindow(w interface{ Window() unsafe.Pointer }) {
	showWindow(nativeWindowHandle(w), swShow)
}

func setNativeWindowMaximized(w interface{ Window() unsafe.Pointer }, maximized bool) {
	cmd := swRestore
	if maximized {
		cmd = swMaximize
	}
	showWindow(nativeWindowHandle(w), cmd)
}

func isNativeWindowMaximized(w interface{ Window() unsafe.Pointer }) bool {
	r, _, _ := procIsZoomed.Call(uintptr(nativeWindowHandle(w)))
	return r != 0
}
