package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// DefaultInstallDir is the recommended installation directory on Windows.
const DefaultInstallDir = `D:\GSDesk`

func resolveDefaultInstallDir() string {
	if _, err := os.Stat(`D:\`); err == nil {
		return DefaultInstallDir
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return `C:\GSDesk`
	}
	return filepath.Join(home, "GSDesk")
}

type installMeta struct {
	Root    string `json:"root"`
	Version string `json:"version,omitempty"`
}

func readInstallMeta(path string) string {
	raw, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	var meta installMeta
	if err := json.Unmarshal(raw, &meta); err != nil {
		return ""
	}
	root := strings.TrimSpace(meta.Root)
	if root == "" {
		root = filepath.Dir(path)
	}
	return filepath.Clean(root)
}

func readInstallRoot() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	exeDir, err := filepath.Abs(filepath.Dir(exe))
	if err != nil {
		return ""
	}

	if root := readInstallMeta(filepath.Join(exeDir, "install.json")); root != "" {
		return root
	}

	defaultRoot, err := filepath.Abs(resolveDefaultInstallDir())
	if err != nil {
		return ""
	}
	if strings.EqualFold(filepath.Clean(exeDir), filepath.Clean(defaultRoot)) {
		if root := readInstallMeta(filepath.Join(defaultRoot, "install.json")); root != "" {
			return root
		}
	}
	return ""
}

// InstallRoot returns the installed application directory, or empty if portable/uninstalled.
func InstallRoot() string {
	return readInstallRoot()
}

// DataDir stores config.json, device keys, etc.
func DataDir() (string, error) {
	var dir string
	if root := readInstallRoot(); root != "" && RunningFromInstallDir() {
		dir = filepath.Join(root, "data")
	} else {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		dir = filepath.Join(home, ".gsdesk")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

// LogDir stores agent.log.
func LogDir() (string, error) {
	if root := readInstallRoot(); root != "" && RunningFromInstallDir() {
		dir := filepath.Join(root, "logs")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return "", err
		}
		return dir, nil
	}
	return DataDir()
}

// DefaultInstallDirectory returns the recommended install path for this machine.
func DefaultInstallDirectory() string {
	return resolveDefaultInstallDir()
}

// RunningFromInstallDir reports whether the current executable lives in InstallRoot.
func RunningFromInstallDir() bool {
	root := readInstallRoot()
	if root == "" {
		return false
	}
	exe, err := os.Executable()
	if err != nil {
		return false
	}
	exeDir, err := filepath.Abs(filepath.Dir(exe))
	if err != nil {
		return false
	}
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return false
	}
	return strings.EqualFold(filepath.Clean(exeDir), filepath.Clean(rootAbs))
}

// NeedsInstallSetup is deprecated; the client runs in portable mode without an install wizard.
func NeedsInstallSetup() bool {
	return false
}
