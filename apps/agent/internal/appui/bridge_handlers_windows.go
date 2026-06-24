//go:build windows && !uiwebview

package appui

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/clouddesk/agent/internal/config"
	"github.com/clouddesk/agent/internal/install"
	"github.com/clouddesk/agent/internal/update"
	"github.com/sqweek/dialog"
)

var (
	installMu       sync.Mutex
	installProgress install.Progress
)

type bridgeSession struct {
	cfg              *config.Config
	holder           *agentHolder
	tab              string
	onInstallSuccess func(installDir string) error
	installDone      chan struct{}
}

func mountBridgeHandlers(mux *http.ServeMux, session *bridgeSession) {
	if session == nil {
		return
	}
	cfg := session.cfg
	holder := session.holder
	tab := session.tab

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

	writeJSON := func(w http.ResponseWriter, v any) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write([]byte(mustJSON(v)))
	}

	mux.HandleFunc("/__clouddesk/bridge/getRuntimeConfig", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		base := strings.TrimRight(strings.TrimSpace(cfg.ServerURL), "/")
		writeJSON(w, map[string]any{
			"mode":     "desktop",
			"apiBase":  base,
			"deviceId": cfg.DeviceID,
		})
	})

	mux.HandleFunc("/__clouddesk/bridge/getControllerTokenGo", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ok": true, "token": getControllerToken(cfg)})
	})

	mux.HandleFunc("/__clouddesk/bridge/saveControllerTokenGo", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Token string `json:"token"`
		}
		_ = json.Unmarshal(body, &req)
		token := req.Token
		if token == "" {
			token = strings.TrimSpace(string(body))
		}
		writeJSON(w, saveControllerToken(cfg, token))
	})

	mux.HandleFunc("/__clouddesk/bridge/notifyUIReadyGo", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, actionResult{OK: true})
	})

	mux.HandleFunc("/__clouddesk/bridge/getInitialState", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, buildUIState(cfg, agentView()))
	})

	mux.HandleFunc("/__clouddesk/bridge/refreshAgentStatus", func(w http.ResponseWriter, r *http.Request) {
		agent := agentView()
		if agent == nil {
			state := buildUIState(cfg, nil)
			writeJSON(w, actionResult{OK: true, Online: false, State: &state})
			return
		}
		state := buildUIState(cfg, agent)
		writeJSON(w, actionResult{OK: true, Online: state.Online, State: &state})
	})

	mux.HandleFunc("/__clouddesk/bridge/reconnectAgentGo", func(w http.ResponseWriter, r *http.Request) {
		agent := agentView()
		if agent == nil {
			writeJSON(w, actionResult{OK: false, Error: "Agent 服务未就绪"})
			return
		}
		if cfg.Settings.Normalized().AgentEnabledOn() {
			go agent.ForceReconnect()
		}
		state := buildUIState(cfg, agent)
		writeJSON(w, actionResult{OK: true, Online: state.Online, State: &state, Message: "正在连接…"})
	})

	mux.HandleFunc("/__clouddesk/bridge/copyText", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Text string `json:"text"`
		}
		_ = json.Unmarshal(body, &req)
		text := req.Text
		if text == "" {
			text = strings.TrimSpace(string(body))
		}
		if text == "" {
			writeJSON(w, actionResult{OK: false, Error: "内容为空"})
			return
		}
		if err := writeClipboard(text); err != nil {
			writeJSON(w, actionResult{OK: false, Error: err.Error()})
			return
		}
		writeJSON(w, actionResult{OK: true})
	})

	mux.HandleFunc("/__clouddesk/bridge/browseDownloadDirGo", func(w http.ResponseWriter, r *http.Request) {
		current := r.URL.Query().Get("current")
		writeJSON(w, browseDownloadDir(current))
	})

	mux.HandleFunc("/__clouddesk/bridge/generateOTPGo", func(w http.ResponseWriter, r *http.Request) {
		agent := agentView()
		if agent == nil {
			writeJSON(w, actionResult{OK: false, Error: "Agent 服务未就绪"})
			return
		}
		code, expiresIn, _, _ := agent.OTPStatus()
		if code != "" {
			writeJSON(w, actionResult{OK: true, Code: code, ExpiresIn: expiresIn})
			return
		}
		go func() {
			if err := agent.RefreshOTP(); err != nil {
				log.Printf("generate otp: %v", err)
			}
		}()
		writeJSON(w, actionResult{OK: true, Message: "正在生成一次性密码…"})
	})

	mux.HandleFunc("/__clouddesk/bridge/getOTPStatusGo", func(w http.ResponseWriter, r *http.Request) {
		agent := agentView()
		if agent == nil {
			writeJSON(w, actionResult{OK: false, Error: "Agent 服务未就绪"})
			return
		}
		code, expiresIn, idleMinutes, activeSessions := agent.OTPStatus()
		writeJSON(w, map[string]any{
			"ok":                       true,
			"code":                     code,
			"expires_in":               expiresIn,
			"otp_idle_refresh_minutes": idleMinutes,
			"active_sessions":          activeSessions,
		})
	})

	mux.HandleFunc("/__clouddesk/bridge/clearPermanentPasswordGo", func(w http.ResponseWriter, r *http.Request) {
		agent := agentView()
		if agent == nil {
			writeJSON(w, actionResult{OK: false, Error: "Agent 服务未就绪"})
			return
		}
		if err := agent.ClearPermanentPassword(); err != nil {
			writeJSON(w, actionResult{OK: false, Error: err.Error()})
			return
		}
		writeJSON(w, actionResult{OK: true, Message: "已清除自定义密码。"})
	})

	mux.HandleFunc("/__clouddesk/bridge/saveSettingsGo", func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var payload savePayload
		if err := json.Unmarshal(raw, &payload); err != nil {
			writeJSON(w, actionResult{OK: false, Error: err.Error()})
			return
		}
		writeJSON(w, applySave(cfg, saveFn(), agentView(), payload))
	})

	mux.HandleFunc("/__clouddesk/bridge/closeWindowGo", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, actionResult{OK: true, Message: "可在浏览器中关闭此标签页，Agent 仍在托盘运行"})
	})

	mux.HandleFunc("/__clouddesk/bridge/getInstallStateGo", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, install.GetState())
	})

	mux.HandleFunc("/__clouddesk/bridge/browseInstallDirGo", func(w http.ResponseWriter, r *http.Request) {
		current := r.URL.Query().Get("current")
		path, err := dialog.Directory().Title("选择 CloudDesk 安装目录").Browse()
		if err != nil || path == "" {
			if current != "" {
				writeJSON(w, current)
				return
			}
			writeJSON(w, install.GetState().DefaultDir)
			return
		}
		writeJSON(w, path)
	})

	mux.HandleFunc("/__clouddesk/bridge/runInstallGo", func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var req install.InstallRequest
		if err := json.Unmarshal(raw, &req); err != nil || strings.TrimSpace(req.InstallDir) == "" {
			req = install.InstallRequest{InstallDir: string(raw), CreateDesktopShortcut: true}
		}

		installMu.Lock()
		if installProgress.Running {
			installMu.Unlock()
			writeJSON(w, actionResult{OK: false, Error: "安装正在进行中"})
			return
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
			installProgress.InstallDir = result.InstallDir
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
			installDir := strings.TrimSpace(result.InstallDir)
			if session.onInstallSuccess != nil {
				if err := session.onInstallSuccess(installDir); err != nil {
					showError(err.Error())
				}
			}
			if session.installDone != nil {
				close(session.installDone)
			}
		}()

		writeJSON(w, map[string]any{"ok": true, "started": true})
	})

	mux.HandleFunc("/__clouddesk/bridge/getInstallProgressGo", func(w http.ResponseWriter, r *http.Request) {
		installMu.Lock()
		defer installMu.Unlock()
		writeJSON(w, installProgress)
	})

	mux.HandleFunc("/__clouddesk/bridge/getClientVersionGo", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ok": true, "version": update.CurrentVersion()})
	})

	mux.HandleFunc("/__clouddesk/bridge/checkUpdateGo", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, update.Check(cfg.ServerURL))
	})

	mux.HandleFunc("/__clouddesk/bridge/openExternalGo", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			URL string `json:"url"`
		}
		_ = json.Unmarshal(body, &req)
		target := req.URL
		if target == "" {
			target = strings.TrimSpace(string(body))
		}
		if err := update.OpenURL(target); err != nil {
			writeJSON(w, actionResult{OK: false, Error: err.Error()})
			return
		}
		writeJSON(w, actionResult{OK: true})
	})

	mux.HandleFunc("/__clouddesk/bridge/setWindowFullscreenGo", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ok": true, "fullscreen": false})
	})

	mux.HandleFunc("/__clouddesk/bridge/isWindowFullscreenGo", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ok": true, "fullscreen": false})
	})
}

func defaultInstallSuccess(installDir string) error {
	installDir = strings.TrimSpace(installDir)
	if installDir == "" {
		return fmt.Errorf("安装目录无效")
	}
	installedExe := install.InstalledExePath(installDir)
	if _, err := os.Stat(installedExe); err != nil {
		return fmt.Errorf("未找到已安装程序: %s", installedExe)
	}
	go func() {
		time.Sleep(400 * time.Millisecond)
		cmd := exec.Command(installedExe)
		cmd.Dir = installDir
		if err := cmd.Start(); err != nil {
			showError("安装完成，但无法启动 CloudDesk:\n" + err.Error() + "\n\n请手动运行:\n" + installedExe)
			return
		}
		exitApplication(nil)
	}()
	return nil
}
