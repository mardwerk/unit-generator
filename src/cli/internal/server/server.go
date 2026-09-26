// Package server is the local HTTP API of the web app (`mardwerk-unit
// serve`). It listens on 127.0.0.1 only, accepts its own origin only, and
// requires the session token it embeds in the page it serves. Every
// operation delegates to the same Engine and adapters as the CLI.
package server

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"io"
	"io/fs"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/mardwerk/unit-generator/src/cli/internal/library"
	"github.com/mardwerk/unit-generator/src/cli/internal/provider"
	"github.com/mardwerk/unit-generator/src/cli/internal/research"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

const maxRequestBytes = 32_000_000

// Config holds explicit inputs; the server reads no other state.
type Config struct {
	// Env supplies OPENROUTER_* settings; Provider (openrouter or codex)
	// and Model are the initial connection.
	Env      provider.Environment
	Provider string
	Model    string
	Library  *library.Library
	Profiles *library.Profiles
	Research *research.Researcher
	// Example is the starter request the editor opens with; nil for none.
	Example any
	// Assets holds index.html, styles.css, app.js and mardwerk.png.
	Assets fs.FS
	// Version is reported by /api/v1/health.
	Version string
	// Tests may replace the model and image clients.
	TestModel  unit.Model
	TestImages ImageGenerator
}

// ImageGenerator creates one PNG for a prompt.
type ImageGenerator interface {
	Model() string
	Generate(ctx context.Context, prompt string) (provider.Image, error)
}

// Server is one running web app.
type Server struct {
	config     Config
	connection *connection
	token      string
	origin     string
	http       *http.Server
	listener   net.Listener

	mu        sync.Mutex
	active    int
	iconsBusy map[string]bool
}

// New prepares a server; Listen starts it.
func New(config Config) (*Server, error) {
	if config.Provider == "" {
		config.Provider = "openrouter"
	}
	connection, err := newConnection(config.Env, config.Provider, config.Model)
	if err != nil {
		return nil, err
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return nil, err
	}
	return &Server{config: config, connection: connection, token: hex.EncodeToString(secret), iconsBusy: map[string]bool{}}, nil
}

// Listen binds 127.0.0.1:port (0 picks a free port) and serves in the
// background. It returns the page URL.
func (srv *Server) Listen(port int) (string, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(port))
	if err != nil {
		return "", err
	}
	srv.listener = listener
	srv.origin = "http://" + listener.Addr().String()
	srv.http = &http.Server{Handler: srv, ReadHeaderTimeout: 15 * time.Second, ReadTimeout: 30 * time.Second}
	go func() { _ = srv.http.Serve(listener) }()
	return srv.origin + "/", nil
}

// Provider is the model connection as GET /api/v1/provider reports it.
func (srv *Server) Provider() ProviderState { return srv.connection.state() }

// Token is the session token API calls must present.
func (srv *Server) Token() string { return srv.token }

// Origin is the only accepted origin.
func (srv *Server) Origin() string { return srv.origin }

// Close stops the server and cancels running requests.
func (srv *Server) Close() error {
	if srv.http == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := srv.http.Shutdown(ctx); err != nil {
		return srv.http.Close()
	}
	return nil
}

// httpError is a deliberate API error.
type httpError struct {
	status        int
	code, message string
}

func (e *httpError) Error() string { return e.message }

func fail(status int, code, message string) error { return &httpError{status, code, message} }

// policy is the Content-Security-Policy. The page gets a fresh style nonce
// for the <style> elements its component library injects (scroll locking,
// select viewports); scripts stay limited to the app's own file.
func policy(styleNonce string) string {
	style := "style-src 'self'"
	if styleNonce != "" {
		style += " 'nonce-" + styleNonce + "'"
	}
	return "default-src 'self'; script-src 'self'; " + style + "; connect-src 'self'; img-src 'self' https: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
}

func (srv *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	header := w.Header()
	header.Set("Cache-Control", "no-store")
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Referrer-Policy", "no-referrer")
	header.Set("Content-Security-Policy", policy(""))
	if err := srv.handle(w, r); err != nil {
		writeError(w, err)
	}
}

func (srv *Server) handle(w http.ResponseWriter, r *http.Request) error {
	if "http://"+r.Host != srv.origin {
		return fail(403, "INVALID_HOST", "Use the local address printed by mardwerk-unit.")
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != srv.origin {
		return fail(403, "INVALID_ORIGIN", "The web app only accepts its own browser session.")
	}
	if !strings.HasPrefix(r.URL.Path, "/api/") {
		if r.Method != http.MethodGet {
			return fail(405, "METHOD_NOT_ALLOWED", "This resource requires GET.")
		}
		return srv.asset(w, r.URL.Path)
	}
	supplied := []byte(r.Header.Get("Authorization"))
	expected := []byte("Bearer " + srv.token)
	if subtle.ConstantTimeCompare(supplied, expected) != 1 {
		return fail(401, "SESSION_REQUIRED", "Reload the local page to reconnect.")
	}
	operation, ok := strings.CutPrefix(r.URL.Path, "/api/v1/")
	if !ok {
		return fail(404, "NOT_FOUND", "Unknown operation. The API is under /api/v1/.")
	}
	if r.Method == http.MethodGet {
		get, ok := srv.gets()[operation]
		if !ok {
			return fail(404, "NOT_FOUND", "Unknown operation.")
		}
		value, err := get()
		if err != nil {
			return err
		}
		return writeJSON(w, 200, value)
	}
	post, ok := srv.posts()[operation]
	if !ok {
		if _, isGet := srv.gets()[operation]; isGet {
			return fail(405, "METHOD_NOT_ALLOWED", "This operation requires GET.")
		}
		return fail(404, "NOT_FOUND", "Unknown operation.")
	}
	if r.Method != http.MethodPost {
		return fail(405, "METHOD_NOT_ALLOWED", "This operation requires POST.")
	}
	if r.Header.Get("Origin") != srv.origin {
		return fail(403, "INVALID_ORIGIN", "Operations require the web app's local origin.")
	}
	if media, _, _ := strings.Cut(r.Header.Get("Content-Type"), ";"); strings.TrimSpace(media) != "application/json" {
		return fail(415, "JSON_REQUIRED", "Send an application/json request.")
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxRequestBytes))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			return fail(413, "INPUT_TOO_LARGE", "Requests must be under 32 MB.")
		}
		return fail(400, "INVALID_JSON", "The request could not be read.")
	}
	payload, err := s.Decode(raw)
	if err != nil {
		return fail(400, "INVALID_JSON", "The request does not contain valid JSON.")
	}
	body, ok := payload.(*s.Object)
	if !ok {
		return fail(400, "INVALID_JSON", "Send a JSON object.")
	}
	if post.model {
		srv.mu.Lock()
		srv.active++
		srv.mu.Unlock()
		defer func() {
			srv.mu.Lock()
			srv.active--
			srv.mu.Unlock()
		}()
	}
	value, err := post.run(r.Context(), body)
	if err != nil {
		return err
	}
	if r.Context().Err() != nil {
		return nil
	}
	return writeJSON(w, 200, value)
}

func (srv *Server) busy() bool {
	srv.mu.Lock()
	defer srv.mu.Unlock()
	return srv.active > 0
}

func writeJSON(w http.ResponseWriter, status int, value any) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, err := io.WriteString(w, s.Stringify(s.FromGoValue(value)))
	return err
}

// writeError never includes provider text, only deliberate messages.
func writeError(w http.ResponseWriter, err error) {
	var known *httpError
	if errors.As(err, &known) {
		_ = writeJSON(w, known.status, s.NewObject().Set("error", s.NewObject().Set("code", known.code).Set("message", known.message)))
		return
	}
	var model *unit.ModelError
	if errors.As(err, &model) {
		failure := model.Failure
		if failure == nil {
			failure = &unit.Failure{Code: unit.CodeFailed, Message: "The model request failed. Check the provider configuration and retry this stage."}
		}
		body := s.NewObject().Set("code", failure.Code).Set("message", failure.Message).Set("details", s.FromGoValue(failure))
		if model.Usage != nil {
			body.Set("usage", s.FromGoValue(model.Usage))
		}
		_ = writeJSON(w, 502, s.NewObject().Set("error", body))
		return
	}
	message := err.Error()
	var invalid *s.Error
	if errors.As(err, &invalid) {
		var lines []string
		for i, issue := range invalid.Issues {
			if i == 8 {
				break
			}
			lines = append(lines, issue.PathString()+": "+issue.Message)
		}
		message = strings.Join(lines, "\n")
	}
	_ = writeJSON(w, 400, s.NewObject().Set("error", s.NewObject().Set("code", "OPERATION_FAILED").Set("message", message)))
}

var assets = map[string]string{
	"/":             "index.html",
	"/index.html":   "index.html",
	"/styles.css":   "styles.css",
	"/app.js":       "app.js",
	"/mardwerk.png": "mardwerk.png",
}

func (srv *Server) asset(w http.ResponseWriter, path string) error {
	name, ok := assets[path]
	if !ok || srv.config.Assets == nil {
		return fail(404, "NOT_FOUND", "Resource not found.")
	}
	content, err := fs.ReadFile(srv.config.Assets, name)
	if err != nil {
		return fail(404, "NOT_FOUND", "Resource not found. Build the web client (web/build.mjs) before starting the server.")
	}
	types := map[string]string{".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png"}
	extension := name[strings.LastIndexByte(name, '.'):]
	kind := types[extension]
	if kind != "image/png" {
		kind += "; charset=utf-8"
	}
	w.Header().Set("Content-Type", kind)
	if name == "index.html" {
		// Only the same-origin page can read this no-store HTML; API calls
		// still need the token.
		nonce := make([]byte, 16)
		if _, err := rand.Read(nonce); err != nil {
			return err
		}
		styleNonce := hex.EncodeToString(nonce)
		w.Header().Set("Content-Security-Policy", policy(styleNonce))
		page := strings.Replace(string(content), "__UNITLAB_SESSION__", srv.token, 1)
		content = []byte(strings.Replace(page, "__UNITLAB_STYLE_NONCE__", styleNonce, 1))
	}
	w.WriteHeader(200)
	_, err = w.Write(content)
	return err
}
