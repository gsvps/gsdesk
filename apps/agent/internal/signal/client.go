package signal

import (
	"encoding/json"
	"log"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/clouddesk/agent/internal/netutil"
	"github.com/gorilla/websocket"
)

type Message struct {
	Type      string `json:"type"`
	SessionID string `json:"session_id,omitempty"`
	DeviceID  string `json:"device_id,omitempty"`
	SDP       string `json:"sdp,omitempty"`
	Candidate string `json:"candidate,omitempty"`
	Nonce     string `json:"nonce,omitempty"`
	Signature string `json:"signature,omitempty"`
	Timestamp int64  `json:"timestamp,omitempty"`
	Message   string `json:"message,omitempty"`
}

type Handler func(Message)

type Client struct {
	serverURL   string
	deviceID    string
	deviceToken string
	conn        *websocket.Conn
	onMessage   Handler
	connected   bool
	stop        chan struct{}
	connMu      sync.Mutex
}

func New(serverURL, deviceID, deviceToken string, onMessage Handler) *Client {
	return &Client{
		serverURL:   strings.TrimRight(serverURL, "/"),
		deviceID:    deviceID,
		deviceToken: deviceToken,
		onMessage:   onMessage,
	}
}

func (c *Client) Connect() error {
	c.stop = make(chan struct{})
	go c.maintainConnection()
	return nil
}

func (c *Client) maintainConnection() {
	backoff := 2 * time.Second
	for {
		select {
		case <-c.stop:
			return
		default:
		}

		if err := c.dialOnce(); err != nil {
			log.Printf("websocket connect failed: %v (retry in %s)", err, backoff)
			select {
			case <-c.stop:
				return
			case <-time.After(backoff):
			}
			if backoff < 30*time.Second {
				backoff *= 2
			}
			continue
		}

		backoff = 2 * time.Second
		log.Printf("websocket connected device=%s", c.deviceID)
		heartbeatStop := make(chan struct{})
		go c.heartbeatLoop(heartbeatStop)
		c.readLoop()
		close(heartbeatStop)

		c.connMu.Lock()
		c.connected = false
		if c.conn != nil {
			_ = c.conn.Close()
			c.conn = nil
		}
		c.connMu.Unlock()

		log.Printf("websocket disconnected, reconnecting...")
		select {
		case <-c.stop:
			return
		case <-time.After(backoff):
		}
	}
}

func (c *Client) dialOnce() error {
	wsBase := strings.Replace(c.serverURL, "https://", "wss://", 1)
	wsBase = strings.Replace(wsBase, "http://", "ws://", 1)
	u, err := url.Parse(wsBase + "/ws/device/" + c.deviceID)
	if err != nil {
		return err
	}
	q := u.Query()
	q.Set("token", c.deviceToken)
	u.RawQuery = q.Encode()

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
		Proxy:            netutil.ProxyFunc,
	}
	conn, _, err := dialer.Dial(u.String(), nil)
	if err != nil {
		return err
	}

	c.connMu.Lock()
	c.conn = conn
	c.connected = true
	c.connMu.Unlock()
	return nil
}

func (c *Client) readLoop() {
	for {
		c.connMu.Lock()
		conn := c.conn
		c.connMu.Unlock()
		if conn == nil {
			return
		}

		_, data, err := conn.ReadMessage()
		if err != nil {
			log.Printf("websocket read error: %v", err)
			return
		}
		var msg Message
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		if c.onMessage != nil {
			c.onMessage(msg)
		}
	}
}

func (c *Client) heartbeatLoop(stop <-chan struct{}) {
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			if err := c.Send(Message{
				Type:      "heartbeat",
				DeviceID:  c.deviceID,
				Timestamp: time.Now().UnixMilli(),
			}); err != nil {
				return
			}
		}
	}
}

func (c *Client) Send(msg Message) error {
	c.connMu.Lock()
	conn := c.conn
	c.connMu.Unlock()
	if conn == nil {
		return nil
	}
	raw, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return conn.WriteMessage(websocket.TextMessage, raw)
}

func (c *Client) IsConnected() bool {
	c.connMu.Lock()
	defer c.connMu.Unlock()
	return c.connected && c.conn != nil
}

func (c *Client) Close() {
	if c.stop != nil {
		select {
		case <-c.stop:
		default:
			close(c.stop)
		}
	}
	c.connMu.Lock()
	c.connected = false
	if c.conn != nil {
		_ = c.conn.Close()
		c.conn = nil
	}
	c.connMu.Unlock()
}
