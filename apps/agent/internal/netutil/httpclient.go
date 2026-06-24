package netutil

import (
	"net/http"
	"net/url"
	"time"
)

// NewHTTPClient returns a client that respects HTTPS_PROXY and Windows system proxy.
func NewHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			Proxy: proxyFunc,
		},
	}
}

// ProxyFunc is used by WebSocket dialers.
func ProxyFunc(req *http.Request) (*url.URL, error) {
	return proxyFunc(req)
}
