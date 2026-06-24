//go:build !windows

package appui

func TryActivateExistingInstance() bool { return false }
