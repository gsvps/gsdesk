//go:build windows

package clipboard

import "github.com/clouddesk/agent/internal/input"

func Paste() {
	input.KeyCombo("v", true, false, false)
}
