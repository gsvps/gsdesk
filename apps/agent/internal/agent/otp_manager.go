package agent

import (
	"log"
	"sync"
	"time"
)

type OTPStatus struct {
	Code                   string `json:"code"`
	ExpiresIn              int    `json:"expires_in"`
	OTPIdleRefreshMinutes  int    `json:"otp_idle_refresh_minutes"`
	ActiveSessions         int    `json:"active_sessions"`
}

type OTPManager struct {
	mu          sync.Mutex
	agent       *Agent
	code        string
	expiresAt   time.Time
	idleSince   time.Time
	initialized bool
	stop        chan struct{}
}

func NewOTPManager(a *Agent) *OTPManager {
	return &OTPManager{
		agent: a,
		stop:  make(chan struct{}),
	}
}

func (m *OTPManager) Start() {
	go m.loop()
}

func (m *OTPManager) Stop() {
	select {
	case <-m.stop:
	default:
		close(m.stop)
	}
}

func (m *OTPManager) Snapshot() OTPStatus {
	m.mu.Lock()
	defer m.mu.Unlock()

	minutes := m.idleMinutesLocked()
	active := m.activeSessionsLocked()
	expiresIn := 0
	if !m.expiresAt.IsZero() {
		expiresIn = int(time.Until(m.expiresAt).Seconds())
		if expiresIn < 0 {
			expiresIn = 0
		}
	}
	return OTPStatus{
		Code:                  m.code,
		ExpiresIn:             expiresIn,
		OTPIdleRefreshMinutes: minutes,
		ActiveSessions:        active,
	}
}

func (m *OTPManager) RefreshNow() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.refreshLocked()
}

func (m *OTPManager) loop() {
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	m.mu.Lock()
	if !m.initialized {
		if m.agent != nil && m.agent.cfg != nil && m.agent.cfg.Settings.AgentEnabledOn() {
			_ = m.refreshLocked()
		}
		m.idleSince = time.Now()
		m.initialized = true
	}
	m.mu.Unlock()

	for {
		select {
		case <-m.stop:
			return
		case <-ticker.C:
			m.tick()
		}
	}
}

func (m *OTPManager) tick() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.agent == nil || m.agent.cfg == nil || !m.agent.cfg.Settings.AgentEnabledOn() {
		return
	}

	active := m.activeSessionsLocked()
	if active > 0 {
		m.idleSince = time.Time{}
		return
	}

	if m.idleSince.IsZero() {
		m.idleSince = time.Now()
	}

	idle := time.Duration(m.idleMinutesLocked()) * time.Minute
	if idle <= 0 {
		idle = 5 * time.Minute
	}
	if time.Since(m.idleSince) >= idle {
		if err := m.refreshLocked(); err != nil {
			log.Printf("otp idle refresh failed: %v", err)
		}
		m.idleSince = time.Now()
	}

	if !m.expiresAt.IsZero() && time.Until(m.expiresAt) <= 30*time.Second && m.code != "" {
		if err := m.refreshLocked(); err != nil {
			log.Printf("otp expiry refresh failed: %v", err)
		}
	}
}

func (m *OTPManager) refreshLocked() error {
	code, expiresIn, err := m.agent.GenerateOTP()
	if err != nil {
		return err
	}
	m.code = code
	m.expiresAt = time.Now().Add(time.Duration(expiresIn) * time.Second)
	return nil
}

func (m *OTPManager) idleMinutesLocked() int {
	if m.agent == nil || m.agent.cfg == nil {
		return 5
	}
	return m.agent.cfg.Settings.OTPIdleRefreshMinutesOrDefault()
}

func (m *OTPManager) activeSessionsLocked() int {
	if m.agent == nil {
		return 0
	}
	return m.agent.ActiveSessionCount()
}
