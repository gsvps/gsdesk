package update

import (
	"os/exec"
	"strings"
)

func OpenURL(url string) error {
	url = strings.TrimSpace(url)
	if url == "" {
		return nil
	}
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}
