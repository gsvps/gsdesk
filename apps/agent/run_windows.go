//go:build windows && cgo

package main

import (
	"log"

	"github.com/gsvps/gsdesk/internal/agent"
	"github.com/gsvps/gsdesk/internal/appui"
	"github.com/gsvps/gsdesk/internal/tray"
)

func runPlatform(a *agent.Agent) {
	go func() {
		if err := a.ConnectIfEnabled(); err != nil {
			log.Printf("agent connect: %v", err)
		}
	}()

	log.Printf("GSDesk Client running, device=%s", a.DeviceID())
	cfg := a.Config()
	if cfg != nil {
		appui.ShowClientWindow(cfg, a.ApplyConfig, a, "control")
	}
	tray.Run(tray.Options{
		DeviceID: a.DeviceID(),
		IsOnline: a.IsOnline,
		OnOpenMain: func() {
			appui.ShowClientWindow(a.Config(), a.ApplyConfig, a, "control")
		},
		OnSettings: func() {
			appui.ShowClientWindow(a.Config(), a.ApplyConfig, a, "settings")
		},
		OnQuit: func() {
			appui.QuitApplication(a.Close)
		},
	})
}
