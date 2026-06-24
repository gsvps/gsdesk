package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// DefaultInstallDir is the recommended installation directory on Windows.
const DefaultInstallDir = `D:\CloudDesk`

type installMeta struct {
	Root    string `json:"root"`
	Version string `json:"version,omitempty"`
}

func readInstallRoot() string {
	candidates := []string{
		filepath.Join(DefaultInstallDir, "install.json"),
	}
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "install.json"))
	}
	for _, marker := range candidates {
		raw, err := os.ReadFile(marker)
		if err != nil {
			continue
		}
		var meta installMeta
		if err := json.Unmarshal(raw, &meta); err != nil {
			continue
		}
		root := strings.TrimSpace(meta.Root)
		if root == "" {
			root = filepath.Dir(marker)
		}
		return filepath.Clean(root)
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
	if root := readInstallRoot(); root != "" {
		dir = filepath.Join(root, "data")
	} else {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		dir = filepath.Join(home, ".clouddesk")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

// LogDir stores agent.log.
func LogDir() (string, error) {
	if root := readInstallRoot(); root != "" {
		dir := filepath.Join(root, "logs")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return "", err
		}
		return dir, nil
	}
	return DataDir()
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

// NeedsInstallSetup is true when the unified client has not been installed to disk yet.
func NeedsInstallSetup() bool {
	return readInstallRoot() == "" || !RunningFromInstallDir()
}
