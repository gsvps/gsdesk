//go:build windows

package netutil

import (
	"net/http"
	"net/url"
	"os"
	"strings"

	"golang.org/x/sys/windows/registry"
)

func proxyFunc(req *http.Request) (*url.URL, error) {
	if u := proxyFromEnv(); u != nil {
		return u, nil
	}
	if u := proxyFromWindowsRegistry(); u != nil {
		return u, nil
	}
	return http.ProxyFromEnvironment(req)
}

func proxyFromEnv() *url.URL {
	for _, key := range []string{"HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"} {
		raw := strings.TrimSpace(os.Getenv(key))
		if raw == "" {
			continue
		}
		u, err := url.Parse(raw)
		if err == nil {
			return u
		}
	}
	return nil
}

func proxyFromWindowsRegistry() *url.URL {
	key, err := registry.OpenKey(
		registry.CURRENT_USER,
		`Software\Microsoft\Windows\CurrentVersion\Internet Settings`,
		registry.QUERY_VALUE,
	)
	if err != nil {
		return nil
	}
	defer key.Close()

	enable, _, err := key.GetIntegerValue("ProxyEnable")
	if err != nil || enable == 0 {
		return nil
	}

	server, _, err := key.GetStringValue("ProxyServer")
	if err != nil {
		return nil
	}
	return parseWindowsProxyServer(server)
}

func parseWindowsProxyServer(server string) *url.URL {
	server = strings.TrimSpace(server)
	if server == "" {
		return nil
	}

	if strings.Contains(server, "=") {
		chosen := ""
		fallback := ""
		for _, part := range strings.Split(server, ";") {
			part = strings.TrimSpace(part)
			lower := strings.ToLower(part)
			switch {
			case strings.HasPrefix(lower, "https="):
				chosen = part[strings.Index(part, "=")+1:]
			case strings.HasPrefix(lower, "http=") && fallback == "":
				fallback = part[strings.Index(part, "=")+1:]
			case fallback == "" && !strings.Contains(part, "="):
				fallback = part
			}
		}
		if chosen != "" {
			server = chosen
		} else if fallback != "" {
			server = fallback
		}
	}

	if !strings.Contains(server, "://") {
		server = "http://" + server
	}
	u, err := url.Parse(server)
	if err != nil {
		return nil
	}
	return u
}
