package provider

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	s "github.com/mardwerk/unit-generator/internal/schema"
	"github.com/mardwerk/unit-generator/internal/unit"
)

const testKey = "TEST_SECRET_KEY"

var testRequest = unit.ModelRequest{
	System: "Use only supplied evidence.",
	Prompt: "SOURCE_PRIVATE_TEXT",
	Schema: s.NewObject().
		Set("type", "object").
		Set("properties", s.NewObject().Set("role", s.NewObject().Set("type", "string"))).
		Set("required", []any{"role"}).
		Set("additionalProperties", false),
}

func completion(content, finish, refusal string) map[string]any {
	message := map[string]any{"role": "assistant", "content": content}
	if refusal != "" {
		message["refusal"] = refusal
	}
	return map[string]any{
		"id": "test-completion", "created": 1, "model": "provider/selected:free",
		"object": "chat.completion", "system_fingerprint": nil,
		"choices": []any{map[string]any{"index": 0, "finish_reason": finish, "message": message}},
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

// serve starts a fake OpenRouter and counts its calls.
func serve(t *testing.T, handler http.HandlerFunc) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	calls := &atomic.Int32{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		handler(w, r)
	}))
	t.Cleanup(server.Close)
	return server, calls
}

func client(t *testing.T, server *httptest.Server, o OpenRouterOptions) *OpenRouter {
	t.Helper()
	if o.APIKey == "" {
		o.APIKey = testKey
	}
	o.BaseURL = server.URL
	c, err := NewOpenRouter(o)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func modelError(t *testing.T, err error) *unit.ModelError {
	t.Helper()
	var failure *unit.ModelError
	if !errors.As(err, &failure) || failure.Failure == nil {
		t.Fatalf("expected a classified model error, got %v", err)
	}
	if regexp.MustCompile(`TEST_SECRET_KEY|SOURCE_PRIVATE_TEXT|PROVIDER_PRIVATE_TEXT|MODEL_PRIVATE`).MatchString(failure.Message + s.Stringify(s.FromGoValue(failure.Failure))) {
		t.Fatalf("error leaks private text: %s", failure.Message)
	}
	if failure.Cause != nil {
		t.Fatalf("error keeps a cause: %v", failure.Cause)
	}
	return failure
}

func TestOpenRouterSendsStrictStructuredFreeRequests(t *testing.T) {
	server, calls := serve(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" || r.Method != http.MethodPost {
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer "+testKey || r.Header.Get("X-OpenRouter-Title") != "mardwerk-unit" {
			t.Error("missing authorization or title header")
		}
		raw, _ := io.ReadAll(r.Body)
		body, err := s.Decode(raw)
		if err != nil {
			t.Fatal(err)
		}
		want := `{"model":"openrouter/free","reasoning":{"effort":"none"},"messages":[{"role":"system","content":"Use only supplied evidence."},{"role":"user","content":"SOURCE_PRIVATE_TEXT"}],"response_format":{"type":"json_schema","json_schema":{"name":"unit_result","strict":true,"schema":{"type":"object","properties":{"role":{"type":"string"}},"required":["role"],"additionalProperties":false}}},"provider":{"require_parameters":true,"max_price":{"prompt":"0","completion":"0","request":"0"}},"stream":false}`
		if got := s.Stringify(body); got != want {
			t.Errorf("body\n got %s\nwant %s", got, want)
		}
		writeJSON(w, 200, completion(`{"role":"support"}`, "stop", ""))
	})
	c := client(t, server, OpenRouterOptions{})
	if c.ID() != "openrouter:openrouter/free" {
		t.Errorf("id %s", c.ID())
	}
	response, err := c.Generate(context.Background(), testRequest)
	if err != nil {
		t.Fatal(err)
	}
	if s.Stringify(response.Output) != `{"role":"support"}` {
		t.Errorf("output %s", s.Stringify(response.Output))
	}
	u := response.Usage
	if u == nil || u.CostUSD != nil || u.InputTokens != nil || *u.ActualModel != "provider/selected:free" || *u.GenerationID != "test-completion" {
		t.Errorf("usage %s", s.Stringify(s.FromGoValue(u)))
	}
	if calls.Load() != 1 {
		t.Errorf("calls %d", calls.Load())
	}
}

func TestOpenRouterExplicitModelsWithoutFallback(t *testing.T) {
	for _, model := range []string{"provider/chosen:free", "provider/explicit-paid"} {
		server, _ := serve(t, func(w http.ResponseWriter, r *http.Request) {
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			provider := body["provider"].(map[string]any)
			_, capped := provider["max_price"]
			if body["model"] != model || body["models"] != nil || capped != strings.HasSuffix(model, ":free") {
				t.Errorf("model %s body %v", model, body)
			}
			writeJSON(w, 200, completion(`{}`, "stop", ""))
		})
		c := client(t, server, OpenRouterOptions{Model: model})
		if c.ID() != "openrouter:"+model {
			t.Errorf("id %s", c.ID())
		}
		if _, err := c.Generate(context.Background(), testRequest); err != nil {
			t.Fatal(err)
		}
	}
}

func TestOpenRouterRetainsReportedUsage(t *testing.T) {
	for _, cost := range []float64{0, 0.0000004, 0.052} {
		server, _ := serve(t, func(w http.ResponseWriter, r *http.Request) {
			payload := completion(`{"role":"support"}`, "stop", "")
			payload["usage"] = map[string]any{
				"prompt_tokens": 1200, "completion_tokens": 300, "total_tokens": 1500,
				"completion_tokens_details": map[string]any{"reasoning_tokens": 80},
				"prompt_tokens_details":     map[string]any{"cached_tokens": 1000},
				"cost":                      cost,
			}
			writeJSON(w, 200, payload)
		})
		response, err := client(t, server, OpenRouterOptions{}).Generate(context.Background(), testRequest)
		if err != nil {
			t.Fatal(err)
		}
		want := `{"inputTokens":1200,"outputTokens":300,"totalTokens":1500,"reasoningTokens":80,"cachedInputTokens":1000,"costUsd":` + s.FormatNumber(cost) + `,"actualModel":"provider/selected:free","provider":null,"generationId":"test-completion"}`
		if got := s.Stringify(s.FromGoValue(response.Usage)); got != want {
			t.Errorf("usage\n got %s\nwant %s", got, want)
		}
	}
}

func TestOpenRouterKeepsChargesForInvalidJSON(t *testing.T) {
	server, _ := serve(t, func(w http.ResponseWriter, r *http.Request) {
		payload := completion("not valid JSON", "stop", "")
		payload["usage"] = map[string]any{"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120, "cost": 0.001}
		writeJSON(w, 200, payload)
	})
	_, err := client(t, server, OpenRouterOptions{}).Generate(context.Background(), testRequest)
	failure := modelError(t, err)
	if failure.Failure.Code != unit.CodeOutputInvalid || *failure.Usage.CostUSD != 0.001 || *failure.Usage.TotalTokens != 120 || *failure.Usage.GenerationID != "test-completion" {
		t.Errorf("failure %s", s.Stringify(s.FromGoValue(failure.Usage)))
	}
	if strings.Contains(failure.Message, "not valid JSON") {
		t.Error("message quotes the content")
	}
}

func TestOpenRouterNeedsAKeyBeforeNetworkAccess(t *testing.T) {
	server, calls := serve(t, func(w http.ResponseWriter, r *http.Request) {})
	c, err := NewOpenRouter(OpenRouterOptions{BaseURL: server.URL})
	if err != nil {
		t.Fatal(err)
	}
	_, err = c.Generate(context.Background(), testRequest)
	if failure := modelError(t, err); failure.Failure.Code != unit.CodeAuthentication || !strings.Contains(failure.Message, "needs an API key") {
		t.Errorf("got %v", failure.Failure)
	}
	if calls.Load() != 0 {
		t.Error("called the network without a key")
	}
}

func TestOpenRouterClassifiesUnreadableFailuresOnce(t *testing.T) {
	for status, expected := range map[int]string{401: "authentication failed", 429: "rate limit reached", 503: "no available endpoint", 200: "No fallback model"} {
		server, calls := serve(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(status)
			_, _ = w.Write([]byte("TEST_SECRET_KEY SOURCE_PRIVATE_TEXT PROVIDER_PRIVATE_TEXT"))
		})
		_, err := client(t, server, OpenRouterOptions{}).Generate(context.Background(), testRequest)
		if failure := modelError(t, err); !strings.Contains(failure.Message, expected) {
			t.Errorf("%d: %s", status, failure.Message)
		}
		if calls.Load() != 1 {
			t.Errorf("%d: %d calls", status, calls.Load())
		}
	}
}

func TestOpenRouterRejectsIncompleteAnswers(t *testing.T) {
	for _, c := range []struct {
		payload  map[string]any
		expected string
	}{
		{completion("MODEL_PRIVATE_TEXT", "stop", ""), "invalid JSON"},
		{completion("", "stop", ""), "structured final response"},
		{completion("{}", "length", ""), "output token limit"},
		{completion("{}", "stop", "MODEL_PRIVATE_REFUSAL"), "declined"},
	} {
		server, _ := serve(t, func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, c.payload) })
		_, err := client(t, server, OpenRouterOptions{}).Generate(context.Background(), testRequest)
		if failure := modelError(t, err); !strings.Contains(failure.Message, c.expected) {
			t.Errorf("got %q, want %q", failure.Message, c.expected)
		}
	}
	server, _ := serve(t, func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write(make([]byte, 101)) })
	_, err := client(t, server, OpenRouterOptions{MaxOutputBytes: 100}).Generate(context.Background(), testRequest)
	if failure := modelError(t, err); failure.Failure.Code != unit.CodeOutputLimit || !strings.Contains(failure.Message, "output limit") {
		t.Errorf("got %v", failure.Failure)
	}
}

func TestOpenRouterIdentifiesNestedGrammarRejections(t *testing.T) {
	server, calls := serve(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := json.Marshal(map[string]any{"error": map[string]any{"message": "The compiled grammar is too large. TEST_SECRET_KEY SOURCE_PRIVATE_TEXT"}})
		writeJSON(w, 400, map[string]any{"error": map[string]any{"message": "Provider returned error", "code": 400, "metadata": map[string]any{"raw": string(raw)}}})
	})
	_, err := client(t, server, OpenRouterOptions{}).Generate(context.Background(), testRequest)
	if failure := modelError(t, err); failure.Failure.Code != unit.CodeRequestRejected || !strings.Contains(failure.Message, "output format as too complex") {
		t.Errorf("got %v", failure.Failure)
	}
	if calls.Load() != 1 {
		t.Errorf("calls %d", calls.Load())
	}
}

func TestOpenRouterTimeoutAndCancellation(t *testing.T) {
	aborted := make(chan struct{}, 4)
	server, calls := serve(t, func(w http.ResponseWriter, r *http.Request) {
		// The server notices a closed connection only after the body is read.
		_, _ = io.Copy(io.Discard, r.Body)
		<-r.Context().Done()
		aborted <- struct{}{}
	})
	_, err := client(t, server, OpenRouterOptions{Timeout: 30 * time.Millisecond}).Generate(context.Background(), testRequest)
	failure := modelError(t, err)
	if failure.Failure.Code != unit.CodeLocalTimeout || failure.Failure.TimeoutMs != 30 || failure.Failure.HTTPStatus != 0 || !strings.Contains(failure.Message, "app's 0.03-second limit") {
		t.Errorf("got %v", failure.Failure)
	}
	<-aborted
	ctx, cancel := context.WithCancel(context.Background())
	time.AfterFunc(30*time.Millisecond, cancel)
	_, err = client(t, server, OpenRouterOptions{}).Generate(ctx, testRequest)
	if failure := modelError(t, err); failure.Failure.Code != unit.CodeCancelled {
		t.Errorf("got %v", failure.Failure)
	}
	<-aborted
	before := calls.Load()
	_, err = client(t, server, OpenRouterOptions{}).Generate(ctx, testRequest)
	if failure := modelError(t, err); failure.Failure.Code != unit.CodeCancelled || calls.Load() != before {
		t.Errorf("an aborted call reached the network: %v", failure.Failure)
	}
}

func TestOpenRouterRejectsInvalidConfigurationWithoutEchoing(t *testing.T) {
	for _, o := range []OpenRouterOptions{
		{Timeout: -1},
		{Timeout: time.Duration(1<<31) * time.Millisecond},
		{MaxOutputBytes: -1},
		{Model: "PRIVATE INVALID MODEL"},
		{Model: "provider/" + testKey, APIKey: testKey},
		{Reasoning: "invalid-private-setting"},
	} {
		_, err := NewOpenRouter(o)
		if err == nil || strings.Contains(err.Error(), "PRIVATE") || strings.Contains(err.Error(), testKey) {
			t.Errorf("options %+v: %v", o.Model, err)
		}
	}
}

func TestOpenRouterClassifiesStatusesAndEnvelopes(t *testing.T) {
	for _, c := range []struct {
		status int
		code   any
		want   string
	}{
		{429, 429, unit.CodeRateLimit},
		{402, 402, unit.CodeInsufficientCredits},
		{503, 503, unit.CodeModelUnavailable},
		{504, 504, unit.CodeProviderTimeout},
		{200, "429", unit.CodeRateLimit},
		{200, 402, unit.CodeInsufficientCredits},
		{200, 503, unit.CodeModelUnavailable},
		{400, 400, unit.CodeContextLimit},
	} {
		server, calls := serve(t, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Retry-After", "12.2")
			writeJSON(w, c.status, map[string]any{"error": map[string]any{
				"code":     c.code,
				"message":  "maximum context length exceeded TEST_SECRET_KEY SOURCE_PRIVATE_TEXT",
				"metadata": map[string]any{"raw": "PROVIDER_PRIVATE_TEXT", "authorization": testKey},
			}})
		})
		_, err := client(t, server, OpenRouterOptions{}).Generate(context.Background(), testRequest)
		f := modelError(t, err).Failure
		if f.Code != c.want || f.Provider != "OpenRouter" || f.HTTPStatus != c.status || f.RetryAfterSeconds == nil || *f.RetryAfterSeconds != 13 || f.TimeoutMs != 0 {
			t.Errorf("%d %v: %s", c.status, c.code, s.Stringify(s.FromGoValue(f)))
		}
		if f.ProviderCode == 0 || calls.Load() != 1 {
			t.Errorf("provider code %d, calls %d", f.ProviderCode, calls.Load())
		}
	}
}

func TestOpenRouterKeepsUsageOnErrorEnvelopes(t *testing.T) {
	for _, status := range []int{200, 429} {
		server, _ := serve(t, func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, status, map[string]any{
				"id": "charged-failure", "model": "provider/selected:free",
				"error": map[string]any{"code": 429, "message": "PROVIDER_PRIVATE_TEXT"},
				"usage": map[string]any{"prompt_tokens": 12, "completion_tokens": 3, "total_tokens": 15, "cost": 0.0002},
			})
		})
		_, err := client(t, server, OpenRouterOptions{}).Generate(context.Background(), testRequest)
		failure := modelError(t, err)
		u := failure.Usage
		if failure.Failure.Code != unit.CodeRateLimit || u == nil || *u.CostUSD != 0.0002 || *u.TotalTokens != 15 || u.GenerationID != nil || u.ActualModel != nil {
			t.Errorf("%d: %s", status, s.Stringify(s.FromGoValue(u)))
		}
	}
}

func TestOpenRouterDistinguishesNetworkFailures(t *testing.T) {
	server := httptest.NewServer(http.NotFoundHandler())
	server.Close()
	c, _ := NewOpenRouter(OpenRouterOptions{APIKey: testKey, BaseURL: server.URL})
	_, err := c.Generate(context.Background(), testRequest)
	failure := modelError(t, err)
	if failure.Failure.Code != unit.CodeNetworkError || failure.Failure.HTTPStatus != 0 || failure.Usage != nil {
		t.Errorf("got %v", failure.Failure)
	}
}

func TestRetryAfter(t *testing.T) {
	now := time.Date(2026, 9, 20, 12, 0, 0, 0, time.UTC)
	for header, want := range map[string]float64{" 12.2 ": 13, "Sun, 20 Sep 2026 12:00:20 GMT": 20} {
		if got := RetryAfter(header, now); got == nil || *got != want {
			t.Errorf("%q: %v", header, got)
		}
	}
	for _, header := range []string{"Sun, 20 Sep 2026 11:59:59 GMT", "PRIVATE_HEADER_TEXT", ""} {
		if got := RetryAfter(header, now); got != nil {
			t.Errorf("%q: %v", header, *got)
		}
	}
}

func TestOpenRouterDropsUnsafeIdentifiers(t *testing.T) {
	for _, unsafe := range []string{testKey, "echo:" + testKey, strings.Repeat("x", 257)} {
		server, _ := serve(t, func(w http.ResponseWriter, r *http.Request) {
			payload := completion(`{}`, "stop", "")
			payload["id"], payload["model"] = unsafe, unsafe
			writeJSON(w, 200, payload)
		})
		response, err := client(t, server, OpenRouterOptions{}).Generate(context.Background(), testRequest)
		if err != nil {
			t.Fatal(err)
		}
		if response.Usage.ActualModel != nil || response.Usage.GenerationID != nil {
			t.Errorf("kept %q", unsafe)
		}
	}
}
