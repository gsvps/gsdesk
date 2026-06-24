//go:build windows

package appui

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed all:ui/dist
var embeddedUI embed.FS

func embeddedUIHandler() http.Handler {
	sub, err := fs.Sub(embeddedUI, "ui/dist")
	if err != nil {
		return http.NotFoundHandler()
	}
	fileServer := http.FileServer(http.FS(sub))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if f, err := sub.Open(path); err != nil {
			r.URL.Path = "/"
		} else {
			_ = f.Close()
		}
		fileServer.ServeHTTP(w, r)
	})
}
