//go:build windows

package appui

import (
	"fmt"
	"net/http"
	"time"
)

// TryActivateExistingInstance asks a running client to restore its window.
func TryActivateExistingInstance() bool {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/__clouddesk/raise", DefaultLocalUIPort))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusNoContent || resp.StatusCode == http.StatusOK
}
