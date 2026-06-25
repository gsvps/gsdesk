//go:build windows && uiwebview

package appui

import (
	"os"
	"path/filepath"
	"sync"

	"github.com/gsvps/gsdesk/internal/config"
)

var webViewEnvOnce sync.Once

// EnsureWebViewEnvironment sets a stable WebView2 user data folder so localStorage persists.
func EnsureWebViewEnvironment() {
	webViewEnvOnce.Do(func() {
		dir, err := config.DataDir()
		if err != nil {
			return
		}
		udf := filepath.Join(dir, "webview2")
		_ = os.MkdirAll(udf, 0o755)
		_ = os.Setenv("WEBVIEW2_USER_DATA_FOLDER", udf)
	})
}
