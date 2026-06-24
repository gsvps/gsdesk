package main

import (
	"flag"
	"log"
	"os"

	"github.com/clouddesk/agent/internal/agent"
	"github.com/clouddesk/agent/internal/appui"
	"github.com/clouddesk/agent/internal/config"
	"github.com/clouddesk/agent/internal/logsetup"
	"github.com/clouddesk/agent/internal/platform"
)

func main() {
	settingsFlag := flag.Bool("settings", false, "open CloudDesk client (device tab)")
	flag.Parse()

	logsetup.Init()
	platform.EnableDPIAwareness()
	appui.EnsureWebViewEnvironment()
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	if config.NeedsInstallSetup() {
		if err := appui.RunInstaller(cfg, func(c *config.Config) (appui.AgentView, appui.SaveFunc, error) {
			a, err := agent.New(c)
			if err != nil {
				return nil, nil, err
			}
			if err := a.ConnectIfEnabled(); err != nil {
				log.Printf("agent connect: %v", err)
			}
			return a, a.ApplyConfig, nil
		}); err != nil {
			log.Fatalf("install: %v", err)
		}
		return
	}

	if *settingsFlag {
		if err := appui.RunClientWindow(cfg, func(next *config.Config) error {
			next.Settings = next.Settings.Normalized()
			if err := platform.SetAutostart(next.Settings.LaunchAtStartup); err != nil {
				return err
			}
			return next.Save()
		}, nil, "device"); err != nil {
			log.Fatalf("client UI: %v", err)
		}
		return
	}

	a, err := agent.New(cfg)
	if err != nil {
		log.Printf("init agent: %v", err)
		appui.ShowError("启动失败: " + err.Error() + "\n\n请查看 logs/agent.log")
		return
	}

	runPlatform(a)
	os.Exit(0)
}
