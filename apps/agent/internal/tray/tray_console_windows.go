//go:build windows && !cgo

package tray

import "log"

type Options struct {
	DeviceID   string
	IsOnline   func() bool
	OnOpenMain func()
	OnSettings func()
	OnQuit     func()
}

// Run blocks until OnQuit in console mode (no systray without CGO).
func Run(opts Options) {
	log.Printf("CloudDesk Agent (console mode), device=%s", opts.DeviceID)
	log.Printf("打开设置: clouddesk-agent.exe --settings")
	log.Printf("Press Ctrl+C in the terminal to quit")
	select {}
}
