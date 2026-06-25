//go:build windows

package input

import (
	"encoding/json"
	"log"
	"syscall"
)

var (
	user32           = syscall.NewLazyDLL("user32.dll")
	procSetCursorPos = user32.NewProc("SetCursorPos")
	procMouseEvent   = user32.NewProc("mouse_event")
	procKeybdEvent   = user32.NewProc("keybd_event")
	procVkKeyScanW   = user32.NewProc("VkKeyScanW")
)

const (
	mouseeventfLeftDown   = 0x0002
	mouseeventfLeftUp     = 0x0004
	mouseeventfRightDown  = 0x0008
	mouseeventfRightUp    = 0x0010
	mouseeventfMiddleDown = 0x0020
	mouseeventfMiddleUp   = 0x0040
	keyeventfKeyUp        = 0x0002
)

func HandleControl(data []byte) {
	var base struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &base); err != nil {
		return
	}

	switch base.Type {
	case "mouse_move":
		var msg struct {
			X int `json:"x"`
			Y int `json:"y"`
		}
		if err := json.Unmarshal(data, &msg); err == nil {
			dx, dy := mapToDesktop(msg.X, msg.Y)
			setCursorPos(dx, dy)
		}
	case "mouse_click":
		var msg struct {
			Button string `json:"button"`
			Action string `json:"action"`
			X      int    `json:"x"`
			Y      int    `json:"y"`
		}
		if err := json.Unmarshal(data, &msg); err != nil {
			return
		}
		dx, dy := mapToDesktop(msg.X, msg.Y)
		setCursorPos(dx, dy)
		mouseClick(msg.Button, msg.Action)
	case "key_press":
		var msg struct {
			Key   string `json:"key"`
			Ctrl  bool   `json:"ctrl"`
			Alt   bool   `json:"alt"`
			Shift bool   `json:"shift"`
		}
		if err := json.Unmarshal(data, &msg); err != nil {
			return
		}
		keyPress(msg.Key, msg.Ctrl, msg.Alt, msg.Shift)
	default:
		log.Printf("unknown control message: %s", base.Type)
	}
}

func setCursorPos(x, y int) {
	_, _, _ = procSetCursorPos.Call(uintptr(x), uintptr(y))
}

func mouseClick(button, action string) {
	var down, up uint32
	switch button {
	case "right":
		down, up = mouseeventfRightDown, mouseeventfRightUp
	case "middle":
		down, up = mouseeventfMiddleDown, mouseeventfMiddleUp
	default:
		down, up = mouseeventfLeftDown, mouseeventfLeftUp
	}
	if action == "down" {
		mouseEvent(down)
	} else {
		mouseEvent(up)
	}
}

func mouseEvent(flags uint32) {
	_, _, _ = procMouseEvent.Call(uintptr(flags), 0, 0, 0, 0)
}

func keyPress(key string, ctrl, alt, shift bool) {
	KeyCombo(key, ctrl, alt, shift)
}

// KeyCombo sends a key with modifier keys held down.
func KeyCombo(key string, ctrl, alt, shift bool) {
	if ctrl {
		keybdEvent(0x11, 0)
	}
	if alt {
		keybdEvent(0x12, 0)
	}

	vk, keyShift := resolveKey(key)
	if vk != 0 {
		useShift := keyShift
		if useShift {
			keybdEvent(0x10, 0)
		}
		keybdEvent(vk, 0)
		keybdEvent(vk, keyeventfKeyUp)
		if useShift {
			keybdEvent(0x10, keyeventfKeyUp)
		}
	}

	if alt {
		keybdEvent(0x12, keyeventfKeyUp)
	}
	if ctrl {
		keybdEvent(0x11, keyeventfKeyUp)
	}
	_ = shift // shift 需求由 VkKeyScanW / resolveKey 决定，避免与浏览器重复
}

func keybdEvent(vk byte, flags uint32) {
	_, _, _ = procKeybdEvent.Call(uintptr(vk), 0, uintptr(flags), 0)
}

func resolveKey(key string) (vk byte, needShift bool) {
	switch key {
	case "Enter", "Return":
		return 0x0D, false
	case "Backspace":
		return 0x08, false
	case "Tab":
		return 0x09, false
	case "Escape", "Esc":
		return 0x1B, false
	case "Delete":
		return 0x2E, false
	case "Home":
		return 0x24, false
	case "End":
		return 0x23, false
	case "PageUp":
		return 0x21, false
	case "PageDown":
		return 0x22, false
	case "Insert":
		return 0x2D, false
	case "ArrowUp":
		return 0x26, false
	case "ArrowDown":
		return 0x28, false
	case "ArrowLeft":
		return 0x25, false
	case "ArrowRight":
		return 0x27, false
	case " ":
		return 0x20, false
	}

	if len(key) > 1 && key[0] == 'F' {
		n := 0
		for i := 1; i < len(key); i++ {
			c := key[i]
			if c < '0' || c > '9' {
				n = 0
				break
			}
			n = n*10 + int(c-'0')
		}
		if n >= 1 && n <= 24 {
			return byte(0x70 + n - 1), false
		}
	}

	runes := []rune(key)
	if len(runes) == 1 {
		return charToVK(runes[0])
	}
	return 0, false
}

// charToVK 根据当前键盘布局把字符映射为虚拟键码与是否需 Shift。
func charToVK(ch rune) (byte, bool) {
	ret, _, _ := procVkKeyScanW.Call(uintptr(ch))
	if int16(ret) == -1 {
		if ch >= 'a' && ch <= 'z' {
			return byte(ch - 'a' + 'A'), false
		}
		if ch >= 'A' && ch <= 'Z' {
			return byte(ch), true
		}
		if ch >= '0' && ch <= '9' {
			return byte(ch), false
		}
		return 0, false
	}
	vk := byte(ret & 0xFF)
	needShift := (ret>>8)&1 != 0
	return vk, needShift
}
