package appui

import "github.com/clouddesk/agent/internal/config"

type AgentView interface {
	DeviceID() string
	IsOnline() bool
	LastError() string
	RefreshConnection()
	ForceReconnect()
	SetPermanentPassword(password string) error
	ClearPermanentPassword() error
	GenerateOTP() (code string, expiresIn int, err error)
	OTPStatus() (code string, expiresIn int, idleMinutes int, activeSessions int)
	RefreshOTP() error
}

type SaveFunc func(*config.Config) error
