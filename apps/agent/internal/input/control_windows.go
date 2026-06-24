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
	if shift {
		keybdEvent(0x10, 0)
	}

	vk := keyToVK(key)
	if vk != 0 {
		keybdEvent(vk, 0)
		keybdEvent(vk, keyeventfKeyUp)
	}

	if shift {
		keybdEvent(0x10, keyeventfKeyUp)
	}
	if alt {
		keybdEvent(0x12, keyeventfKeyUp)
	}
	if ctrl {
		keybdEvent(0x11, keyeventfKeyUp)
	}
}

func keybdEvent(vk byte, flags uint32) {
	_, _, _ = procKeybdEvent.Call(uintptr(vk), 0, uintptr(flags), 0)
}

func keyToVK(key string) byte {
	switch key {
	case "Enter":
		return 0x0D
	case "Backspace":
		return 0x08
	case "Tab":
		return 0x09
	case "Escape":
		return 0x1B
	case "ArrowUp":
		return 0x26
	case "ArrowDown":
		return 0x28
	case "ArrowLeft":
		return 0x25
	case "ArrowRight":
		return 0x27
	case " ":
		return 0x20
	default:
		if len(key) == 1 {
			c := key[0]
			if c >= 'a' && c <= 'z' {
				c = c - 'a' + 'A'
			}
			return byte(c)
		}
	}
	return 0
}
