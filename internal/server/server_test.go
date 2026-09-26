package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"testing/fstest"

	"github.com/mardwerk/unit-generator/internal/library"
	"github.com/mardwerk/unit-generator/internal/parity"
	"github.com/mardwerk/unit-generator/internal/provider"
	"github.com/mardwerk/unit-generator/internal/research"
	s "github.com/mardwerk/unit-generator/internal/schema"
	"github.com/mardwerk/unit-generator/internal/unit"
)

// scripted answers each call with the next recorded output.
type scripted struct {
	mu      sync.Mutex
	outputs []any
	gate    chan struct{}
	entered chan struct{}
}

func (m *scripted) ID() string { return "test:scripted" }

func (m *scripted) Generate(ctx context.Context, _ unit.ModelRequest) (unit.ModelResponse, error) {
	if m.entered != nil {
		m.entered <- struct{}{}
	}
	if m.gate != nil {
		select {
		case <-m.gate:
		case <-ctx.Done():
			return unit.ModelResponse{}, ctx.Err()
		}
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	output := m.outputs[0]
	m.outputs = m.outputs[1:]
	return unit.ModelResponse{Output: s.Clone(output)}, nil
}

// recorded returns a recorded request with the model outputs of its
// planned draft and review.
func recorded(t *testing.T) (*s.Object, []any) {
	t.Helper()
	drafts, _ := parity.Entries("draftUnit")
	reviews, _ := parity.Entries("reviewDraft")
	outputs := func(entry *s.Object) []any {
		model, _ := entry.Get("model")
		exchanges, _ := model.(*s.Object).Get("exchanges")
		var out []any
		for _, exchange := range exchanges.([]any) {
			response, _ := exchange.(*s.Object).Get("response")
			output, _ := response.(*s.Object).Get("output")
			out = append(out, output)
		}
		return out
	}
	for _, review := range reviews {
		if _, ok := parity.Output(review); !ok {
			continue
		}
		runID := parity.Get(parity.Arg(review, 0), "draft", "run", "id")
		for _, draft := range drafts {
			output, ok := parity.Output(draft)
			if !ok || parity.Get(output, "run", "id") != runID || len(outputs(draft)) != 2 {
				continue
			}
			request := parity.Get(parity.Arg(draft, 0), "request").(*s.Object)
			return request, append(outputs(draft), outputs(review)...)
		}
	}
	t.Fatal("no recorded run")
	return nil, nil
}

var page = fstest.MapFS{
	"index.html":   {Data: []byte(`<!doctype html><meta name="unitlab-session" content="__UNITLAB_SESSION__"><title>t</title>`)},
	"app.js":       {Data: []byte("console.log(1)")},
	"styles.css":   {Data: []byte("body{}")},
	"mardwerk.png": {Data: []byte("\x89PNG")},
}

type harness struct {
	t      *testing.T
	server *Server
	url    string
	root   string
}

func start(t *testing.T, model unit.Model, change func(*Config)) *harness {
	t.Helper()
	root := t.TempDir()
	t.Setenv("OPENROUTER_API_KEY", "")
	t.Setenv("OPENROUTER_MODEL", "")
	lib, _ := library.Open(filepath.Join(root, "settings.json"), filepath.Join(root, "library"))
	profiles, _ := library.OpenProfiles(filepath.Join(root, "profiles"))
	env, _ := provider.LoadEnvironment(filepath.Join(root, ".env"))
	config := Config{Env: env, Library: lib, Profiles: profiles, Research: research.New(nil), Assets: page, TestModel: model, Version: "test"}
	if change != nil {
		change(&config)
	}
	srv, err := New(config)
	if err != nil {
		t.Fatal(err)
	}
	url, err := srv.Listen(0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = srv.Close() })
	return &harness{t: t, server: srv, url: url, root: root}
}

func (h *harness) call(method, operation string, body any, headers map[string]string) (int, *s.Object) {
	h.t.Helper()
	var reader io.Reader
	if body != nil {
		reader = strings.NewReader(s.Stringify(s.FromGoValue(body)))
	}
	request, _ := http.NewRequest(method, h.server.Origin()+"/api/v1/"+operation, reader)
	request.Header.Set("Authorization", "Bearer "+h.server.Token())
	if body != nil {
		request.Header.Set("Origin", h.server.Origin())
		request.Header.Set("Content-Type", "application/json")
	}
	for key, value := range headers {
		if value == "" {
			request.Header.Del(key)
		} else {
			request.Header.Set(key, value)
		}
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		h.t.Fatal(err)
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(response.Body)
	value, err := s.Decode(raw)
	if err != nil {
		h.t.Fatalf("%s: unreadable response %q", operation, raw)
	}
	object, _ := value.(*s.Object)
	return response.StatusCode, object
}

func (h *harness) post(operation string, body any) *s.Object {
	h.t.Helper()
	status, value := h.call(http.MethodPost, operation, body, nil)
	if status != 200 {
		h.t.Fatalf("%s: %d %s", operation, status, s.Stringify(value))
	}
	return value
}

func errorOf(value *s.Object) (string, string) {
	body, _ := value.Get("error")
	code, _ := body.(*s.Object).Get("code")
	message, _ := body.(*s.Object).Get("message")
	return code.(string), message.(string)
}

func TestStagesRunThroughTheAPI(t *testing.T) {
	request, outputs := recorded(t)
	h := start(t, &scripted{outputs: outputs}, nil)
	prepared := h.post("prepare", map[string]any{"request": request})
	if kind, _ := prepared.Get("kind"); kind != "prepared" {
		t.Fatalf("prepared %v", kind)
	}
	draft := h.post("draft", map[string]any{"prepared": prepared})
	checked := h.post("check", map[string]any{"draft": draft})
	result := h.post("review", map[string]any{"checked": checked})
	if kind, _ := result.Get("kind"); kind != "result" {
		t.Fatalf("result %v", kind)
	}
	imported := h.post("inspect", map[string]any{"artifact": result})
	if kind, _ := imported.Get("kind"); kind != "result" || parity.Canonical(parity.Get(imported, "artifact")) != parity.Canonical(result) {
		t.Error("inspect changed the Result")
	}
	markdown := h.post("render", map[string]any{"artifact": result})
	if text, _ := markdown.Get("markdown"); !strings.HasPrefix(text.(string), "# ") {
		t.Errorf("markdown %v", text)
	}
	view := h.post("view", map[string]any{"artifact": result})
	if !view.Has("stats") || parity.Get(view, "view", "kind") != "result" {
		t.Errorf("view %s", s.Stringify(view)[:200])
	}
	entry := h.post("library/save", map[string]any{"artifact": result})
	listing := h.post("library/load", map[string]any{"id": parity.Get(entry, "id")})
	if parity.Canonical(parity.Get(listing, "artifact")) != parity.Canonical(result) {
		t.Error("library round trip changed the Result")
	}
	revision := s.Clone(request).(*s.Object).
		Set("previous", s.NewObject().Set("resultId", parity.Get(result, "id")).Set("draft", parity.Get(result, "candidate")).Set("findings", parity.Get(result, "findings"))).
		Set("feedback", "Prioritize support while preserving confirmed decisions.")
	next := h.post("prepare", map[string]any{"request": revision})
	if parity.Get(next, "request", "previous", "resultId") != parity.Get(result, "id") {
		t.Error("the revision lost its previous Result")
	}
}

func TestPrepareKeepsProvenanceAndRefusesServerFiles(t *testing.T) {
	request, _ := recorded(t)
	h := start(t, &scripted{}, nil)
	documents, _ := request.Get("documents")
	first := documents.([]any)[0]
	mixed := s.Clone(request).(*s.Object).Set("documents", []any{first, s.NewObject().Set("id", "new-rules").Set("kind", "rules").Set("text", "Explicit additional rules.")})
	prepared := h.post("prepare", map[string]any{"request": mixed})
	resolved := parity.Get(prepared, "request", "documents").([]any)
	if parity.Canonical(parity.Get(resolved[0], "origin")) != parity.Canonical(parity.Get(first, "origin")) || parity.Get(resolved[1], "origin", "access") != "supplied" {
		t.Error("provenance changed")
	}
	for _, unsafe := range []*s.Object{
		s.Clone(request).(*s.Object).Set("documents", []any{s.NewObject().Set("id", "secret").Set("kind", "source").Set("file", "/etc/passwd")}),
		s.Clone(request).(*s.Object).Set("previousResultFile", "/etc/passwd"),
	} {
		status, value := h.call(http.MethodPost, "prepare", map[string]any{"request": unsafe}, nil)
		if _, message := errorOf(value); status != 400 || !regexp.MustCompile(`Upload|Import`).MatchString(message) {
			t.Errorf("%d %s", status, message)
		}
	}
	tampered := s.Clone(prepared).(*s.Object)
	parity.Get(tampered, "request").(*s.Object).Set("task", "Different input without a new preparation.")
	status, value := h.call(http.MethodPost, "inspect", map[string]any{"artifact": tampered}, nil)
	if _, message := errorOf(value); status != 400 || !strings.Contains(message, "hash") {
		t.Errorf("inspect %d %s", status, message)
	}
	if status, _ := h.call(http.MethodPost, "draft", map[string]any{"prepared": tampered}, nil); status != 400 {
		t.Errorf("draft of a tampered request: %d", status)
	}
}

func TestThePageCarriesTheSessionAndOperationsNeedIt(t *testing.T) {
	h := start(t, &scripted{}, nil)
	for _, path := range []string{"/", "/index.html"} {
		response, err := http.Get(h.server.Origin() + path)
		if err != nil {
			t.Fatal(err)
		}
		html, _ := io.ReadAll(response.Body)
		response.Body.Close()
		token := regexp.MustCompile(`<meta name="unitlab-session" content="([a-f0-9]{64})"`).FindSubmatch(html)
		if response.StatusCode != 200 || response.Header.Get("Cache-Control") != "no-store" || token == nil || string(token[1]) != h.server.Token() {
			t.Errorf("%s: %d %s", path, response.StatusCode, html)
		}
	}
	foreign, _ := http.NewRequest(http.MethodGet, h.url, nil)
	foreign.Header.Set("Origin", "https://example.org")
	response, _ := http.DefaultClient.Do(foreign)
	body, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != 403 || bytes.Contains(body, []byte(h.server.Token())) {
		t.Errorf("foreign page %d", response.StatusCode)
	}
	unauthenticated, _ := http.Get(h.server.Origin() + "/api/v1/provider")
	raw, _ := io.ReadAll(unauthenticated.Body)
	unauthenticated.Body.Close()
	if unauthenticated.StatusCode != 401 || !bytes.Contains(raw, []byte("SESSION_REQUIRED")) {
		t.Errorf("unauthenticated %d", unauthenticated.StatusCode)
	}
	request := map[string]any{"request": map[string]any{}}
	for headers, want := range map[*map[string]string]int{
		{"Origin": "https://example.org"}: 403,
		{"Origin": ""}:                    403,
		{"Authorization": "Bearer wrong"}: 401,
		{"Content-Type": "text/plain"}:    415,
	} {
		if status, _ := h.call(http.MethodPost, "prepare", request, *headers); status != want {
			t.Errorf("%v: %d, want %d", *headers, status, want)
		}
	}
	if status, _ := h.call(http.MethodPost, "unknown", map[string]any{}, nil); status != 404 {
		t.Errorf("unknown %d", status)
	}
	connection, _ := net.Dial("tcp", strings.TrimPrefix(h.server.Origin(), "http://"))
	_, _ = connection.Write([]byte("GET / HTTP/1.1\r\nHost: example.org\r\nConnection: close\r\n\r\n"))
	reply, _ := io.ReadAll(connection)
	connection.Close()
	if !bytes.HasPrefix(reply, []byte("HTTP/1.1 403")) {
		t.Errorf("foreign host: %s", reply[:min(len(reply), 40)])
	}
	traversal, _ := http.Get(h.server.Origin() + "/client/..%2f..%2fgo.mod")
	traversal.Body.Close()
	if traversal.StatusCode != 404 {
		t.Errorf("traversal %d", traversal.StatusCode)
	}
	invalid, _ := http.NewRequest(http.MethodPost, h.server.Origin()+"/api/v1/prepare", strings.NewReader("{invalid"))
	invalid.Header.Set("Authorization", "Bearer "+h.server.Token())
	invalid.Header.Set("Origin", h.server.Origin())
	invalid.Header.Set("Content-Type", "application/json")
	reply2, _ := http.DefaultClient.Do(invalid)
	raw, _ = io.ReadAll(reply2.Body)
	reply2.Body.Close()
	if reply2.StatusCode != 400 || !bytes.Contains(raw, []byte("INVALID_JSON")) {
		t.Errorf("invalid JSON %d %s", reply2.StatusCode, raw)
	}
}

func TestEditableInputsAreNotExecutableRequests(t *testing.T) {
	request, _ := recorded(t)
	h := start(t, &scripted{}, nil)
	unfinished := s.Clone(request).(*s.Object).
		Set("character", s.NewObject().Set("name", "New character").Set("work", "").Set("scope", "")).
		Set("task", "").
		Set("documents", []any{s.NewObject().Set("id", "").Set("kind", "source").Set("url", "unfinished URL")}).
		Set("constraints", s.NewObject().Set("unfinished", true))
	restored := h.post("inspect", map[string]any{"artifact": unfinished, "editable": true})
	if kind, _ := restored.Get("kind"); kind != "request" || parity.Canonical(parity.Get(restored, "artifact")) != parity.Canonical(unfinished) {
		t.Error("the editable request changed")
	}
	for _, body := range []map[string]any{
		{"request": unfinished},
	} {
		if status, _ := h.call(http.MethodPost, "prepare", body, nil); status != 400 {
			t.Errorf("prepared an unfinished request: %d", status)
		}
	}
	if status, _ := h.call(http.MethodPost, "inspect", map[string]any{"artifact": unfinished}, nil); status != 400 {
		t.Errorf("inspect accepted an unfinished request: %d", status)
	}
	broken := s.Clone(unfinished).(*s.Object).Set("character", nil)
	if status, _ := h.call(http.MethodPost, "inspect", map[string]any{"artifact": broken, "editable": true}, nil); status != 400 {
		t.Errorf("inspect accepted a request without a character: %d", status)
	}
}

func TestHealthShowsTheMaskedKeyFromEnvFile(t *testing.T) {
	key := "sk-or-v1-" + strings.Repeat("0", 61) + "abc"
	h := start(t, nil, func(config *Config) {
		dir := t.TempDir()
		_ = os.WriteFile(filepath.Join(dir, ".env"), []byte("OPENROUTER_API_KEY="+key+"\n"), 0o600)
		config.Env, _ = provider.LoadEnvironment(filepath.Join(dir, ".env"))
	})
	status, health := h.call(http.MethodGet, "health", nil, nil)
	raw := s.Stringify(health)
	if status != 200 || parity.Get(health, "key", "source") != "env-file" || parity.Get(health, "key", "hint") != "sk-or-v1-000...abc" ||
		parity.Get(health, "key", "configured") != true || parity.Get(health, "provider", "ready") != true || strings.Contains(raw, key) {
		t.Errorf("health %s", raw)
	}
	state := h.post("provider", map[string]any{"provider": "codex"})
	if state.Has("apiKey") || strings.Contains(s.Stringify(state), key) || parity.Get(state, "key", "source") != "env-file" {
		t.Errorf("state %s", s.Stringify(state))
	}
	state = h.post("provider", map[string]any{"provider": "openrouter", "apiKey": "entered-" + strings.Repeat("x", 40)})
	if parity.Get(state, "key", "source") != "settings" || strings.Contains(s.Stringify(state), "entered-") {
		t.Errorf("state %s", s.Stringify(state))
	}
}

func TestModelStagesNeedAProviderAndLockSettings(t *testing.T) {
	request, outputs := recorded(t)
	h := start(t, nil, nil)
	prepared := h.post("prepare", map[string]any{"request": request})
	status, value := h.call(http.MethodPost, "draft", map[string]any{"prepared": prepared}, nil)
	if code, _ := errorOf(value); status != 400 || code != "PROVIDER_REQUIRED" {
		t.Errorf("draft without a key: %d %s", status, code)
	}
	model := &scripted{outputs: outputs, gate: make(chan struct{}), entered: make(chan struct{}, 4)}
	busy := start(t, model, nil)
	prepared = busy.post("prepare", map[string]any{"request": request})
	done := make(chan struct{})
	go func() {
		defer close(done)
		busy.post("draft", map[string]any{"prepared": prepared})
	}()
	<-model.entered
	status, value = busy.call(http.MethodPost, "provider", map[string]any{"provider": "codex"}, nil)
	if code, _ := errorOf(value); status != 409 || code != "BUSY" {
		t.Errorf("provider change while drafting: %d %s", status, code)
	}
	if status, _ := busy.call(http.MethodPost, "check", map[string]any{"draft": map[string]any{}}, nil); status != 400 {
		t.Errorf("independent work was blocked: %d", status)
	}
	close(model.gate)
	<-done
	if status, _ := busy.call(http.MethodPost, "provider", map[string]any{"provider": "codex"}, nil); status != 200 {
		t.Errorf("provider change after drafting: %d", status)
	}
}

func TestModelFailuresReturnSafeFactsAndUsage(t *testing.T) {
	request, _ := recorded(t)
	cost := 0.002
	failing := failingModel{err: &unit.ModelError{Message: "PRIVATE provider text", Usage: &unit.Usage{CostUSD: &cost}, Failure: &unit.Failure{Code: unit.CodeRateLimit, Message: "OpenRouter rate limit reached (429).", Provider: "OpenRouter", HTTPStatus: 429}}}
	h := start(t, failing, nil)
	prepared := h.post("prepare", map[string]any{"request": request})
	status, value := h.call(http.MethodPost, "draft", map[string]any{"prepared": prepared}, nil)
	code, message := errorOf(value)
	if status != 502 || code != unit.CodeRateLimit || strings.Contains(s.Stringify(value), "PRIVATE") || !strings.Contains(message, "rate limit") ||
		parity.Get(value, "error", "usage", "costUsd") != 0.002 || parity.Get(value, "error", "details", "stage") != "draft" {
		t.Errorf("%d %s", status, s.Stringify(value))
	}
}

type failingModel struct{ err error }

func (m failingModel) ID() string { return "test:failing" }
func (m failingModel) Generate(context.Context, unit.ModelRequest) (unit.ModelResponse, error) {
	return unit.ModelResponse{}, m.err
}

type fakeImages struct {
	calls int
	png   []byte
}

func (f *fakeImages) Model() string { return "meta/muse-image" }
func (f *fakeImages) Generate(context.Context, string) (provider.Image, error) {
	f.calls++
	cost := 0.004
	return provider.Image{PNG: f.png, Usage: &unit.Usage{CostUSD: &cost}}, nil
}

func TestIconGenerationNeedsConfirmationModelAndDestination(t *testing.T) {
	request, outputs := recorded(t)
	images := &fakeImages{png: []byte("\x89PNG\r\n\x1a\nrest")}
	h := start(t, &scripted{outputs: outputs}, func(config *Config) { config.TestImages = images })
	draft := h.post("draft", map[string]any{"prepared": h.post("prepare", map[string]any{"request": request})})
	icons := h.post("library/icons", map[string]any{"artifact": draft})
	first := parity.Get(icons, "icons").([]any)[1].(*s.Object)
	key, _ := first.Get("key")
	destination, _ := first.Get("path")
	base := map[string]any{"artifact": draft, "iconKey": key, "model": "meta/muse-image", "confirmed": true, "destination": destination}
	with := func(change string, value any) map[string]any {
		out := map[string]any{}
		for k, v := range base {
			out[k] = v
		}
		out[change] = value
		return out
	}
	for _, c := range []struct {
		body   map[string]any
		status int
	}{
		{with("confirmed", false), 400},
		{with("iconKey", "ability:not-this-unit"), 400},
		{with("model", "other/model"), 409},
		{with("destination", "/tmp/elsewhere.png"), 409},
	} {
		if status, value := h.call(http.MethodPost, "library/icon/generate", c.body, nil); status != c.status {
			t.Errorf("%v: %d %s", c.body["iconKey"], status, s.Stringify(value))
		}
	}
	if images.calls != 0 {
		t.Fatalf("a rejected request generated %d images", images.calls)
	}
	generated := h.post("library/icon/generate", base)
	if images.calls != 1 || parity.Get(generated, "usage", "costUsd") != 0.004 || !strings.HasPrefix(parity.Get(generated, "icons", "icons").([]any)[1].(*s.Object).Keys()[0], "key") {
		t.Errorf("generated %s", s.Stringify(generated)[:200])
	}
	if data := parity.Get(parity.Get(generated, "icons", "icons").([]any)[1], "dataUrl"); data == nil {
		t.Error("the new icon is not shown")
	}
}

func TestResearchReturnsReusableSources(t *testing.T) {
	transport := roundTrip(func(r *http.Request) *http.Response {
		if r.URL.Host != "en.wikipedia.org" || r.URL.Query().Get("generator") == "images" {
			return &http.Response{StatusCode: 404, Body: io.NopCloser(strings.NewReader("")), Header: http.Header{}}
		}
		page := map[string]any{"pageid": 1, "title": "Monkey D. Luffy", "extract": "Luffy is a fictional character. His body stretches.", "index": 1, "pageprops": map[string]any{"wikibase-shortdesc": "Fictional character from One Piece"}}
		raw, _ := json.Marshal(map[string]any{"query": map[string]any{"pages": []any{page}}})
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(raw)), Header: http.Header{"Content-Type": {"application/json"}}}
	})
	h := start(t, &scripted{}, func(config *Config) { config.Research = research.New(&http.Client{Transport: transport}) })
	sources := h.post("research", map[string]any{"name": "Luffy"})
	if kind, _ := sources.Get("kind"); kind != "sources" {
		t.Fatalf("sources %s", s.Stringify(sources))
	}
	prepared := h.post("prepare", map[string]any{"sources": sources, "profileId": unit.DefaultProfile().ID})
	if parity.Get(prepared, "request", "character", "name") != "Monkey D. Luffy" {
		t.Error("sources did not prepare")
	}
	legacy := h.post("character", map[string]any{"name": "Luffy"})
	if kind, _ := legacy.Get("kind"); kind != "prepared" {
		t.Errorf("character %v", kind)
	}
	saved := h.post("library/save", map[string]any{"artifact": sources})
	if kind, _ := saved.Get("kind"); kind != "sources" {
		t.Errorf("saved %v", kind)
	}
}

type roundTrip func(*http.Request) *http.Response

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r), nil }
