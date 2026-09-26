// Package web holds the built web client that `mardwerk-unit serve`
// embeds. Build it with `node src/web/build.mjs`; the output in src/web/dist is
// committed so the Go build needs no Node.js.
package web

import (
	"embed"
	"io/fs"
)

//go:embed dist
var dist embed.FS

// Assets are index.html, styles.css, app.js and mardwerk.png.
func Assets() fs.FS {
	assets, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err)
	}
	return assets
}
