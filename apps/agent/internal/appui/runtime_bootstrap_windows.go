//go:build windows && uiwebview

package appui

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/clouddesk/agent/internal/install"
)

const webView2DownloadURL = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"

// EnsureDesktopRuntime installs WebView2 when missing so the native UI can start.
func EnsureDesktopRuntime() error {
	if install.HasWebView2Runtime() {
		return nil
	}

	showInfo("CloudDesk 首次运行需要 Microsoft Edge WebView2 运行库。\n\n正在自动下载并安装，可能需要 1–3 分钟，请稍候…")

	packagesDir := filepath.Join(os.TempDir(), "clouddesk-bootstrap", "packages")
	if err := os.MkdirAll(packagesDir, 0o755); err != nil {
		return fmt.Errorf("创建临时目录失败: %w", err)
	}

	err := install.EnsureWebView2Runtime(packagesDir, func(step string, percent int) {
		log.Printf("webview2 bootstrap: %s (%d%%)", step, percent)
	})
	if err != nil {
		return fmt.Errorf("%w\n\n请手动下载安装：\n%s", err, webView2DownloadURL)
	}
	return nil
}
