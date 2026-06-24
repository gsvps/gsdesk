//go:build windows && uiwebview

package appui

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"sync"
	"time"
)

// DefaultLocalUIPort is the fixed loopback port for the embedded UI server.
// Using a stable port avoids repeated Windows Firewall prompts on each launch.
const DefaultLocalUIPort = 19527

var (
	activeWindowMu sync.Mutex
	activeWindow   nativeWindow
	windowHidden   bool

	uiServerMu sync.Mutex
	uiHTTPServer *http.Server
)

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

func registerUIServer(srv *http.Server) {
	uiServerMu.Lock()
	uiHTTPServer = srv
	uiServerMu.Unlock()
}

func shutdownUIServer() {
	uiServerMu.Lock()
	srv := uiHTTPServer
	uiHTTPServer = nil
	uiServerMu.Unlock()
	if srv == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

// QuitApplication closes the UI window, stops background services, and exits the process.
// Must not block the systray thread (Windows message loop).
func QuitApplication(closeAgent func()) {
	go exitApplication(closeAgent)
}

func exitApplication(closeAgent func()) {
	quitActiveClientWindow()
	time.Sleep(300 * time.Millisecond)
	shutdownUIServer()
	if closeAgent != nil {
		closeAgent()
	}
	os.Exit(0)
}

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
		bringNativeWindowToFront(w)
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
