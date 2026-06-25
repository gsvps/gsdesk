package crypto

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"

	"github.com/gsvps/gsdesk/internal/config"
)

type KeyPair struct {
	PublicKey  string `json:"public_key"`
	PrivateKey string `json:"private_key"`
}

func keyPath() (string, error) {
	dir, err := config.DataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "device.key"), nil
}

func LoadOrGenerate() (*KeyPair, error) {
	path, err := keyPath()
	if err != nil {
		return nil, err
	}

	if raw, err := os.ReadFile(path); err == nil {
		var pair KeyPair
		if err := json.Unmarshal(raw, &pair); err == nil && pair.PublicKey != "" && pair.PrivateKey != "" {
			return &pair, nil
		}
	}

	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}

	pair := &KeyPair{
		PublicKey:  base64.StdEncoding.EncodeToString(pub),
		PrivateKey: base64.StdEncoding.EncodeToString(priv),
	}

	raw, err := json.MarshalIndent(pair, "", "  ")
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return nil, err
	}
	return pair, nil
}

func Sign(privateKeyBase64, message string) (string, error) {
	privRaw, err := base64.StdEncoding.DecodeString(privateKeyBase64)
	if err != nil {
		return "", err
	}
	if len(privRaw) != ed25519.PrivateKeySize {
		return "", errors.New("invalid private key size")
	}
	sig := ed25519.Sign(ed25519.PrivateKey(privRaw), []byte(message))
	return base64.StdEncoding.EncodeToString(sig), nil
}
