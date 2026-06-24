//go:build windows && !uiwebview

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

const DefaultLocalUIPort = 19527

var (
	uiServerMu   sync.Mutex
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

func QuitApplication(closeAgent func()) {
	go exitApplication(closeAgent)
}

func exitApplication(closeAgent func()) {
	time.Sleep(200 * time.Millisecond)
	shutdownUIServer()
	if closeAgent != nil {
		closeAgent()
	}
	os.Exit(0)
}

func showOrRestoreActiveWindow() bool {
	raiseAgentUI()
	return true
}

func quitActiveClientWindow() {}
