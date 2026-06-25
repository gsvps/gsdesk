package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/gsvps/gsdesk/internal/netutil"
)

type Client struct {
	baseURL     string
	deviceToken string
	http        *http.Client
}

func New(baseURL, deviceToken string) *Client {
	return &Client{
		baseURL:     baseURL,
		deviceToken: deviceToken,
		http:        netutil.NewHTTPClient(15 * time.Second),
	}
}

type apiResponse[T any] struct {
	Success bool `json:"success"`
	Data    T    `json:"data"`
	Error   *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

type RegisterRequest struct {
	DeviceName string `json:"device_name"`
	Hostname   string `json:"hostname"`
	OS         string `json:"os"`
	PublicKey  string `json:"public_key"`
}

type RegisterResponse struct {
	DeviceID    string `json:"device_id"`
	DeviceToken string `json:"device_token"`
}

type FileUploadResult struct {
	FileID   string `json:"file_id"`
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
}

func (c *Client) Register(req RegisterRequest) (*RegisterResponse, error) {
	var out RegisterResponse
	if err := c.postJSON("/api/device/register", req, &out, false); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) DownloadAgentFile(sessionID, fileID string) ([]byte, string, error) {
	url := fmt.Sprintf("%s/api/agent/files/%s?session_id=%s", c.baseURL, fileID, sessionID)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, "", err
	}
	if c.deviceToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.deviceToken)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, "", fmt.Errorf("download failed (%d): %s", resp.StatusCode, string(body))
	}

	filename := "download.bin"
	if cd := resp.Header.Get("Content-Disposition"); cd != "" {
		if idx := strings.Index(cd, "filename="); idx >= 0 {
			name := strings.Trim(cd[idx+9:], "\"")
			if name != "" {
				filename = name
			}
		}
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}
	return body, filename, nil
}

func (c *Client) UploadAgentFile(sessionID, filename string, r io.Reader, size int64) (*FileUploadResult, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	part, err := w.CreateFormFile("file", filename)
	if err != nil {
		return nil, err
	}
	if _, err := io.Copy(part, r); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}

	url := fmt.Sprintf("%s/api/agent/files/upload?session_id=%s", c.baseURL, sessionID)
	req, err := http.NewRequest(http.MethodPost, url, &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	if c.deviceToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.deviceToken)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var wrapper apiResponse[FileUploadResult]
	if err := json.Unmarshal(respBody, &wrapper); err != nil {
		return nil, err
	}
	if !wrapper.Success {
		if wrapper.Error != nil {
			return nil, fmt.Errorf("%s: %s", wrapper.Error.Code, wrapper.Error.Message)
		}
		return nil, fmt.Errorf("upload failed with status %d", resp.StatusCode)
	}
	return &wrapper.Data, nil
}

func (c *Client) SetAccessPassword(password string) error {
	return c.postJSON("/api/agent/device/access-password", map[string]string{"password": password}, nil, true)
}

func (c *Client) ClearAccessPassword() error {
	return c.postJSON("/api/agent/device/access-password", map[string]bool{"clear": true}, nil, true)
}

type OTPGenerateResult struct {
	Code      string `json:"code"`
	ExpiresIn int    `json:"expires_in"`
}

func (c *Client) GenerateOTP() (*OTPGenerateResult, error) {
	var out OTPGenerateResult
	if err := c.postJSON("/api/agent/device/otp/generate", map[string]any{}, &out, true); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) postJSON(path string, body any, out any, useDeviceToken bool) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, c.baseURL+path, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if useDeviceToken && c.deviceToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.deviceToken)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var wrapper apiResponse[json.RawMessage]
	if err := json.Unmarshal(respBody, &wrapper); err != nil {
		return err
	}
	if !wrapper.Success {
		if wrapper.Error != nil {
			return fmt.Errorf("%s: %s", wrapper.Error.Code, wrapper.Error.Message)
		}
		return fmt.Errorf("request failed with status %d", resp.StatusCode)
	}
	if out != nil {
		if err := json.Unmarshal(wrapper.Data, out); err != nil {
			return err
		}
	}
	return nil
}
