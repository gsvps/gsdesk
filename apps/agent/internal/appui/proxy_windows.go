//go:build windows

package appui

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

func mountClientHandlers(mux *http.ServeMux, serverURL string) {
	mux.Handle("/api/", newAPIProxy(serverURL))
	mux.Handle("/", embeddedUIHandler())
}

func newAPIProxy(serverURL string) http.Handler {
	target, err := url.Parse(strings.TrimRight(serverURL, "/"))
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "invalid server URL in config", http.StatusBadGateway)
		})
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Host = target.Host
		r.URL.Scheme = target.Scheme
		r.URL.Host = target.Host
		proxy.ServeHTTP(w, r)
	})
}
