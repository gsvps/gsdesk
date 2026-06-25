//go:build windows

package ui

import (
	"fmt"
	"syscall"
	"unsafe"
)

var (
	user32         = syscall.NewLazyDLL("user32.dll")
	messageBoxW    = user32.NewProc("MessageBoxW")
	mbYesNo        = uintptr(0x00000004)
	mbIconQuestion = uintptr(0x00000020)
	idYes          = uintptr(6)
)

func PromptAccept(sessionID string) bool {
	title, _ := syscall.UTF16PtrFromString("GSDesk")
	text, _ := syscall.UTF16PtrFromString(
		fmt.Sprintf("有远程连接请求，是否允许？\n\n会话 ID: %s", sessionID),
	)
	ret, _, _ := messageBoxW.Call(
		0,
		uintptr(unsafe.Pointer(text)),
		uintptr(unsafe.Pointer(title)),
		mbYesNo|mbIconQuestion,
	)
	return ret == idYes
}
