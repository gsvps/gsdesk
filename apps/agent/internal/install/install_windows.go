//go:build windows

package install

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/clouddesk/agent/internal/config"
	"github.com/clouddesk/agent/internal/netutil"
	"github.com/clouddesk/agent/internal/version"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const webView2BootstrapURL = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"

type State struct {
	Installed   bool   `json:"installed"`
	InstallDir  string `json:"install_dir"`
	DefaultDir  string `json:"default_dir"`
	RunningFrom bool   `json:"running_from_install_dir"`
	NeedsSetup  bool   `json:"needs_setup"`
}

type Result struct {
	OK         bool   `json:"ok"`
	Error      string `json:"error,omitempty"`
	Message    string `json:"message,omitempty"`
	InstallDir string `json:"install_dir,omitempty"`
	Relaunch   bool   `json:"relaunch,omitempty"`
}

func GetState() State {
	root := config.InstallRoot()
	return State{
		Installed:   root != "",
		InstallDir:  root,
		DefaultDir:  config.DefaultInstallDirectory(),
		RunningFrom: config.RunningFromInstallDir(),
		NeedsSetup:  config.NeedsInstallSetup(),
	}
}

func BrowseInstallDir(current string) string {
	if strings.TrimSpace(current) == "" {
		current = config.DefaultInstallDirectory()
	}
	// Native folder picker is bound in appui; fallback to default.
	return current
}

// InstalledExePath returns the installed CloudDesk executable path.
func InstalledExePath(installDir string) string {
	return filepath.Join(filepath.Clean(strings.TrimSpace(installDir)), "CloudDesk.exe")
}

type InstallRequest struct {
	InstallDir            string `json:"install_dir"`
	CreateDesktopShortcut bool   `json:"create_desktop_shortcut"`
}

func RunInstall(targetDir string) Result {
	return RunInstallWithOptions(InstallRequest{
		InstallDir:            targetDir,
		CreateDesktopShortcut: true,
	}, nil)
}

func RunInstallWithOptions(req InstallRequest, onProgress ProgressFunc) Result {
	targetDir := strings.TrimSpace(req.InstallDir)
	if targetDir == "" {
		targetDir = config.DefaultInstallDirectory()
	}
	targetDir = filepath.Clean(targetDir)

	report(onProgress, "正在创建目录…", 8)
	if err := os.MkdirAll(filepath.Join(targetDir, "data"), 0o755); err != nil {
		return Result{OK: false, Error: err.Error()}
	}
	if err := os.MkdirAll(filepath.Join(targetDir, "logs"), 0o755); err != nil {
		return Result{OK: false, Error: err.Error()}
	}
	if err := os.MkdirAll(filepath.Join(targetDir, "packages"), 0o755); err != nil {
		return Result{OK: false, Error: err.Error()}
	}

	exe, err := os.Executable()
	if err != nil {
		return Result{OK: false, Error: err.Error()}
	}
	destExe := filepath.Join(targetDir, "CloudDesk.exe")
	if !samePath(exe, destExe) {
		report(onProgress, "正在复制程序…", 22)
		if err := copyFile(exe, destExe); err != nil {
			return Result{OK: false, Error: "复制程序失败: " + err.Error()}
		}
	}

	report(onProgress, "正在迁移配置…", 34)
	if err := migrateLegacyData(targetDir); err != nil {
		return Result{OK: false, Error: "迁移配置失败: " + err.Error()}
	}

	report(onProgress, "正在写入安装信息…", 42)
	meta := map[string]string{
		"root":    targetDir,
		"version": version.Version,
	}
	raw, _ := json.MarshalIndent(meta, "", "  ")
	if err := os.WriteFile(filepath.Join(targetDir, "install.json"), raw, 0o644); err != nil {
		return Result{OK: false, Error: err.Error()}
	}

	report(onProgress, "正在检查 WebView2 运行库…", 50)
	if err := ensureWebView2Runtime(filepath.Join(targetDir, "packages"), onProgress); err != nil {
		return Result{OK: false, Error: err.Error()}
	}

	if req.CreateDesktopShortcut {
		report(onProgress, "正在创建桌面快捷方式…", 90)
		if err := createDesktopShortcut(destExe, targetDir); err != nil {
			return Result{OK: false, Error: "创建桌面快捷方式失败: " + err.Error()}
		}
	}

	report(onProgress, "正在启动 CloudDesk…", 98)
	report(onProgress, "安装完成", 100)
	return Result{
		OK:         true,
		Message:    "安装完成，正在启动 CloudDesk…",
		InstallDir: targetDir,
		Relaunch:   true,
	}
}

func migrateLegacyData(targetDir string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	legacyDir := filepath.Join(home, ".clouddesk")
	destDir := filepath.Join(targetDir, "data")
	for _, name := range []string{"config.json", "device.key"} {
		src := filepath.Join(legacyDir, name)
		dst := filepath.Join(destDir, name)
		if _, err := os.Stat(dst); err == nil {
			continue
		}
		if _, err := os.Stat(src); err != nil {
			continue
		}
		if err := copyFile(src, dst); err != nil {
			return err
		}
	}
	return nil
}

func ensureWebView2Runtime(packagesDir string, onProgress ProgressFunc) error {
	return EnsureWebView2Runtime(packagesDir, onProgress)
}

// EnsureWebView2Runtime downloads and installs WebView2 when it is missing.
func EnsureWebView2Runtime(packagesDir string, onProgress ProgressFunc) error {
	if hasWebView2Runtime() {
		report(onProgress, "WebView2 运行库已就绪", 82)
		return nil
	}
	installer := filepath.Join(packagesDir, "MicrosoftEdgeWebview2Setup.exe")
	if _, err := os.Stat(installer); err != nil {
		report(onProgress, "正在下载 WebView2 运行库…", 55)
		if err := downloadFile(webView2BootstrapURL, installer, func(pct int) {
			report(onProgress, "正在下载 WebView2 运行库…", 55+pct*25/100)
		}); err != nil {
			return fmt.Errorf("下载 WebView2 运行库失败: %w", err)
		}
	}
	report(onProgress, "正在安装 WebView2 运行库…", 82)
	cmd := exec.Command(installer, "/silent", "/install")
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	setCmdHideWindow(cmd)
	_ = cmd.Run()
	if !hasWebView2Runtime() {
		return fmt.Errorf("WebView2 运行库未就绪，请手动安装 Microsoft Edge WebView2 Runtime")
	}
	report(onProgress, "WebView2 运行库已就绪", 85)
	return nil
}

func hasWebView2Runtime() bool {
	return HasWebView2Runtime()
}

// HasWebView2Runtime reports whether the Edge WebView2 runtime is installed.
func HasWebView2Runtime() bool {
	paths := []string{
		filepath.Join(os.Getenv("ProgramFiles(x86)"), "Microsoft", "EdgeWebView", "Application"),
		filepath.Join(os.Getenv("ProgramFiles"), "Microsoft", "EdgeWebView", "Application"),
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return true
		}
	}
	key, err := registry.OpenKey(
		registry.LOCAL_MACHINE,
		`SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`,
		registry.QUERY_VALUE,
	)
	if err == nil {
		defer key.Close()
		if pv, _, err := key.GetStringValue("pv"); err == nil && pv != "" && pv != "0.0.0.0" {
			return true
		}
	}
	return false
}

func downloadFile(url, dest string, onProgress func(percent int)) error {
	client := netutil.NewHTTPClient(10 * time.Minute)
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	tmp := dest + ".download"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	reader := io.Reader(resp.Body)
	total := resp.ContentLength
	if total > 0 && onProgress != nil {
		reader = &progressReader{reader: resp.Body, total: total, onProgress: onProgress}
	}
	if _, err := io.Copy(out, reader); err != nil {
		out.Close()
		_ = os.Remove(tmp)
		return err
	}
	out.Close()
	if onProgress != nil {
		onProgress(100)
	}
	return os.Rename(tmp, dest)
}

type progressReader struct {
	reader     io.Reader
	total      int64
	read       int64
	lastPct    int
	onProgress func(percent int)
}

func (p *progressReader) Read(b []byte) (int, error) {
	n, err := p.reader.Read(b)
	if n > 0 {
		p.read += int64(n)
		if p.total > 0 && p.onProgress != nil {
			pct := int(p.read * 100 / p.total)
			if pct > 100 {
				pct = 100
			}
			if pct != p.lastPct {
				p.lastPct = pct
				p.onProgress(pct)
			}
		}
	}
	return n, err
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func samePath(a, b string) bool {
	aa, err1 := filepath.Abs(a)
	bb, err2 := filepath.Abs(b)
	if err1 != nil || err2 != nil {
		return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
	}
	return strings.EqualFold(filepath.Clean(aa), filepath.Clean(bb))
}

func createDesktopShortcut(exePath, workDir string) error {
	desktop := filepath.Join(os.Getenv("USERPROFILE"), "Desktop")
	if err := os.MkdirAll(desktop, 0o755); err != nil {
		return err
	}
	lnk := filepath.Join(desktop, "CloudDesk.lnk")
	script := fmt.Sprintf(
		"$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%s');$s.TargetPath='%s';$s.WorkingDirectory='%s';$s.Save()",
		escapePSSingleQuoted(lnk),
		escapePSSingleQuoted(exePath),
		escapePSSingleQuoted(workDir),
	)
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	setCmdHideWindow(cmd)
	return cmd.Run()
}

func setCmdHideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: windows.CREATE_NO_WINDOW,
	}
}

func escapePSSingleQuoted(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}
