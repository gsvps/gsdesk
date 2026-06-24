//go:build windows

package appui

import (
	"strings"

	"github.com/clouddesk/agent/internal/config"
)

func getControllerToken(cfg *config.Config) string {
	if cfg == nil {
		return ""
	}
	return strings.TrimSpace(cfg.ControllerToken)
}

func saveControllerToken(cfg *config.Config, token string) actionResult {
	if cfg == nil {
		return actionResult{OK: false, Error: "配置未加载"}
	}
	cfg.ControllerToken = strings.TrimSpace(token)
	if err := cfg.Save(); err != nil {
		return actionResult{OK: false, Error: err.Error()}
	}
	return actionResult{OK: true}
}
