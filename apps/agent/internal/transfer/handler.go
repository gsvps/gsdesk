package transfer

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/gsvps/gsdesk/internal/api"
)

type Handler struct {
	client      *api.Client
	deviceID    string
	downloadDir func() string
}

func NewHandler(serverURL, deviceToken, deviceID string, downloadDir func() string) *Handler {
	return &Handler{
		client:      api.New(serverURL, deviceToken),
		deviceID:    deviceID,
		downloadDir: downloadDir,
	}
}

type SendFunc func(payload []byte)

func (h *Handler) Handle(sessionID string, data []byte, send SendFunc) bool {
	var base struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &base); err != nil {
		return false
	}

	switch base.Type {
	case "file_to_agent":
		go h.downloadToAgent(sessionID, data, send)
		return true
	case "file_from_agent":
		go h.uploadFromAgent(sessionID, data, send)
		return true
	default:
		return false
	}
}

func (h *Handler) downloadToAgent(sessionID string, data []byte, send SendFunc) {
	var msg struct {
		FileID   string `json:"file_id"`
		Filename string `json:"filename"`
		SaveAs   string `json:"save_as"`
	}
	if err := json.Unmarshal(data, &msg); err != nil || msg.FileID == "" {
		h.notifyError(send, "invalid file_to_agent payload")
		return
	}

	body, filename, err := h.client.DownloadAgentFile(sessionID, msg.FileID)
	if err != nil {
		h.notifyError(send, err.Error())
		return
	}

	if msg.Filename != "" {
		filename = msg.Filename
	}
	if msg.SaveAs != "" {
		filename = filepath.Base(msg.SaveAs)
	}

	destDir := ""
	if h.downloadDir != nil {
		destDir = h.downloadDir()
	}
	if destDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			h.notifyError(send, err.Error())
			return
		}
		destDir = filepath.Join(home, "Downloads")
	}
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		h.notifyError(send, err.Error())
		return
	}

	destPath := uniquePath(filepath.Join(destDir, filename))
	if err := os.WriteFile(destPath, body, 0o644); err != nil {
		h.notifyError(send, err.Error())
		return
	}

	payload, _ := json.Marshal(map[string]any{
		"type":     "file_agent_done",
		"file_id":  msg.FileID,
		"filename": filepath.Base(destPath),
		"path":     destPath,
		"status":   "saved",
	})
	send(payload)
	log.Printf("file saved to %s session=%s", destPath, sessionID)
}

func (h *Handler) uploadFromAgent(sessionID string, data []byte, send SendFunc) {
	var msg struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(data, &msg); err != nil || strings.TrimSpace(msg.Path) == "" {
		h.notifyError(send, "invalid file_from_agent path")
		return
	}

	path := strings.TrimSpace(msg.Path)
	info, err := os.Stat(path)
	if err != nil {
		h.notifyError(send, fmt.Sprintf("无法读取文件: %v", err))
		return
	}
	if info.IsDir() {
		h.notifyError(send, "路径是目录，请指定文件")
		return
	}
	if info.Size() > 100*1024*1024 {
		h.notifyError(send, "文件过大（最大 100MB）")
		return
	}

	f, err := os.Open(path)
	if err != nil {
		h.notifyError(send, err.Error())
		return
	}
	defer f.Close()

	result, err := h.client.UploadAgentFile(sessionID, filepath.Base(path), f, info.Size())
	if err != nil {
		h.notifyError(send, err.Error())
		return
	}

	payload, _ := json.Marshal(map[string]any{
		"type":     "file_ready",
		"file_id":  result.FileID,
		"filename": result.Filename,
		"size":     result.Size,
		"status":   "ready",
	})
	send(payload)
	log.Printf("file uploaded file_id=%s session=%s", result.FileID, sessionID)
}

func (h *Handler) notifyError(send SendFunc, message string) {
	payload, _ := json.Marshal(map[string]any{
		"type":    "file_error",
		"message": message,
	})
	send(payload)
}

func uniquePath(path string) string {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return path
	}
	ext := filepath.Ext(path)
	base := strings.TrimSuffix(filepath.Base(path), ext)
	dir := filepath.Dir(path)
	for i := 1; i < 1000; i++ {
		candidate := filepath.Join(dir, fmt.Sprintf("%s (%d)%s", base, i, ext))
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate
		}
	}
	return path
}
