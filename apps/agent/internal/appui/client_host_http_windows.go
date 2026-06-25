//go:build windows && !uiwebview

package appui

import (
	"fmt"
	"net/http"
	"os/exec"
	"sync"
	"time"

	"github.com/gsvps/gsdesk/internal/config"
)

var (
	httpUIMu              sync.Mutex
	httpUIStarted         bool
	httpUIPort            int
	httpUISession         *bridgeSession
	skipBrowserOpenOnStart bool
)

// SetSkipBrowserOpenOnStart 安装完成后由已有浏览器标签接管 UI，避免再开新标签。
func SetSkipBrowserOpenOnStart(v bool) {
	httpUIMu.Lock()
	skipBrowserOpenOnStart = v
	httpUIMu.Unlock()
}

func consumeSkipBrowserOpen() bool {
	httpUIMu.Lock()
	defer httpUIMu.Unlock()
	if !skipBrowserOpenOnStart {
		return false
	}
	skipBrowserOpenOnStart = false
	return true
}

func showClientWindow(cfg *config.Config, save SaveFunc, agent AgentView, tab string, block bool) {
	go func() {
		if err := openAgentUI(cfg, newAgentHolder(agent, save), tab, nil); err != nil {
			showError(err.Error())
		}
	}()
}

func runClientWindow(cfg *config.Config, holder *agentHolder, tab string, block bool, _ clientWindowOpts) error {
	if err := openAgentUI(cfg, holder, tab, nil); err != nil {
		return err
	}
	if block {
		select {}
	}
	return nil
}

func runBootstrapClient(cfg *config.Config, factory AgentFactory) error {
	_ = factory
	done := make(chan struct{})
	if err := openAgentUI(cfg, newAgentHolder(nil, nil), "install", done); err != nil {
		return err
	}
	<-done
	return nil
}

func openAgentUI(cfg *config.Config, holder *agentHolder, tab string, installDone chan struct{}) error {
	onSuccess := defaultInstallSuccess

	session := &bridgeSession{
		cfg:              cfg,
		holder:           holder,
		tab:              tab,
		onInstallSuccess: onSuccess,
		installDone:      installDone,
	}

	if err := ensureAgentUIServer(session); err != nil {
		return err
	}

	path := "/"
	switch tab {
	case "device", "settings":
		path = "/settings"
	case "install":
		path = "/install"
	}

	if !consumeSkipBrowserOpen() {
		if err := openBrowserUI(path); err != nil {
			return err
		}
	}

	if installDone != nil {
		<-installDone
	}
	return nil
}

func ensureAgentUIServer(session *bridgeSession) error {
	httpUIMu.Lock()
	defer httpUIMu.Unlock()

	httpUISession = session

	if httpUIStarted {
		return nil
	}

	mux := http.NewServeMux()
	mountClientHandlers(mux, session.cfg)
	mountBridgeHandlers(mux, session)

	ln, port, err := listenLocalUI()
	if err != nil {
		return err
	}

	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	registerUIServer(srv)
	go func() { _ = srv.Serve(ln) }()

	httpUIPort = port
	httpUIStarted = true
	return nil
}

func openBrowserUI(path string) error {
	if path == "" {
		path = "/"
	}
	if path[0] != '/' {
		path = "/" + path
	}
	port := httpUIPort
	if port == 0 {
		port = DefaultLocalUIPort
	}
	url := fmt.Sprintf("http://127.0.0.1:%d%s", port, path)
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

func updateBridgeSession(cfg *config.Config, holder *agentHolder) {
	httpUIMu.Lock()
	defer httpUIMu.Unlock()
	if httpUISession != nil {
		httpUISession.cfg = cfg
		httpUISession.holder = holder
	}
}

func raiseAgentUI() {
	_ = openBrowserUI("/")
}
