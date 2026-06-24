package config

import (
	"os"
	"path/filepath"
	"strings"
)

// AgentSettings are user preferences persisted in config.json.
type AgentSettings struct {
	DefaultQuality   string `json:"default_quality,omitempty"` // low | medium | high | ultra | 4k
	AutoAccept       *bool  `json:"auto_accept,omitempty"`
	ClipboardSync    *bool  `json:"clipboard_sync,omitempty"` // nil = enabled
	LaunchAtStartup  bool   `json:"launch_at_startup,omitempty"`
	StartMinimized   bool   `json:"start_minimized,omitempty"`
	DownloadDir      string `json:"download_dir,omitempty"`
	AgentEnabled            *bool `json:"agent_enabled,omitempty"`
	OTPIdleRefreshMinutes   *int  `json:"otp_idle_refresh_minutes,omitempty"`
	CloseToTray             *bool `json:"close_to_tray,omitempty"`
}

func (s AgentSettings) OTPIdleRefreshMinutesOrDefault() int {
	if s.OTPIdleRefreshMinutes == nil || *s.OTPIdleRefreshMinutes < 1 {
		return 5
	}
	if *s.OTPIdleRefreshMinutes > 120 {
		return 120
	}
	return *s.OTPIdleRefreshMinutes
}

func (s AgentSettings) AgentEnabledOn() bool {
	if s.AgentEnabled == nil {
		return true
	}
	return *s.AgentEnabled
}

func (s AgentSettings) CloseToTrayOn() bool {
	if s.CloseToTray == nil {
		return true
	}
	return *s.CloseToTray
}

func (s AgentSettings) AutoAcceptOn() bool {
	if s.AutoAccept == nil {
		return true
	}
	return *s.AutoAccept
}

func (s AgentSettings) ClipboardEnabled() bool {
	if s.ClipboardSync == nil {
		return true
	}
	return *s.ClipboardSync
}

func (s AgentSettings) DownloadDirectory() string {
	dir := strings.TrimSpace(s.DownloadDir)
	if dir != "" {
		return dir
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "Downloads"
	}
	return filepath.Join(home, "Downloads")
}

func DefaultDownloadDirectory() string {
	return DefaultAgentSettings().DownloadDirectory()
}

func DefaultAgentSettings() AgentSettings {
	enabled := true
	agentOn := true
	otpIdle := 5
	closeTray := false
	autoAccept := true
	return AgentSettings{
		DefaultQuality:          "high",
		AutoAccept:              &autoAccept,
		ClipboardSync:           &enabled,
		AgentEnabled:            &agentOn,
		OTPIdleRefreshMinutes:   &otpIdle,
		CloseToTray:             &closeTray,
	}
}

func (s AgentSettings) Normalized() AgentSettings {
	out := s
	if out.DefaultQuality == "" {
		out.DefaultQuality = "high"
	}
	if out.ClipboardSync == nil {
		enabled := true
		out.ClipboardSync = &enabled
	}
	if out.AgentEnabled == nil {
		on := true
		out.AgentEnabled = &on
	}
	if out.OTPIdleRefreshMinutes == nil {
		minutes := 5
		out.OTPIdleRefreshMinutes = &minutes
	}
	if out.CloseToTray == nil {
		closeTray := false
		out.CloseToTray = &closeTray
	}
	out.DownloadDir = strings.TrimSpace(out.DownloadDir)
	return out
}
