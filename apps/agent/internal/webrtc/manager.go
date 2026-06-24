package webrtc

import (
	"encoding/json"
	"image"
	"log"
	"sync"

	"github.com/clouddesk/agent/internal/capture"
	"github.com/clouddesk/agent/internal/clipboard"
	"github.com/clouddesk/agent/internal/input"
	"github.com/clouddesk/agent/internal/signal"
	"github.com/pion/webrtc/v4"
)

type Manager struct {
	mu                sync.Mutex
	sessions          map[string]*Session
	signal            *signal.Client
	onInput           func(sessionID string, data []byte, send func([]byte))
	clipboardEnabled  func() bool
}

func NewManager(sig *signal.Client, onInput func(sessionID string, data []byte, send func([]byte)), clipboardEnabled func() bool) *Manager {
	return &Manager{
		sessions:         make(map[string]*Session),
		signal:           sig,
		onInput:          onInput,
		clipboardEnabled: clipboardEnabled,
	}
}

func (m *Manager) HandleOffer(msg signal.Message) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if existing, ok := m.sessions[msg.SessionID]; ok {
		existing.Close()
		delete(m.sessions, msg.SessionID)
	}

	session, err := m.createSession(msg)
	if err != nil {
		return err
	}
	m.sessions[msg.SessionID] = session
	return nil
}

func (m *Manager) HandleICE(msg signal.Message) error {
	m.mu.Lock()
	session, ok := m.sessions[msg.SessionID]
	m.mu.Unlock()
	if !ok || msg.Candidate == "" {
		return nil
	}
	return AddICECandidate(session.pc, msg.Candidate)
}

func (m *Manager) CloseSession(sessionID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if session, ok := m.sessions[sessionID]; ok {
		session.Close()
		delete(m.sessions, sessionID)
	}
}

func (m *Manager) ActiveSessionCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.sessions)
}

func (m *Manager) ApplyClipboard(sessionID, content, action string) {
	m.mu.Lock()
	session, ok := m.sessions[sessionID]
	m.mu.Unlock()
	if !ok || session.clipboardSync == nil {
		return
	}
	session.clipboardSync.ApplyFromBrowser(content, action)
}

func (m *Manager) createSession(msg signal.Message) (*Session, error) {
	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{{URLs: []string{"stun:stun.l.google.com:19302"}}},
	}

	pc, err := webrtc.NewPeerConnection(config)
	if err != nil {
		return nil, err
	}

	session := &Session{
		id:     msg.SessionID,
		pc:     pc,
		signal: m.signal,
		stop:   make(chan struct{}),
	}

	vp8Frames := make(chan image.Image, 2)
	var videoTrack *webrtc.TrackLocalStaticSample
	if capture.VP8Available() {
		var err error
		videoTrack, err = webrtc.NewTrackLocalStaticSample(
			webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeVP8},
			"video",
			"clouddesk",
		)
		if err != nil {
			pc.Close()
			return nil, err
		}
		if _, err := pc.AddTrack(videoTrack); err != nil {
			pc.Close()
			return nil, err
		}
		session.videoTrack = videoTrack
	}

	screen := capture.NewScreen()
	session.screen = screen

	startStream := func() {
		session.mu.Lock()
		if session.streamStarted {
			session.mu.Unlock()
			return
		}
		session.streamStarted = true
		session.mu.Unlock()

		var vp8Cancel func()
		session.streamCancel = screen.StartStreaming(capture.StreamOptions{
			VP8Frames:   vp8Frames,
			SendControl: session.sendControl,
			OnReady: func(meta capture.ScreenMeta) {
				desktopBounds := capture.PrimaryDisplayBounds()
				input.SetScreenMapping(meta.Width, meta.Height, desktopBounds)
				payload, _ := json.Marshal(map[string]any{
					"type":           "screen_info",
					"width":          meta.Width,
					"height":         meta.Height,
					"desktop_width":  desktopBounds.Dx(),
					"desktop_height": desktopBounds.Dy(),
				})
				session.sendControl(payload)

				if capture.VP8Available() && videoTrack != nil {
					vp8Cancel = capture.StartVP8Pipeline(videoTrack, meta, vp8Frames, session.stop)
				} else {
					log.Printf("session %s: VP8 unavailable, using JPEG DataChannel fallback", msg.SessionID)
				}
			},
		})
		session.vp8Cancel = func() {
			if vp8Cancel != nil {
				vp8Cancel()
			}
		}
	}

	session.vp8Cancel = func() {}

	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c == nil {
			return
		}
		candidate, err := json.Marshal(c.ToJSON())
		if err != nil {
			return
		}
		_ = m.signal.Send(signal.Message{
			Type:      "ice_candidate",
			SessionID: msg.SessionID,
			Candidate: string(candidate),
		})
	})

	pc.OnDataChannel(func(dc *webrtc.DataChannel) {
		session.mu.Lock()
		session.controlDC = dc
		session.mu.Unlock()
		dc.OnOpen(func() {
			log.Printf("control datachannel open session=%s", msg.SessionID)
			if m.clipboardEnabled == nil || m.clipboardEnabled() {
				session.clipboardSync = clipboard.StartSync(session.stop, session.sendControl)
			}
			startStream()
		})
		dc.OnMessage(func(dcMsg webrtc.DataChannelMessage) {
			if m.onInput != nil {
				m.onInput(msg.SessionID, dcMsg.Data, session.sendControl)
			}
		})
	})

	if err := pc.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  msg.SDP,
	}); err != nil {
		session.Close()
		return nil, err
	}

	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		session.Close()
		return nil, err
	}
	if err := pc.SetLocalDescription(answer); err != nil {
		session.Close()
		return nil, err
	}

	if err := m.signal.Send(signal.Message{
		Type:      "webrtc_answer",
		SessionID: msg.SessionID,
		SDP:       answer.SDP,
	}); err != nil {
		session.Close()
		return nil, err
	}

	return session, nil
}

type Session struct {
	id             string
	pc             *webrtc.PeerConnection
	signal         *signal.Client
	screen         *capture.Screen
	videoTrack     *webrtc.TrackLocalStaticSample
	streamCancel   func()
	vp8Cancel      func()
	stop           chan struct{}
	stopOnce       sync.Once
	controlDC      *webrtc.DataChannel
	clipboardSync  *clipboard.Sync
	mu             sync.Mutex
	streamStarted  bool
}

func (s *Session) sendControl(payload []byte) {
	s.mu.Lock()
	dc := s.controlDC
	s.mu.Unlock()
	if dc == nil || dc.ReadyState() != webrtc.DataChannelStateOpen {
		return
	}
	if err := dc.Send(payload); err != nil {
		log.Printf("session %s: datachannel send failed (%d bytes): %v", s.id, len(payload), err)
	}
}

func (s *Session) Close() {
	s.stopOnce.Do(func() {
		close(s.stop)
	})
	if s.vp8Cancel != nil {
		s.vp8Cancel()
	}
	if s.streamCancel != nil {
		s.streamCancel()
	}
	if s.pc != nil {
		_ = s.pc.Close()
	}
}

func AddICECandidate(pc *webrtc.PeerConnection, candidate string) error {
	var init webrtc.ICECandidateInit
	if err := json.Unmarshal([]byte(candidate), &init); err != nil {
		return err
	}
	return pc.AddICECandidate(init)
}
