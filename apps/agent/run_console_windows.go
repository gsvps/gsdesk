//go:build windows && !cgo

package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/gsvps/gsdesk/internal/agent"
	"github.com/gsvps/gsdesk/internal/appui"
	"github.com/gsvps/gsdesk/internal/tray"
)

func runPlatform(a *agent.Agent) {
	go func() {
		if err := a.Run(); err != nil {
			log.Printf("agent stopped: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-stop
		a.Close()
		os.Exit(0)
	}()

	log.Printf("GSDesk Client running, device=%s", a.DeviceID())
	tray.Run(tray.Options{
		DeviceID: a.DeviceID(),
		IsOnline: a.IsOnline,
		OnOpenMain: func() {
			appui.ShowClientWindow(a.Config(), a.ApplyConfig, a, "control")
		},
		OnSettings: func() {
			appui.ShowClientWindow(a.Config(), a.ApplyConfig, a, "device")
		},
		OnQuit: func() { a.Close() },
	})
}
