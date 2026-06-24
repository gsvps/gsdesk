//go:build windows && cgo

package tray

import _ "embed"

//go:embed icon.ico
var iconData []byte
