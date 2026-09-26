package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"sync"
	"testing"

	"github.com/mardwerk/unit-generator/src/cli/internal/library"
	"github.com/mardwerk/unit-generator/src/cli/internal/provider"
	"github.com/mardwerk/unit-generator/src/cli/internal/research"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
	"github.com/mardwerk/unit-generator/src/web"
)

// cycling replays recorded outputs in order, starting over when they run out.
type cycling struct {
	mu      sync.Mutex
	outputs []any
	next    int
}

func (m *cycling) ID() string { return "test:recorded" }

func (m *cycling) Generate(ctx context.Context, _ unit.ModelRequest) (unit.ModelResponse, error) {
	if err := ctx.Err(); err != nil {
		return unit.ModelResponse{}, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	output := m.outputs[m.next%len(m.outputs)]
	m.next++
	return unit.ModelResponse{Output: s.Clone(output)}, nil
}

// TestServeForBrowser serves the embedded web client for a manual or
// scripted browser check. It runs only with UNIT_BROWSER_PORT set, answers
// model calls from a recorded run, answers character lookups for "Luffy"
// from a fixture, and writes the recorded request to UNIT_BROWSER_DIR.
func TestServeForBrowser(t *testing.T) {
	port, err := strconv.Atoi(os.Getenv("UNIT_BROWSER_PORT"))
	if err != nil {
		t.Skip("set UNIT_BROWSER_PORT to serve the web client for a browser check")
	}
	dir := os.Getenv("UNIT_BROWSER_DIR")
	request, outputs := recorded(t)
	_ = os.WriteFile(filepath.Join(dir, "request.json"), []byte(s.Indent(request)), 0o600)
	_ = os.WriteFile(filepath.Join(dir, ".env"), []byte("OPENROUTER_API_KEY=sk-or-v1-"+string(bytes.Repeat([]byte("0"), 61))+"xyz\n"), 0o600)
	t.Setenv("OPENROUTER_API_KEY", "")
	env, _ := provider.LoadEnvironment(filepath.Join(dir, ".env"))
	lib, _ := library.Open(filepath.Join(dir, "settings.json"), filepath.Join(dir, "library"))
	profiles, _ := library.OpenProfiles(filepath.Join(dir, "profiles"))
	lookup := roundTrip(func(r *http.Request) *http.Response {
		if r.URL.Host != "en.wikipedia.org" || r.URL.Query().Get("generator") == "images" {
			return &http.Response{StatusCode: 404, Body: io.NopCloser(bytes.NewReader(nil)), Header: http.Header{}}
		}
		page := map[string]any{"pageid": 1, "title": "Monkey D. Luffy", "extract": "Luffy is a fictional character. His body stretches like rubber, and he punches from a distance.", "index": 1, "pageprops": map[string]any{"wikibase-shortdesc": "Fictional character from One Piece"}}
		raw, _ := json.Marshal(map[string]any{"query": map[string]any{"pages": []any{page}}})
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(raw)), Header: http.Header{"Content-Type": {"application/json"}}}
	})
	srv, err := New(Config{
		Env: env, Library: lib, Profiles: profiles, Research: research.New(&http.Client{Transport: lookup}),
		Example: request, Assets: web.Assets(), Version: "browser-check", TestModel: &cycling{outputs: outputs},
	})
	if err != nil {
		t.Fatal(err)
	}
	url, err := srv.Listen(port)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("serving %s", url)
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	<-stop
	_ = srv.Close()
}
