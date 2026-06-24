//go:build !windows

package install

import "github.com/clouddesk/agent/internal/config"

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

type InstallRequest struct {
	InstallDir            string `json:"install_dir"`
	CreateDesktopShortcut bool   `json:"create_desktop_shortcut"`
}

func RunInstall(targetDir string) Result {
	return RunInstallWithOptions(InstallRequest{InstallDir: targetDir, CreateDesktopShortcut: true}, nil)
}

func GetState() State {
	return State{DefaultDir: config.DefaultInstallDir}
}

func BrowseInstallDir(current string) string { return current }

func RunInstallWithOptions(req InstallRequest, onProgress ProgressFunc) Result {
	return Result{OK: false, Error: "install is only supported on Windows"}
}

func HasWebView2Runtime() bool { return true }

func EnsureWebView2Runtime(packagesDir string, onProgress ProgressFunc) error { return nil }
