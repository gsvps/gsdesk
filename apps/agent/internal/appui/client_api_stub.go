//go:build !windows

package appui

import (
	"fmt"
	"log"

	"github.com/clouddesk/agent/internal/config"
)

func SetSkipBrowserOpenOnStart(_ bool) {}

func RunInstaller(cfg *config.Config, factory AgentFactory) error {
	return fmt.Errorf("install is only supported on Windows")
}

func ShowClientWindow(cfg *config.Config, save SaveFunc, agent AgentView, tab string) {
	log.Printf("client UI is only available on Windows")
}

func RunClientWindow(cfg *config.Config, save SaveFunc, agent AgentView, tab string) error {
	return fmt.Errorf("client UI is only available on Windows")
}

func ShowMainWindow(cfg *config.Config, save SaveFunc, agent AgentView) {
	ShowClientWindow(cfg, save, agent, "device")
}

func RunSettingsEditor(cfg *config.Config, save SaveFunc, agent AgentView) error {
	return RunClientWindow(cfg, save, agent, "device")
}
