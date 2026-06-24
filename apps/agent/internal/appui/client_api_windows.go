//go:build windows

package appui

import "github.com/clouddesk/agent/internal/config"

type AgentFactory func(*config.Config) (AgentView, SaveFunc, error)

// RunInstaller shows the first-run wizard and continues in the same window after install.
func RunInstaller(cfg *config.Config, factory AgentFactory) error {
	return runBootstrapClient(cfg, factory)
}

// QuitClientWindow closes the active UI window (including when hidden to tray).
func QuitClientWindow() {
	quitActiveClientWindow()
}

// ShowClientWindow opens the unified CloudDesk client UI (control + agent tabs).
func ShowClientWindow(cfg *config.Config, save SaveFunc, agent AgentView, tab string) {
	showClientWindow(cfg, save, agent, tab, false)
}

// ShowError displays a native error dialog (GUI builds have no console).
func ShowError(msg string) {
	showError(msg)
}

// RunClientWindow opens the unified UI and blocks until the window closes.
func RunClientWindow(cfg *config.Config, save SaveFunc, agent AgentView, tab string) error {
	return runClientWindow(cfg, newAgentHolder(agent, save), tab, true, clientWindowOpts{hideUntilReady: true})
}

// ShowMainWindow opens the client UI on the device tab (legacy alias).
func ShowMainWindow(cfg *config.Config, save SaveFunc, agent AgentView) {
	ShowClientWindow(cfg, save, agent, "device")
}

// RunSettingsEditor opens the client UI on the device tab (legacy alias).
func RunSettingsEditor(cfg *config.Config, save SaveFunc, agent AgentView) error {
	return RunClientWindow(cfg, save, agent, "device")
}
