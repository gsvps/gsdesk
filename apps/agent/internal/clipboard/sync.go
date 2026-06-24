package clipboard

import (
	"encoding/json"
	"log"
	"time"
)

const pollInterval = 800 * time.Millisecond

// Sync polls the OS clipboard and sends changes to the browser.
type Sync struct {
	stop                chan struct{}
	send                func([]byte)
	lastSent            string
	lastFromBrowser     string
	lastFromBrowserTime time.Time
}

func StartSync(stop chan struct{}, send func([]byte)) *Sync {
	s := &Sync{stop: stop, send: send}
	go s.run()
	return s
}

func (s *Sync) run() {
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.stop:
			return
		case <-ticker.C:
			text, ok := GetText()
			if !ok || text == "" {
				continue
			}
			if text == s.lastSent {
				continue
			}
			if text == s.lastFromBrowser && time.Since(s.lastFromBrowserTime) < 3*time.Second {
				continue
			}

			payload, err := json.Marshal(map[string]any{
				"type":    "clipboard",
				"content": text,
			})
			if err != nil {
				continue
			}
			s.send(payload)
			s.lastSent = text
		}
	}
}

func (s *Sync) ApplyFromBrowser(content, action string) {
	s.lastFromBrowser = content
	s.lastFromBrowserTime = time.Now()
	s.lastSent = content

	if err := SetText(content); err != nil {
		log.Printf("clipboard set failed: %v", err)
		return
	}

	if action == "paste" {
		Paste()
	}
}
