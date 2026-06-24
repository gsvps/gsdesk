//go:build !windows

package netutil

import (
	"net/http"
	"net/url"
)

func proxyFunc(req *http.Request) (*url.URL, error) {
	return http.ProxyFromEnvironment(req)
}
