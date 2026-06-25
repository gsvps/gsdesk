//go:build !windows

package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/gsvps/gsdesk/internal/agent"
)

func runPlatform(a *agent.Agent) {
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		if err := a.Run(); err != nil {
			log.Fatalf("agent stopped: %v", err)
		}
	}()

	log.Printf("GSDesk Agent running, device=%s", a.DeviceID())
	<-stop
	a.Close()
	log.Println("GSDesk Agent stopped")
}
