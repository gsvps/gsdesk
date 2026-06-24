//go:build windows && cgo

package appui

import (
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/clouddesk/agent/internal/config"
	"golang.org/x/sys/windows"
)

const (
	wmClose       = 0x0010
	wmSysCommand  = 0x0112
	scClose       = 0xF060
	gwlWndProc    = ^uintptr(3) // GWLP_WNDPROC = -4
)

var (
	procGetWindowLongPtrW = user32.NewProc("GetWindowLongPtrW")
	procSetWindowLongPtrW = user32.NewProc("SetWindowLongPtrW")
	procCallWindowProcW   = user32.NewProc("CallWindowProcW")
	closeHooks            sync.Map
	closeHookCallback     uintptr
)

type windowCloseHook struct {
	origWndProc uintptr
}

type nativeWindow interface {
	Window() unsafe.Pointer
	Dispatch(func())
	Terminate()
}

func installWindowCloseHook(w nativeWindow, cfg *config.Config) {
	hwnd := nativeWindowHandle(w)
	if hwnd == 0 {
		return
	}
	if _, loaded := closeHooks.Load(hwnd); loaded {
		return
	}

	orig, _, _ := procGetWindowLongPtrW.Call(uintptr(hwnd), gwlWndProc)
	hook := &windowCloseHook{origWndProc: orig}
	closeHooks.Store(hwnd, hook)

	cb := syscall.NewCallback(func(hwndParam, msg, wParam, lParam uintptr) uintptr {
		if shouldHideToTray(cfg, msg, wParam) {
			if handleClientWindowClose(w, cfg) {
				return 0
			}
		}
		if h, ok := closeHooks.Load(windows.HWND(hwndParam)); ok {
			hook := h.(*windowCloseHook)
			ret, _, _ := procCallWindowProcW.Call(hook.origWndProc, hwndParam, msg, wParam, lParam)
			return ret
		}
		ret, _, _ := procCallWindowProcW.Call(orig, hwndParam, msg, wParam, lParam)
		return ret
	})
	closeHookCallback = cb
	procSetWindowLongPtrW.Call(uintptr(hwnd), gwlWndProc, cb)
}

func shouldHideToTray(cfg *config.Config, msg, wParam uintptr) bool {
	if cfg == nil || !cfg.Settings.CloseToTrayOn() {
		return false
	}
	if msg == wmClose {
		return true
	}
	if msg == wmSysCommand && (wParam & 0xFFF0) == scClose {
		return true
	}
	return false
}

func handleClientWindowClose(w nativeWindow, cfg *config.Config) bool {
	if cfg == nil || !cfg.Settings.CloseToTrayOn() {
		return false
	}
	hideNativeWindow(w)
	hideActiveWindowToTray()
	return true
}

func terminateClientWindow(w nativeWindow) {
	clearActiveWindow()
	windowMu.Lock()
	windowOpen = false
	windowMu.Unlock()
	w.Terminate()
}

func quitActiveClientWindow() {
	activeWindowMu.Lock()
	w := activeWindow
	activeWindowMu.Unlock()
	if w == nil {
		return
	}

	done := make(chan struct{}, 1)
	w.Dispatch(func() {
		terminateClientWindow(w)
		done <- struct{}{}
	})

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		terminateClientWindow(w)
	}
}
