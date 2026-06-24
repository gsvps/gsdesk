//go:build !windows

package ui

import "log"

func PromptAccept(sessionID string) bool {
	log.Printf("[dev] auto-accept connection session=%s", sessionID)
	return true
}
