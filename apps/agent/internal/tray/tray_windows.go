//go:build windows && cgo

package tray

import (
	"fmt"
	"time"

	"github.com/getlantern/systray"
)

type Options struct {
	DeviceID   string
	IsOnline   func() bool
	OnOpenMain func()
	OnSettings func()
	OnQuit     func()
}

func Run(opts Options) {
	systray.Run(
		func() { onReady(opts) },
		func() {
			if opts.OnQuit != nil {
				opts.OnQuit()
			}
		},
	)
}

func onReady(opts Options) {
	systray.SetIcon(iconData)
	systray.SetTitle("CloudDesk")
	systray.SetTooltip(fmt.Sprintf("CloudDesk\nDevice: %s", opts.DeviceID))

	deviceItem := systray.AddMenuItem(fmt.Sprintf("设备 ID: %s", opts.DeviceID), "")
	deviceItem.Disable()

	statusItem := systray.AddMenuItem("状态: 连接中...", "Connection status")
	statusItem.Disable()

	systray.AddSeparator()
	mainItem := systray.AddMenuItem("打开主界面", "Open CloudDesk")
	settingsItem := systray.AddMenuItem("设置", "Open settings")
	systray.AddSeparator()
	quitItem := systray.AddMenuItem("退出", "Quit CloudDesk")

	go func() {
		ticker := time.NewTicker(3 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if opts.IsOnline != nil && opts.IsOnline() {
					statusItem.SetTitle("状态: 在线")
				} else {
					statusItem.SetTitle("状态: 离线")
				}
			case <-mainItem.ClickedCh:
				if opts.OnOpenMain != nil {
					opts.OnOpenMain()
				}
			case <-settingsItem.ClickedCh:
				if opts.OnSettings != nil {
					opts.OnSettings()
				}
			case <-quitItem.ClickedCh:
				systray.Quit()
				return
			}
		}
	}()
}
