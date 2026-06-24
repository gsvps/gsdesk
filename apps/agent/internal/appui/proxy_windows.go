//go:build windows

package appui

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/clouddesk/agent/internal/config"
)

func mountClientHandlers(mux *http.ServeMux, cfg *config.Config) {
	mux.Handle("/api/", newAPIProxy(cfg))
	mux.Handle("/", embeddedUIHandler())
}

func newAPIProxy(cfg *config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if cfg == nil {
			http.Error(w, "config unavailable", http.StatusBadGateway)
			return
		}
		target, err := url.Parse(strings.TrimRight(strings.TrimSpace(cfg.ServerURL), "/"))
		if err != nil || target.String() == "" {
			http.Error(w, "invalid server URL in config", http.StatusBadGateway)
			return
		}
		proxy := httputil.NewSingleHostReverseProxy(target)
		r.Host = target.Host
		r.URL.Scheme = target.Scheme
		r.URL.Host = target.Host
		proxy.ServeHTTP(w, r)
	})
}
