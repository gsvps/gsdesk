//go:build windows

package platform

import (
	"syscall"
)

var (
	shcore                     = syscall.NewLazyDLL("shcore.dll")
	procSetProcessDpiAwareness = shcore.NewProc("SetProcessDpiAwareness")
	user32                     = syscall.NewLazyDLL("user32.dll")
	procSetProcessDPIAware     = user32.NewProc("SetProcessDPIAware")
)

// EnableDPIAwareness 使截屏坐标与 SetCursorPos 使用同一套 DPI 坐标系。
func EnableDPIAwareness() {
	const processPerMonitorDPIAware = 2
	if procSetProcessDpiAwareness.Find() == nil {
		_, _, _ = procSetProcessDpiAwareness.Call(uintptr(processPerMonitorDPIAware))
	}
	_, _, _ = procSetProcessDPIAware.Call()
}
