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
		MaxWidth:     3840,
		FPS:          24,
		JPEGQuality:  98,
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
		next = StreamSettings{MaxWidth: 960, FPS: 8, JPEGQuality: 50, MaxJPEGBytes: 80 * 1024}
	case "medium":
		next = StreamSettings{MaxWidth: 1280, FPS: 12, JPEGQuality: 68, MaxJPEGBytes: 140 * 1024}
	case "high":
		next = StreamSettings{MaxWidth: 1920, FPS: 16, JPEGQuality: 82, MaxJPEGBytes: 200 * 1024}
	case "ultra":
		next = StreamSettings{MaxWidth: 3840, FPS: 24, JPEGQuality: 98, MaxJPEGBytes: maxJPEGBytes}
	default:
		return
	}
	settingsMu.Lock()
	settings = next
	settingsMu.Unlock()
}
