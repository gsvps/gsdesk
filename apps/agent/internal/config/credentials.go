package config

import (
	"regexp"
	"strings"
)

var numericDeviceIDPattern = regexp.MustCompile(`^\d{8}$`)

// DeviceIDNeedsReregister reports legacy or invalid device IDs (e.g. dev_xxx).
func DeviceIDNeedsReregister(id string) bool {
	id = strings.TrimSpace(id)
	if id == "" {
		return true
	}
	if strings.HasPrefix(id, "dev_") {
		return true
	}
	return !numericDeviceIDPattern.MatchString(id)
}

// NormalizeServerURL trims spaces and trailing slashes from the API root URL.
func (c *Config) NormalizeServerURL() {
	c.ServerURL = strings.TrimRight(strings.TrimSpace(c.ServerURL), "/")
}

// MigrateLegacyCredentials clears invalid device credentials and persists the change.
func (c *Config) MigrateLegacyCredentials() error {
	if !DeviceIDNeedsReregister(c.DeviceID) && strings.TrimSpace(c.DeviceToken) != "" {
		return nil
	}
	c.DeviceID = ""
	c.DeviceToken = ""
	return c.Save()
}
