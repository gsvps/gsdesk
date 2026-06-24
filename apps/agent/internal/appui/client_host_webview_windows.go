//go:build windows && cgo

package appui

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/clouddesk/agent/internal/config"
	"github.com/clouddesk/agent/internal/install"
	"github.com/clouddesk/agent/internal/tray"
	"github.com/clouddesk/agent/internal/update"
	"github.com/sqweek/dialog"
	webview "github.com/webview/webview_go"
)

var (
	installMu       sync.Mutex
	installProgress install.Progress
)

type clientWindowOpts struct {
	hideUntilReady   bool
	onInstallSuccess func(w webview.WebView, homeURL string) error
}

func showClientWindow(cfg *config.Config, save SaveFunc, agent AgentView, tab string, block bool) {
	go func() {
		windowMu.Lock()
		if windowOpen {
			windowMu.Unlock()
			showOrRestoreActiveWindow()
			return
		}
		windowMu.Unlock()
		if err := runClientWindow(cfg, newAgentHolder(agent, save), tab, block, clientWindowOpts{hideUntilReady: true}); err != nil {
			showError(err.Error())
		}
	}()
}

func runClientWindow(cfg *config.Config, holder *agentHolder, tab string, block bool, opts clientWindowOpts) error {
	windowMu.Lock()
	if windowOpen {
		windowMu.Unlock()
		return nil
	}
	windowOpen = true
	windowMu.Unlock()

	defer func() {
		clearActiveWindow()
		windowMu.Lock()
		windowOpen = false
		windowMu.Unlock()
	}()

	mux := http.NewServeMux()
	mountClientHandlers(mux, cfg)

	ln, port, err := listenLocalUI()
	if err != nil {
		return err
	}

	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	registerUIServer(srv)
	go func() { _ = srv.Serve(ln) }()
	defer shutdownUIServer()

	homeURL := fmt.Sprintf("http://127.0.0.1:%d/", port)
	startURL := homeURL
	switch tab {
	case "device", "settings":
		startURL += "settings"
	case "install":
		startURL += "install"
	}

	EnsureWebViewEnvironment()

	w := webview.New(false)
	defer w.Destroy()
	w.SetTitle("CloudDesk")
	w.SetSize(960, 720, webview.HintNone)
	w.Init(`document.documentElement.style.background='#0f172a';document.body.style.background='#0f172a';document.body.style.color='#e2e8f0';`)

	if opts.hideUntilReady {
		hideNativeWindow(w)
	}

	agentView := func() AgentView {
		if holder == nil {
			return nil
		}
		return holder.view()
	}
	saveFn := func() SaveFunc {
		if holder == nil {
			return nil
		}
		return holder.saveFn()
	}

	w.Bind("getRuntimeConfig", func() string {
		base := strings.TrimRight(strings.TrimSpace(cfg.ServerURL), "/")
		return mustJSON(map[string]any{
			"mode":     "desktop",
			"apiBase":  base,
			"deviceId": cfg.DeviceID,
		})
	})

	w.Bind("getControllerTokenGo", func() string {
		return mustJSON(map[string]any{
			"ok":    true,
			"token": getControllerToken(cfg),
		})
	})

	w.Bind("saveControllerTokenGo", func(token string) string {
		return mustJSON(saveControllerToken(cfg, token))
	})

	w.Bind("notifyUIReadyGo", func() string {
		w.Dispatch(func() {
			setActiveWindow(w)
			installWindowCloseHook(w, cfg)
			showNativeWindow(w)
		})
		return mustJSON(actionResult{OK: true})
	})

	w.Bind("setWindowFullscreenGo", func(enabled string) string {
		maximize := strings.EqualFold(strings.TrimSpace(enabled), "true") || enabled == "1"
		setNativeWindowMaximized(w, maximize)
		return mustJSON(map[string]any{"ok": true, "fullscreen": isNativeWindowMaximized(w)})
	})

	w.Bind("isWindowFullscreenGo", func() string {
		return mustJSON(map[string]any{"ok": true, "fullscreen": isNativeWindowMaximized(w)})
	})

	w.Bind("getInitialState", func() string {
		return mustJSON(buildUIState(cfg, agentView()))
	})

	w.Bind("refreshAgentStatus", func() string {
		agent := agentView()
		if agent == nil {
			state := buildUIState(cfg, nil)
			return mustJSON(actionResult{OK: true, Online: false, State: &state})
		}
		state := buildUIState(cfg, agent)
		return mustJSON(actionResult{OK: true, Online: state.Online, State: &state})
	})

	w.Bind("reconnectAgentGo", func() string {
		agent := agentView()
		if agent == nil {
			return mustJSON(actionResult{OK: false, Error: "Agent 服务未就绪"})
		}
		settings := cfg.Settings.Normalized()
		if settings.AgentEnabledOn() {
			agent.ForceReconnect()
		}
		state := buildUIState(cfg, agent)
		return mustJSON(actionResult{OK: true, Online: state.Online, State: &state, Message: "正在连接…"})
	})

	w.Bind("copyText", func(text string) string {
		if text == "" {
			return mustJSON(actionResult{OK: false, Error: "内容为空"})
		}
		if err := writeClipboard(text); err != nil {
			return mustJSON(actionResult{OK: false, Error: err.Error()})
		}
		return mustJSON(actionResult{OK: true})
	})

	w.Bind("browseDownloadDirGo", func(current string) string {
		return browseDownloadDir(current)
	})

	w.Bind("generateOTPGo", func() string {
		agent := agentView()
		if agent == nil {
			return mustJSON(actionResult{OK: false, Error: "Agent 服务未就绪"})
		}
		if err := agent.RefreshOTP(); err != nil {
			return mustJSON(actionResult{OK: false, Error: err.Error()})
		}
		code, expiresIn, _, _ := agent.OTPStatus()
		return mustJSON(actionResult{OK: true, Code: code, ExpiresIn: expiresIn})
	})

	w.Bind("getOTPStatusGo", func() string {
		agent := agentView()
		if agent == nil {
			return mustJSON(actionResult{OK: false, Error: "Agent 服务未就绪"})
		}
		code, expiresIn, idleMinutes, activeSessions := agent.OTPStatus()
		return mustJSON(map[string]any{
			"ok":                       true,
			"code":                     code,
			"expires_in":               expiresIn,
			"otp_idle_refresh_minutes": idleMinutes,
			"active_sessions":          activeSessions,
		})
	})

	w.Bind("clearPermanentPasswordGo", func() string {
		agent := agentView()
		if agent == nil {
			return mustJSON(actionResult{OK: false, Error: "Agent 服务未就绪"})
		}
		if err := agent.ClearPermanentPassword(); err != nil {
			return mustJSON(actionResult{OK: false, Error: err.Error()})
		}
		return mustJSON(actionResult{OK: true, Message: "已清除自定义密码。"})
	})

	w.Bind("saveSettingsGo", func(raw string) string {
		var payload savePayload
		if err := json.Unmarshal([]byte(raw), &payload); err != nil {
			return mustJSON(actionResult{OK: false, Error: err.Error()})
		}
		return mustJSON(applySave(cfg, saveFn(), agentView(), payload))
	})

	w.Bind("closeWindowGo", func() string {
		if handleClientWindowClose(w, cfg) {
			return mustJSON(actionResult{OK: true, Message: "已最小化到托盘"})
		}
		terminateClientWindow(w)
		return mustJSON(actionResult{OK: true})
	})

	w.Bind("getInstallStateGo", func() string {
		return mustJSON(install.GetState())
	})

	w.Bind("browseInstallDirGo", func(current string) string {
		path, err := dialog.Directory().Title("选择 CloudDesk 安装目录").Browse()
		if err != nil || path == "" {
			if current != "" {
				return current
			}
			return install.GetState().DefaultDir
		}
		return path
	})

	w.Bind("runInstallGo", func(raw string) string {
		var req install.InstallRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil || strings.TrimSpace(req.InstallDir) == "" {
			req = install.InstallRequest{InstallDir: raw, CreateDesktopShortcut: true}
		}

		installMu.Lock()
		if installProgress.Running {
			installMu.Unlock()
			return mustJSON(actionResult{OK: false, Error: "安装正在进行中"})
		}
		installProgress = install.Progress{Running: true, Step: "准备安装…", Percent: 2}
		installMu.Unlock()

		go func() {
			result := install.RunInstallWithOptions(req, func(step string, percent int) {
				installMu.Lock()
				installProgress.Step = step
				installProgress.Percent = percent
				installMu.Unlock()
			})

			installMu.Lock()
			installProgress.Running = false
			installProgress.Done = true
			installProgress.OK = result.OK
			installProgress.Error = result.Error
			installProgress.Message = result.Message
			installProgress.Relaunch = result.Relaunch
			if result.OK {
				installProgress.Step = "安装完成"
				installProgress.Percent = 100
			} else if installProgress.Step == "" {
				installProgress.Step = "安装失败"
			}
			installMu.Unlock()

			if !result.OK || tab != "install" {
				return
			}

			time.Sleep(300 * time.Millisecond)
			w.Dispatch(func() {
				if opts.onInstallSuccess != nil {
					if err := opts.onInstallSuccess(w, homeURL); err != nil {
						showError(err.Error())
						w.Terminate()
					}
					return
				}
				w.Terminate()
			})
		}()

		return mustJSON(map[string]any{"ok": true, "started": true})
	})

	w.Bind("getInstallProgressGo", func() string {
		installMu.Lock()
		defer installMu.Unlock()
		return mustJSON(installProgress)
	})

	w.Bind("getClientVersionGo", func() string {
		return mustJSON(map[string]any{
			"ok":      true,
			"version": update.CurrentVersion(),
		})
	})

	w.Bind("checkUpdateGo", func() string {
		result := update.Check(cfg.ServerURL)
		return mustJSON(result)
	})

	w.Bind("openExternalGo", func(target string) string {
		if err := update.OpenURL(target); err != nil {
			return mustJSON(actionResult{OK: false, Error: err.Error()})
		}
		return mustJSON(actionResult{OK: true})
	})

	w.Navigate(startURL)
	w.Run()
	return nil
}

func runBootstrapClient(cfg *config.Config, factory AgentFactory) error {
	holder := newAgentHolder(nil, nil)
	trayStarted := false

	return runClientWindow(cfg, holder, "install", true, clientWindowOpts{
		hideUntilReady: true,
		onInstallSuccess: func(w webview.WebView, homeURL string) error {
			newCfg, err := config.Load()
			if err != nil {
				return err
			}
			*cfg = *newCfg

			agent, save, err := factory(newCfg)
			if err != nil {
				return err
			}
			holder.set(agent, save)

			if av := holder.view(); av != nil {
				go func() {
					_ = av.RefreshOTP()
				}()
			}

			if !trayStarted {
				trayStarted = true
				go runTrayLoop(holder, cfg)
			}

			w.Init(`sessionStorage.setItem('clouddesk:post-install','1')`)
			w.Navigate(homeURL + "settings")
			return nil
		},
	})
}

func runTrayLoop(holder *agentHolder, cfg *config.Config) {
	agent := holder.view()
	if agent == nil {
		return
	}
	tray.Run(tray.Options{
		DeviceID: agent.DeviceID(),
		IsOnline: agent.IsOnline,
		OnOpenMain: func() {
			ShowClientWindow(cfg, holder.saveFn(), holder.view(), "control")
		},
		OnSettings: func() {
			ShowClientWindow(cfg, holder.saveFn(), holder.view(), "settings")
		},
		OnQuit: func() {
			QuitApplication(func() {
				if closer, ok := agent.(interface{ Close() }); ok {
					closer.Close()
				}
			})
		},
	})
}
