//go:build windows

package logsetup

import (
	"io"
	"log"
	"os"
	"path/filepath"

	"github.com/gsvps/gsdesk/internal/config"
)

// Init writes log output under the install log directory (GUI builds have no console).
func Init() {
	dir, err := config.LogDir()
	if err != nil {
		return
	}
	f, err := os.OpenFile(filepath.Join(dir, "agent.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	log.SetOutput(io.MultiWriter(f))
	log.SetFlags(log.LstdFlags)
	log.Printf("GSDesk Agent log initialized")
}
