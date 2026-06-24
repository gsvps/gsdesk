//go:build windows && !uiwebview

package appui

func EnsureDesktopRuntime() error {
	return nil
}
