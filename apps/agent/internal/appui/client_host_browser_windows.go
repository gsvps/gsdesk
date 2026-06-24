//go:build windows && !cgo

package appui

import (
	"fmt"
	"net"
	"net/http"
	"os/exec"
	"time"

	"github.com/clouddesk/agent/internal/config"
)

func showClientWindow(cfg *config.Config, save SaveFunc, agent AgentView, tab string, block bool) {
	go func() {
		if err := runClientWindow(cfg, save, agent, tab, block); err != nil {
			showError(err.Error())
		}
	}()
}

func runClientWindow(cfg *config.Config, save SaveFunc, agent AgentView, tab string, block bool) error {
	mux := http.NewServeMux()
	mountClientHandlers(mux, cfg.ServerURL)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	go func() { _ = http.Serve(ln, mux) }()

	url := fmt.Sprintf("http://127.0.0.1:%d/", ln.Addr().(*net.TCPAddr).Port)
	if tab == "device" || tab == "settings" {
		url += "settings"
	}
	if err := exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start(); err != nil {
		return fmt.Errorf("打开浏览器失败（请用 build-client.ps1 编译 CGO 版以获得原生窗口）: %w", err)
	}
	if !block {
		return nil
	}
	time.Sleep(365 * 24 * time.Hour)
	return nil
}
