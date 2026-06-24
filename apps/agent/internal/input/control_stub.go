//go:build !windows

package input

import (
	"encoding/json"
	"log"
)

func HandleControl(data []byte) {
	var base struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &base); err != nil {
		return
	}
	log.Printf("control message ignored on this platform: %s", base.Type)
}
