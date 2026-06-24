package capture

import "sync"

// StreamSettings controls JPEG fallback stream quality (mutable at runtime).
type StreamSettings struct {
	MaxWidth     int
	FPS          int
	JPEGQuality  int
	MaxJPEGBytes int
}

var (
	settingsMu sync.RWMutex
	settings   = StreamSettings{
		MaxWidth:     maxStreamWidth,
		FPS:          defaultFPS,
		JPEGQuality:  60,
		MaxJPEGBytes: maxJPEGBytes,
	}
)

func CurrentSettings() StreamSettings {
	settingsMu.RLock()
	defer settingsMu.RUnlock()
	return settings
}

func ApplyQualityPreset(preset string) {
	next := StreamSettings{
		MaxWidth:     maxStreamWidth,
		FPS:          defaultFPS,
		JPEGQuality:  60,
		MaxJPEGBytes: maxJPEGBytes,
	}
	switch preset {
	case "low":
		next = StreamSettings{MaxWidth: 640, FPS: 8, JPEGQuality: 45, MaxJPEGBytes: 80 * 1024}
	case "medium":
		// defaults
	case "high":
		next = StreamSettings{MaxWidth: 1280, FPS: 12, JPEGQuality: 72, MaxJPEGBytes: 180 * 1024}
	case "ultra":
		next = StreamSettings{MaxWidth: 1600, FPS: 15, JPEGQuality: 80, MaxJPEGBytes: 220 * 1024}
	default:
		return
	}
	settingsMu.Lock()
	settings = next
	settingsMu.Unlock()
}
