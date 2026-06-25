package update

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gsvps/gsdesk/internal/netutil"
	"github.com/gsvps/gsdesk/internal/version"
)

type Result struct {
	OK              bool   `json:"ok"`
	Error           string `json:"error,omitempty"`
	CurrentVersion  string `json:"current_version"`
	LatestVersion   string `json:"latest_version"`
	UpdateAvailable bool   `json:"update_available"`
	DownloadURL     string `json:"download_url,omitempty"`
	ReleaseNotes    string `json:"release_notes,omitempty"`
	Message         string `json:"message,omitempty"`
}

type apiEnvelope struct {
	Success bool `json:"success"`
	Data    struct {
		LatestVersion   string `json:"latest_version"`
		UpdateAvailable bool   `json:"update_available"`
		DownloadURL     string `json:"download_url"`
		ReleaseNotes    string `json:"release_notes"`
	} `json:"data"`
}

func CurrentVersion() string {
	return version.Version
}

func Check(serverURL string) Result {
	current := version.Version
	base := strings.TrimRight(strings.TrimSpace(serverURL), "/")
	if base == "" {
		return Result{
			OK:             false,
			Error:          "未配置服务器地址",
			CurrentVersion: current,
		}
	}

	query := url.Values{}
	query.Set("platform", "windows")
	query.Set("version", current)
	endpoint := base + "/api/client/update?" + query.Encode()

	client := netutil.NewHTTPClient(15 * time.Second)
	resp, err := client.Get(endpoint)
	if err != nil {
		return Result{
			OK:             false,
			Error:          "无法连接更新服务器: " + err.Error(),
			CurrentVersion: current,
		}
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return Result{OK: false, Error: err.Error(), CurrentVersion: current}
	}
	if resp.StatusCode != http.StatusOK {
		return Result{
			OK:             false,
			Error:          fmt.Sprintf("更新检查失败 (HTTP %d)", resp.StatusCode),
			CurrentVersion: current,
		}
	}

	var envelope apiEnvelope
	if err := json.Unmarshal(body, &envelope); err != nil || !envelope.Success {
		return Result{
			OK:             false,
			Error:          "更新服务器响应无效",
			CurrentVersion: current,
		}
	}

	result := Result{
		OK:              true,
		CurrentVersion:  current,
		LatestVersion:   envelope.Data.LatestVersion,
		UpdateAvailable: envelope.Data.UpdateAvailable,
		DownloadURL:     envelope.Data.DownloadURL,
		ReleaseNotes:    envelope.Data.ReleaseNotes,
	}
	if result.UpdateAvailable {
		result.Message = fmt.Sprintf("发现新版本 %s", result.LatestVersion)
	} else {
		result.Message = "当前已是最新版本"
	}
	return result
}
