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
		JPEGQuality:  68,
		MaxJPEGBytes: 140 * 1024,
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
		next = StreamSettings{MaxWidth: 960, FPS: 8, JPEGQuality: 50, MaxJPEGBytes: 80 * 1024}
	case "medium":
		next = StreamSettings{MaxWidth: 1280, FPS: 12, JPEGQuality: 68, MaxJPEGBytes: 140 * 1024}
	case "high":
		next = StreamSettings{MaxWidth: 1600, FPS: 15, JPEGQuality: 78, MaxJPEGBytes: 190 * 1024}
	case "ultra":
		next = StreamSettings{MaxWidth: 1920, FPS: 18, JPEGQuality: 85, MaxJPEGBytes: 230 * 1024}
	default:
		return
	}
	settingsMu.Lock()
	settings = next
	settingsMu.Unlock()
}
