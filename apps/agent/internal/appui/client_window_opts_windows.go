//go:build windows

package appui

import "time"

type clientWindowOpts struct {
	hideUntilReady bool
	uiReadyTimeout time.Duration
}
