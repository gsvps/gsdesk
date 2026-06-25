package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

type Config struct {
	ServerURL       string        `json:"server_url"`
	ControllerToken string        `json:"controller_token,omitempty"`
	DeviceName   string        `json:"device_name,omitempty"`
	Hostname     string        `json:"hostname,omitempty"`
	OS           string        `json:"os,omitempty"`
	DeviceID     string        `json:"device_id,omitempty"`
	DeviceToken  string        `json:"device_token,omitempty"`
	Settings     AgentSettings `json:"settings,omitempty"`
}

func configPath() (string, error) {
	dir, err := DataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.json"), nil
}

func Load() (*Config, error) {
	path, err := configPath()
	if err != nil {
		return nil, err
	}

	cfg := &Config{
		ServerURL:  envOrDefault("GSDESK_SERVER", "http://127.0.0.1:8787"),
		DeviceName: envOrDefault("GSDESK_DEVICE_NAME", hostnameOrDefault()),
		Hostname:   hostnameOrDefault(),
		OS:         envOrDefault("GSDESK_OS", "windows"),
	}

	if raw, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(raw, cfg)
	}

	if cfg.ServerURL == "" {
		return nil, errors.New("server_url is required")
	}

	cfg.Settings = cfg.Settings.Normalized()
	cfg.NormalizeServerURL()
	if err := cfg.MigrateLegacyCredentials(); err != nil {
		return nil, err
	}
	return cfg, nil
}

func (c *Config) ConfigPath() (string, error) {
	return configPath()
}

func (c *Config) InstallPath() string {
	if root := InstallRoot(); root != "" {
		return root
	}
	if exe, err := os.Executable(); err == nil {
		return filepath.Dir(exe)
	}
	return ""
}

func (c *Config) Save() error {
	path, err := configPath()
	if err != nil {
		return err
	}
	raw, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0o600)
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func hostnameOrDefault() string {
	name, err := os.Hostname()
	if err != nil || name == "" {
		return "unknown-host"
	}
	return name
}
