//go:build windows

package clipboard

import "github.com/gsvps/gsdesk/internal/input"

func Paste() {
	input.KeyCombo("v", true, false, false)
}
