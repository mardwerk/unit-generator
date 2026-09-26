package research

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

func text(value string) *string { return &value }

func TestSuppliedTextKeepsAttributionWithoutClaimingRetrieval(t *testing.T) {
	r := New(nil)
	document, err := r.LoadDocument(context.Background(), DocumentSpec{ID: "source", Kind: "source", Text: text("  He stretches. "), SourceURL: text("https://example.test/character")}, ".")
	if err != nil {
		t.Fatal(err)
	}
	if document.Text != "He stretches." || document.Origin.Access != "supplied" || document.Origin.Location != "https://example.test/character" || !strings.Contains(*document.Origin.Note, "not retrieved or independently verified") {
		t.Errorf("document %+v", document)
	}
	for spec, want := range map[*DocumentSpec]string{
		{ID: "source", Kind: "source", Text: text("x"), File: text("x")}:                       "exactly one",
		{ID: "source", Kind: "source", Text: text("x"), SourceURL: text("file:///etc/passwd")}: "HTTP or HTTPS",
	} {
		if _, err := r.LoadDocument(context.Background(), *spec, "."); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("want %q, got %v", want, err)
		}
	}
	r.documentLimit = 5
	if _, err := r.LoadDocument(context.Background(), DocumentSpec{ID: "source", Kind: "source", Text: text("ééé")}, "."); err == nil || !strings.Contains(err.Error(), "byte limit") {
		t.Errorf("got %v", err)
	}
}

func TestLocalFilesAndSavedHTMLBecomeReadableText(t *testing.T) {
	directory := t.TempDir()
	_ = os.WriteFile(filepath.Join(directory, "article.html"), []byte(`<!doctype html><html><body><nav>Site links</nav><div class="mw-parser-output"><h2>Abilities</h2><p>Rubber &amp; speed.</p><script>bad()</script><div class="navbox">Other pages</div></div><footer>Ads</footer></body></html>`), 0o600)
	_ = os.WriteFile(filepath.Join(directory, "challenge.html"), []byte(`<html><head><title>Just a moment...</title></head><body>Enable cookies</body></html>`), 0o600)
	r := New(nil)
	document, err := r.LoadDocument(context.Background(), DocumentSpec{ID: "wiki", Kind: "source", File: text("article.html"), SourceURL: text("https://onepiece.fandom.com/wiki/Monkey_D._Luffy")}, directory)
	if err != nil {
		t.Fatal(err)
	}
	if document.Text != "Abilities\nRubber & speed." || document.Origin.Access != "local-file" || !strings.Contains(*document.Origin.Note, "not retrieved") {
		t.Errorf("document %q %+v", document.Text, document.Origin)
	}
	for _, c := range []struct {
		spec DocumentSpec
		want string
	}{
		{DocumentSpec{ID: "missing", Kind: "rules", File: text("missing.txt")}, "referenced file could not be read"},
		{DocumentSpec{ID: "blocked", Kind: "source", File: text("challenge.html")}, "access challenge"},
	} {
		if _, err := r.LoadDocument(context.Background(), c.spec, directory); err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("want %q, got %v", c.want, err)
		}
	}
	r.documentLimit = 10
	if _, err := r.LoadDocument(context.Background(), DocumentSpec{ID: "large", Kind: "rules", File: text("article.html")}, directory); err == nil || !strings.Contains(err.Error(), "byte limit") {
		t.Errorf("got %v", err)
	}
}

func TestRetrievalHandlesRedirectsChallengesFailuresBoundsAndTimeouts(t *testing.T) {
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/redirect":
			http.Redirect(w, r, "/article", http.StatusFound)
		case "/article":
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte(`<html><body><nav>Noise</nav><article><h1>Character</h1><p>A usable fact.</p></article></body></html>`))
		case "/blocked":
			w.WriteHeader(403)
		case "/challenge":
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte(`<title>Access Denied</title><main>Cloudflare challenge</main>`))
		case "/large":
			w.Header().Set("Content-Type", "text/plain")
			_, _ = w.Write([]byte(strings.Repeat("x", 200)))
		case "/binary":
			w.Header().Set("Content-Type", "application/octet-stream")
			_, _ = w.Write([]byte("binary"))
		case "/badredirect":
			w.Header().Set("Location", "file:///etc/passwd")
			w.WriteHeader(302)
		case "/slow":
			select {
			case <-r.Context().Done():
			case <-release:
			}
		}
	}))
	defer server.Close()
	defer close(release)
	spec := func(path string) DocumentSpec {
		return DocumentSpec{ID: "http", Kind: "source", URL: text(server.URL + path)}
	}
	r := New(nil)
	document, err := r.LoadDocument(context.Background(), spec("/redirect"), ".")
	if err != nil {
		t.Fatal(err)
	}
	if document.Text != "Character\nA usable fact." || document.Origin.Access != "retrieved" || document.Origin.Location != server.URL+"/article" || !regexp.MustCompile(`Retrieved at \d{4}-\d{2}-\d{2}T`).MatchString(*document.Origin.Note) {
		t.Errorf("document %q %+v", document.Text, document.Origin)
	}
	for path, want := range map[string]string{"/blocked": "HTTP 403", "/challenge": "access challenge", "/binary": "text or HTML", "/badredirect": "HTTP or HTTPS"} {
		if _, err := r.LoadDocument(context.Background(), spec(path), "."); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: want %q, got %v", path, want, err)
		}
	}
	bounded := New(nil)
	bounded.documentLimit = 100
	if _, err := bounded.LoadDocument(context.Background(), spec("/large"), "."); err == nil || !strings.Contains(err.Error(), "byte limit") {
		t.Errorf("large: %v", err)
	}
	slow := New(nil)
	slow.documentTimeout = 25 * time.Millisecond
	if _, err := slow.LoadDocument(context.Background(), spec("/slow"), "."); err == nil || !strings.Contains(err.Error(), "timed out") {
		t.Errorf("slow: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	time.AfterFunc(25*time.Millisecond, cancel)
	if _, err := r.LoadDocument(ctx, spec("/slow"), "."); err == nil || !strings.Contains(err.Error(), "cancelled") {
		t.Errorf("cancelled: %v", err)
	}
}

func TestFandom403UsesThePublicAPI(t *testing.T) {
	pageStatus := 403
	payload := map[string]any{"parse": map[string]any{"text": map[string]any{"*": `<div class="mw-parser-output"><p>Public article evidence.</p></div>`}}}
	r, fake := researcher(func(request *http.Request) *http.Response {
		if request.URL.Path == "/api.php" {
			return jsonResponse(200, payload)
		}
		return textResponse(pageStatus, "text/plain", "blocked")
	})
	spec := DocumentSpec{ID: "fandom", Kind: "source", URL: text("https://onepiece.fandom.com/wiki/Monkey_D._Luffy")}
	document, err := r.LoadDocument(context.Background(), spec, ".")
	if err != nil {
		t.Fatal(err)
	}
	note := *document.Origin.Note
	if document.Text != "Public article evidence." || document.Origin.Location != *spec.URL || !strings.Contains(note, "page returned HTTP 403") || !strings.Contains(note, "https://onepiece.fandom.com/api.php?action=parse") || len(fake.queries) != 2 {
		t.Errorf("document %q %s (%d calls)", document.Text, note, len(fake.queries))
	}
	payload = map[string]any{"error": map[string]any{"code": "missingtitle"}}
	if _, err := r.LoadDocument(context.Background(), spec, "."); err == nil || !strings.Contains(err.Error(), "did not return article HTML") {
		t.Errorf("missing: %v", err)
	}
	pageStatus = 404
	fake.queries = nil
	if _, err := r.LoadDocument(context.Background(), spec, "."); err == nil || !strings.Contains(err.Error(), "HTTP 404") || len(fake.queries) != 1 {
		t.Errorf("404: %v (%d calls)", err, len(fake.queries))
	}
}
