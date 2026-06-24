//go:build windows

package appui

import (
	"encoding/json"
	"log"
	"sync"
	"syscall"
	"unsafe"

	"github.com/clouddesk/agent/internal/config"
	"github.com/sqweek/dialog"
)

var uiMu sync.Mutex
var windowMu sync.Mutex
var windowOpen bool

type uiState struct {
	DeviceID         string `json:"device_id"`
	Online           bool   `json:"online"`
	ServerURL        string `json:"server_url"`
	DeviceName       string `json:"device_name"`
	DefaultQuality   string `json:"default_quality"`
	ClipboardEnabled bool   `json:"clipboard_enabled"`
	DownloadDir      string `json:"download_dir"`
	AutoAccept       bool   `json:"auto_accept"`
	LaunchAtStartup  bool   `json:"launch_at_startup"`
	StartMinimized   bool   `json:"start_minimized"`
	AgentEnabled            bool   `json:"agent_enabled"`
	OTPIdleRefreshMinutes   int    `json:"otp_idle_refresh_minutes"`
	CloseToTray             bool   `json:"close_to_tray"`
	ConfigPath              string `json:"config_path"`
	InstallPath      string `json:"install_path"`
	AgentReady       bool   `json:"agent_ready"`
	LastError        string `json:"last_error,omitempty"`
}

type savePayload struct {
	ServerURL              string `json:"server_url"`
	DeviceName             string `json:"device_name"`
	DefaultQuality         string `json:"default_quality"`
	ClipboardEnabled       bool   `json:"clipboard_enabled"`
	DownloadDir            string `json:"download_dir"`
	AutoAccept             bool   `json:"auto_accept"`
	LaunchAtStartup        bool   `json:"launch_at_startup"`
	StartMinimized         bool   `json:"start_minimized"`
	PermanentPassword      string `json:"permanent_password"`
	ClearPermanentPassword bool   `json:"clear_permanent_password"`
	AgentEnabled           bool   `json:"agent_enabled"`
	OTPIdleRefreshMinutes  int    `json:"otp_idle_refresh_minutes"`
	CloseToTray            bool   `json:"close_to_tray"`
}

type actionResult struct {
	OK        bool     `json:"ok"`
	Error     string   `json:"error,omitempty"`
	Message   string   `json:"message,omitempty"`
	Code      string   `json:"code,omitempty"`
	ExpiresIn int      `json:"expires_in,omitempty"`
	State     *uiState `json:"state,omitempty"`
	Online    bool     `json:"online,omitempty"`
}

func buildUIState(cfg *config.Config, agent AgentView) uiState {
	settings := cfg.Settings.Normalized()
	path, _ := cfg.ConfigPath()
	online := agent != nil && agent.IsOnline()
	deviceID := cfg.DeviceID
	if agent != nil {
		if id := agent.DeviceID(); id != "" {
			deviceID = id
		}
	}
	state := uiState{
		DeviceID:         deviceID,
		Online:           online,
		ServerURL:        cfg.ServerURL,
		DeviceName:       cfg.DeviceName,
		DefaultQuality:   settings.DefaultQuality,
		ClipboardEnabled: settings.ClipboardEnabled(),
		DownloadDir:      settings.DownloadDirectory(),
		AutoAccept:       settings.AutoAccept,
		LaunchAtStartup:  settings.LaunchAtStartup,
		StartMinimized:   settings.StartMinimized,
		AgentEnabled:            settings.AgentEnabledOn(),
		OTPIdleRefreshMinutes:   settings.OTPIdleRefreshMinutesOrDefault(),
		CloseToTray:             settings.CloseToTrayOn(),
		ConfigPath:              path,
		InstallPath:      cfg.InstallPath(),
		AgentReady:       agent != nil,
	}
	if agent != nil {
		state.LastError = agent.LastError()
	}
	return state
}

func applySave(cfg *config.Config, save SaveFunc, agent AgentView, payload savePayload) actionResult {
	next := *cfg
	next.ServerURL = payload.ServerURL
	next.DeviceName = payload.DeviceName
	clip := payload.ClipboardEnabled
	downloadDir := payload.DownloadDir
	if downloadDir == config.DefaultDownloadDirectory() {
		downloadDir = ""
	}
	next.Settings = config.AgentSettings{
		DefaultQuality:        normalizeQuality(payload.DefaultQuality),
		AutoAccept:            payload.AutoAccept,
		ClipboardSync:         &clip,
		LaunchAtStartup:       payload.LaunchAtStartup,
		StartMinimized:        payload.StartMinimized,
		DownloadDir:           downloadDir,
		OTPIdleRefreshMinutes: otpIdleMinutes(payload.OTPIdleRefreshMinutes),
	}
	next.Settings.AgentEnabled = &payload.AgentEnabled
	next.Settings.CloseToTray = &payload.CloseToTray

	if save == nil {
		return actionResult{OK: false, Error: "保存处理器未配置"}
	}
	if err := save(&next); err != nil {
		return actionResult{OK: false, Error: err.Error()}
	}

	if agent != nil {
		if payload.ClearPermanentPassword {
			go func() {
				if err := agent.ClearPermanentPassword(); err != nil {
					log.Printf("clear permanent password: %v", err)
				}
			}()
		} else if pwd := payload.PermanentPassword; pwd != "" {
			if len(pwd) < 4 {
				return actionResult{OK: false, Error: "永久密码至少 4 位"}
			}
			password := pwd
			go func() {
				if err := agent.SetPermanentPassword(password); err != nil {
					log.Printf("set permanent password: %v", err)
				}
			}()
		}
	}

	*cfg = next
	state := buildUIState(cfg, agent)
	msg := "设置已保存，Agent 正在后台连接…"
	return actionResult{
		OK:      true,
		Message: msg,
		State:   &state,
		Online:  state.Online,
	}
}

func browseDownloadDir(current string) string {
	path, err := dialog.Directory().Title("选择文件下载保存目录").Browse()
	if err != nil || path == "" {
		return current
	}
	return path
}

func mustJSON(v any) string {
	raw, err := json.Marshal(v)
	if err != nil {
		return `{"ok":false,"error":"json marshal failed"}`
	}
	return string(raw)
}

func showError(msg string) {
	showMessageBox(msg, 0x00000010)
}

func showInfo(msg string) {
	showMessageBox(msg, 0x00000040)
}

func showMessageBox(msg string, icon uint32) {
	title, _ := syscall.UTF16PtrFromString("CloudDesk")
	text, _ := syscall.UTF16PtrFromString(msg)
	user32 := syscall.NewLazyDLL("user32.dll")
	messageBoxW := user32.NewProc("MessageBoxW")
	messageBoxW.Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), uintptr(icon))
}

func writeClipboard(text string) error {
	utf16, err := syscall.UTF16FromString(text)
	if err != nil {
		return err
	}
	size := len(utf16) * 2
	user32 := syscall.NewLazyDLL("user32.dll")
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	openClipboard := user32.NewProc("OpenClipboard")
	closeClipboard := user32.NewProc("CloseClipboard")
	emptyClipboard := user32.NewProc("EmptyClipboard")
	setClipboardData := user32.NewProc("SetClipboardData")
	globalAlloc := kernel32.NewProc("GlobalAlloc")
	globalLock := kernel32.NewProc("GlobalLock")
	globalUnlock := kernel32.NewProc("GlobalUnlock")

	r, _, _ := openClipboard.Call(0)
	if r == 0 {
		return syscall.EINVAL
	}
	defer closeClipboard.Call()
	emptyClipboard.Call()

	mem, _, _ := globalAlloc.Call(0x0002, uintptr(size))
	if mem == 0 {
		return syscall.ENOMEM
	}
	ptr, _, _ := globalLock.Call(mem)
	for i, ch := range utf16 {
		*(*uint16)(unsafe.Pointer(ptr + uintptr(i*2))) = ch
	}
	globalUnlock.Call(mem)
	r, _, _ = setClipboardData.Call(13, mem)
	if r == 0 {
		return syscall.EINVAL
	}
	return nil
}

func otpIdleMinutes(v int) *int {
	if v < 1 {
		v = 5
	}
	if v > 120 {
		v = 120
	}
	return &v
}

func normalizeQuality(q string) string {
	switch q {
	case "low", "medium", "high", "ultra":
		return q
	default:
		return "ultra"
	}
}
