package research

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
)

// transport answers requests from a handler instead of the network.
type transport struct {
	mu      sync.Mutex
	handle  func(*http.Request) *http.Response
	queries []*http.Request
}

func (t *transport) RoundTrip(request *http.Request) (*http.Response, error) {
	t.mu.Lock()
	t.queries = append(t.queries, request)
	t.mu.Unlock()
	if err := request.Context().Err(); err != nil {
		return nil, err
	}
	response := t.handle(request)
	if response == nil {
		return nil, io.ErrUnexpectedEOF
	}
	response.Request = request
	return response, nil
}

func researcher(handle func(*http.Request) *http.Response) (*Researcher, *transport) {
	fake := &transport{handle: handle}
	return New(&http.Client{Transport: fake}), fake
}

func jsonResponse(status int, value any) *http.Response {
	raw, _ := json.Marshal(value)
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": {"application/json"}},
		Body:       io.NopCloser(strings.NewReader(string(raw))),
	}
}

func textResponse(status int, kind, body string) *http.Response {
	header := http.Header{}
	if kind != "" {
		header.Set("Content-Type", kind)
	}
	return &http.Response{StatusCode: status, Header: header, Body: io.NopCloser(strings.NewReader(body))}
}

func notFound() *http.Response { return textResponse(404, "text/plain", "") }

type wikiPage map[string]any

func pageOf(id int, title, extract, description string, index int) wikiPage {
	return wikiPage{"pageid": id, "title": title, "extract": extract, "index": index, "pageprops": map[string]any{"wikibase-shortdesc": description}}
}

func (p wikiPage) with(key string, value any) wikiPage {
	out := wikiPage{}
	for k, v := range p {
		out[k] = v
	}
	out[key] = value
	return out
}

// wikipedia answers searches with search and page-ID queries from full.
// Other hosts and image queries answer 404.
func wikipedia(t *testing.T, search, full []wikiPage) func(*http.Request) *http.Response {
	return func(r *http.Request) *http.Response {
		if r.URL.Host != "en.wikipedia.org" || r.URL.Path != "/w/api.php" {
			return notFound()
		}
		query := r.URL.Query()
		if query.Get("generator") == "images" {
			return jsonResponse(200, map[string]any{"query": map[string]any{"pages": []any{}}})
		}
		if query.Get("formatversion") != "2" {
			t.Errorf("formatversion %q", query.Get("formatversion"))
		}
		if id := query.Get("pageids"); id != "" {
			var pages []any
			for _, p := range full {
				if itoa(p["pageid"].(int)) == id {
					pages = append(pages, p)
				}
			}
			return jsonResponse(200, map[string]any{"query": map[string]any{"pages": pages}})
		}
		return jsonResponse(200, map[string]any{"query": map[string]any{"pages": search}})
	}
}
