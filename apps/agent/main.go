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

func fatalStartup(msg string) {
	log.Print(msg)
	appui.ShowError(msg)
}

func main() {
	settingsFlag := flag.Bool("settings", false, "open CloudDesk client (device tab)")
	flag.Parse()

	logsetup.Init()
	platform.EnableDPIAwareness()
	appui.EnsureWebViewEnvironment()

	if appui.TryActivateExistingInstance() {
		log.Print("CloudDesk already running, restored existing window")
		return
	}

	if err := appui.EnsureDesktopRuntime(); err != nil {
		fatalStartup("无法准备运行环境:\n\n" + err.Error())
		return
	}

	cfg, err := config.Load()
	if err != nil {
		fatalStartup("加载配置失败: " + err.Error())
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
			fatalStartup("打开设置失败: " + err.Error())
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
