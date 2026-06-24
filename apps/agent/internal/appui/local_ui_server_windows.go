//go:build windows && cgo

package appui

import (
	"fmt"
	"net"
	"sync"
)

// DefaultLocalUIPort is the fixed loopback port for the embedded UI server.
// Using a stable port avoids repeated Windows Firewall prompts on each launch.
const DefaultLocalUIPort = 19527

func listenLocalUI() (net.Listener, int, error) {
	fixed := fmt.Sprintf("127.0.0.1:%d", DefaultLocalUIPort)
	ln, err := net.Listen("tcp", fixed)
	if err == nil {
		return ln, DefaultLocalUIPort, nil
	}
	ln, err = net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, 0, err
	}
	return ln, ln.Addr().(*net.TCPAddr).Port, nil
}

var (
	activeWindowMu sync.Mutex
	activeWindow   nativeWindow
	windowHidden   bool
)

func setActiveWindow(w nativeWindow) {
	activeWindowMu.Lock()
	activeWindow = w
	windowHidden = false
	activeWindowMu.Unlock()
}

func clearActiveWindow() {
	activeWindowMu.Lock()
	activeWindow = nil
	windowHidden = false
	activeWindowMu.Unlock()
}

func restoreActiveWindow() bool {
	return showOrRestoreActiveWindow()
}

func showOrRestoreActiveWindow() bool {
	activeWindowMu.Lock()
	w := activeWindow
	if w != nil {
		windowHidden = false
	}
	activeWindowMu.Unlock()
	if w == nil {
		return false
	}
	w.Dispatch(func() {
		showNativeWindow(w)
	})
	return true
}

func hideActiveWindowToTray() {
	activeWindowMu.Lock()
	windowHidden = true
	activeWindowMu.Unlock()
}

func isWindowHiddenToTray() bool {
	activeWindowMu.Lock()
	defer activeWindowMu.Unlock()
	return windowHidden && activeWindow != nil
}
