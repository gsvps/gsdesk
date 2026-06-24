package agent

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/clouddesk/agent/internal/api"
	"github.com/clouddesk/agent/internal/capture"
	"github.com/clouddesk/agent/internal/config"
	"github.com/clouddesk/agent/internal/crypto"
	"github.com/clouddesk/agent/internal/input"
	"github.com/clouddesk/agent/internal/platform"
	"github.com/clouddesk/agent/internal/signal"
	"github.com/clouddesk/agent/internal/transfer"
	"github.com/clouddesk/agent/internal/ui"
	agentwebrtc "github.com/clouddesk/agent/internal/webrtc"
)

var sessionPromptLocks sync.Map // sessionID -> *sync.Mutex
var reconnectMu sync.Mutex
var lastReconnectAttempt time.Time

type Agent struct {
	cfg      *config.Config
	keys     *crypto.KeyPair
	deviceID string
	signal   *signal.Client
	webrtc   *agentwebrtc.Manager
	transfer *transfer.Handler
	otp      *OTPManager

	lastError   string
	lastErrorMu sync.RWMutex
}

func New(cfg *config.Config) (*Agent, error) {
	keys, err := crypto.LoadOrGenerate()
	if err != nil {
		return nil, err
	}

	a := &Agent{cfg: cfg, keys: keys}

	if config.DeviceIDNeedsReregister(cfg.DeviceID) || cfg.DeviceToken == "" {
		a.resetDeviceCredentials()
	if err := a.register(); err != nil {
		a.setLastError(err.Error())
		log.Printf("device register failed (will retry on connect): %v", err)
	}
	}

	a.deviceID = cfg.DeviceID
	capture.ApplyQualityPreset(cfg.Settings.DefaultQuality)
	a.signal = signal.New(cfg.ServerURL, cfg.DeviceID, cfg.DeviceToken, a.handleSignal)
	a.transfer = transfer.NewHandler(cfg.ServerURL, cfg.DeviceToken, cfg.DeviceID, func() string {
		return a.cfg.Settings.DownloadDirectory()
	})
	a.webrtc = agentwebrtc.NewManager(a.signal, a.handleControl, a.clipboardEnabled)
	a.otp = NewOTPManager(a)
	a.otp.Start()
	if err := platform.SetAutostart(cfg.Settings.LaunchAtStartup); err != nil {
		log.Printf("autostart sync: %v", err)
	}
	return a, nil
}

func (a *Agent) Config() *config.Config {
	return a.cfg
}

func (a *Agent) clipboardEnabled() bool {
	if a.cfg == nil {
		return true
	}
	return a.cfg.Settings.ClipboardEnabled()
}

func (a *Agent) ensureRegistered() error {
	if a.cfg.DeviceID != "" && a.cfg.DeviceToken != "" &&
		!config.DeviceIDNeedsReregister(a.cfg.DeviceID) &&
		a.cfg.DeviceID == a.deviceID {
		return nil
	}
	if config.DeviceIDNeedsReregister(a.cfg.DeviceID) {
		a.resetDeviceCredentials()
	}
	if err := a.register(); err != nil {
		a.setLastError(err.Error())
		return err
	}
	a.setLastError("")
	a.deviceID = a.cfg.DeviceID
	return nil
}

func (a *Agent) resetDeviceCredentials() {
	a.cfg.DeviceID = ""
	a.cfg.DeviceToken = ""
	a.deviceID = ""
}

func (a *Agent) setLastError(msg string) {
	a.lastErrorMu.Lock()
	a.lastError = msg
	a.lastErrorMu.Unlock()
}

func (a *Agent) LastError() string {
	a.lastErrorMu.RLock()
	defer a.lastErrorMu.RUnlock()
	return a.lastError
}

func (a *Agent) RefreshConnection() {
	reconnectMu.Lock()
	if time.Since(lastReconnectAttempt) < 15*time.Second {
		reconnectMu.Unlock()
		return
	}
	lastReconnectAttempt = time.Now()
	reconnectMu.Unlock()
	go a.reconnectHost()
}

func (a *Agent) ForceReconnect() {
	reconnectMu.Lock()
	lastReconnectAttempt = time.Now()
	reconnectMu.Unlock()
	go a.reconnectHost()
}

func (a *Agent) reconnectHost() {
	if a.cfg == nil || !a.cfg.Settings.AgentEnabledOn() {
		return
	}
	if err := a.ensureRegistered(); err != nil {
		a.setLastError(err.Error())
		log.Printf("device register before connect: %v", err)
		return
	}
	a.setLastError("")
	if a.signal != nil {
		a.signal.Close()
	}
	a.transfer = transfer.NewHandler(a.cfg.ServerURL, a.cfg.DeviceToken, a.cfg.DeviceID, func() string {
		return a.cfg.Settings.DownloadDirectory()
	})
	a.signal = signal.New(a.cfg.ServerURL, a.cfg.DeviceID, a.cfg.DeviceToken, a.handleSignal)
	a.webrtc = agentwebrtc.NewManager(a.signal, a.handleControl, a.clipboardEnabled)
	if err := a.signal.Connect(); err != nil {
		log.Printf("agent reconnect: %v", err)
		return
	}
	log.Printf("host service connected server=%s device=%s", a.cfg.ServerURL, a.deviceID)
	if a.otp != nil {
		go func() {
			if err := a.otp.RefreshNow(); err != nil {
				log.Printf("otp refresh after connect: %v", err)
			}
		}()
	}
}

func (a *Agent) ApplyConfig(next *config.Config) error {
	if next == nil {
		return fmt.Errorf("config is nil")
	}
	wasEnabled := a.cfg.Settings.AgentEnabledOn()
	oldServerURL := strings.TrimRight(strings.TrimSpace(a.cfg.ServerURL), "/")
	next.Settings = next.Settings.Normalized()
	nextServerURL := strings.TrimRight(strings.TrimSpace(next.ServerURL), "/")
	a.cfg.ServerURL = nextServerURL
	a.cfg.DeviceName = next.DeviceName
	a.cfg.Settings = next.Settings
	capture.ApplyQualityPreset(next.Settings.DefaultQuality)
	if err := platform.SetAutostart(next.Settings.LaunchAtStartup); err != nil {
		return fmt.Errorf("设置开机自启失败: %w", err)
	}
	serverChanged := oldServerURL != nextServerURL
	if serverChanged {
		a.resetDeviceCredentials()
	}
	if err := a.cfg.Save(); err != nil {
		return err
	}
	nowEnabled := next.Settings.AgentEnabledOn()
	if wasEnabled && !nowEnabled {
		a.signal.Close()
		log.Printf("host service disabled")
	} else if nowEnabled && (!wasEnabled || serverChanged || !a.IsOnline()) {
		go a.reconnectHost()
	}
	return nil
}

func (a *Agent) DeviceID() string {
	return a.deviceID
}

func (a *Agent) IsOnline() bool {
	if a.cfg == nil || !a.cfg.Settings.AgentEnabledOn() {
		return false
	}
	if a.signal == nil {
		return false
	}
	return a.signal.IsConnected()
}

func (a *Agent) apiClient() *api.Client {
	return api.New(a.cfg.ServerURL, a.cfg.DeviceToken)
}

func (a *Agent) SetPermanentPassword(password string) error {
	return a.apiClient().SetAccessPassword(password)
}

func (a *Agent) ClearPermanentPassword() error {
	return a.apiClient().ClearAccessPassword()
}

func (a *Agent) GenerateOTP() (string, int, error) {
	result, err := a.apiClient().GenerateOTP()
	if err != nil {
		return "", 0, err
	}
	return result.Code, result.ExpiresIn, nil
}

func (a *Agent) OTPStatus() (code string, expiresIn int, idleMinutes int, activeSessions int) {
	if a.otp == nil {
		minutes := 5
		if a.cfg != nil {
			minutes = a.cfg.Settings.OTPIdleRefreshMinutesOrDefault()
		}
		return "", 0, minutes, a.ActiveSessionCount()
	}
	s := a.otp.Snapshot()
	return s.Code, s.ExpiresIn, s.OTPIdleRefreshMinutes, s.ActiveSessions
}

func (a *Agent) ActiveSessionCount() int {
	if a.webrtc == nil {
		return 0
	}
	return a.webrtc.ActiveSessionCount()
}

func (a *Agent) RefreshOTP() error {
	if a.otp == nil {
		_, _, err := a.GenerateOTP()
		return err
	}
	return a.otp.RefreshNow()
}

func (a *Agent) register() error {
	client := api.New(a.cfg.ServerURL, "")
	resp, err := client.Register(api.RegisterRequest{
		DeviceName: a.cfg.DeviceName,
		Hostname:   a.cfg.Hostname,
		OS:         a.cfg.OS,
		PublicKey:  a.keys.PublicKey,
	})
	if err != nil {
		return err
	}

	a.cfg.DeviceID = resp.DeviceID
	a.cfg.DeviceToken = resp.DeviceToken
	a.deviceID = resp.DeviceID
	if err := a.cfg.Save(); err != nil {
		return err
	}

	log.Printf("device registered: %s", resp.DeviceID)
	if a.otp != nil {
		go func() {
			if err := a.otp.RefreshNow(); err != nil {
				log.Printf("otp refresh after register: %v", err)
			}
		}()
	}
	return nil
}

func (a *Agent) Run() error {
	if err := a.ConnectIfEnabled(); err != nil {
		return err
	}
	select {}
}

func (a *Agent) ConnectIfEnabled() error {
	if a.cfg == nil || !a.cfg.Settings.AgentEnabledOn() {
		return nil
	}
	if err := a.ensureRegistered(); err != nil {
		return err
	}
	if a.signal != nil {
		a.signal.Close()
	}
	a.transfer = transfer.NewHandler(a.cfg.ServerURL, a.cfg.DeviceToken, a.cfg.DeviceID, func() string {
		return a.cfg.Settings.DownloadDirectory()
	})
	a.signal = signal.New(a.cfg.ServerURL, a.cfg.DeviceID, a.cfg.DeviceToken, a.handleSignal)
	a.webrtc = agentwebrtc.NewManager(a.signal, a.handleControl, a.clipboardEnabled)
	if a.signal.IsConnected() {
		return nil
	}
	return a.signal.Connect()
}

func (a *Agent) handleControl(sessionID string, data []byte, send func([]byte)) {
	var base struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &base); err != nil {
		return
	}

	switch base.Type {
	case "set_quality":
		var msg struct {
			Preset string `json:"preset"`
		}
		if err := json.Unmarshal(data, &msg); err == nil && msg.Preset != "" {
			capture.ApplyQualityPreset(msg.Preset)
			log.Printf("quality preset applied: %s session=%s", msg.Preset, sessionID)
		}
		return
	case "clipboard":
		var msg struct {
			Content string `json:"content"`
			Action  string `json:"action"`
		}
		if err := json.Unmarshal(data, &msg); err != nil {
			return
		}
		a.webrtc.ApplyClipboard(sessionID, msg.Content, msg.Action)
		return
	}

	if a.transfer.Handle(sessionID, data, send) {
		return
	}

	input.HandleControl(data)
}

func (a *Agent) handleSignal(msg signal.Message) {
	switch msg.Type {
	case "connection_request":
		// 弹窗会阻塞；放到独立 goroutine，避免占用 WebSocket 读循环导致收不到 webrtc_offer
		go a.handleConnectionRequest(msg)
	case "webrtc_offer":
		if err := a.webrtc.HandleOffer(msg); err != nil {
			log.Printf("webrtc offer failed: %v", err)
		}
	case "ice_candidate":
		if err := a.webrtc.HandleICE(msg); err != nil {
			log.Printf("ice candidate failed: %v", err)
		}
	default:
		log.Printf("signal message: %s", msg.Type)
	}
}

func (a *Agent) handleConnectionRequest(msg signal.Message) {
	lockVal, _ := sessionPromptLocks.LoadOrStore(msg.SessionID, &sync.Mutex{})
	lock := lockVal.(*sync.Mutex)
	if !lock.TryLock() {
		log.Printf("connection request ignored (prompt in progress) session=%s", msg.SessionID)
		return
	}
	defer lock.Unlock()

	log.Printf("connection request session=%s", msg.SessionID)
	a.webrtc.CloseSession(msg.SessionID)

	if a.cfg != nil && !a.cfg.Settings.AutoAccept {
		if !ui.PromptAccept(msg.SessionID) {
			if err := a.signal.Send(signal.Message{
				Type:      "connection_reject",
				SessionID: msg.SessionID,
				DeviceID:  a.deviceID,
			}); err != nil {
				log.Printf("send connection_reject failed session=%s: %v", msg.SessionID, err)
			} else {
				log.Printf("connection rejected by user session=%s", msg.SessionID)
			}
			return
		}
	}

	signature := ""
	if msg.Nonce != "" {
		sig, err := crypto.Sign(a.keys.PrivateKey, msg.Nonce)
		if err != nil {
			log.Printf("sign nonce failed session=%s: %v", msg.SessionID, err)
		} else {
			signature = sig
		}
	}
	if err := a.signal.Send(signal.Message{
		Type:      "connection_accept",
		SessionID: msg.SessionID,
		DeviceID:  a.deviceID,
		Nonce:     msg.Nonce,
		Signature: signature,
	}); err != nil {
		log.Printf("send connection_accept failed session=%s: %v", msg.SessionID, err)
	} else {
		log.Printf("connection accepted session=%s", msg.SessionID)
	}
}

func (a *Agent) Close() {
	if a.otp != nil {
		a.otp.Stop()
	}
	if a.signal != nil {
		a.signal.Close()
	}
}
