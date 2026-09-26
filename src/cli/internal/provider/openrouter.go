package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// FreeModel is OpenRouter's free router, the application default. It may
// route to any free model; pass an explicit model for reproducible runs.
const FreeModel = "openrouter/free"

// OpenRouterURL is the API root requests go to.
const OpenRouterURL = "https://openrouter.ai/api/v1"

var modelID = regexp.MustCompile(`^[a-zA-Z0-9._-]+/[a-zA-Z0-9._:/-]+$`)

// OpenRouterOptions configure one OpenRouter connection. The key stays in
// this process; it is sent only in the Authorization header.
type OpenRouterOptions struct {
	APIKey string
	// Model defaults to FreeModel. There is no automatic paid fallback.
	Model string
	// Reasoning is none (default), low, medium or high.
	Reasoning string
	// Timeout per call; default 120 s.
	Timeout time.Duration
	// MaxOutputBytes bounds the complete HTTP response; default 2,000,000.
	MaxOutputBytes int64
	// BaseURL and Client exist for tests.
	BaseURL string
	Client  *http.Client
}

// OpenRouter is one structured chat completion per call, without retries.
type OpenRouter struct {
	key, model, reasoning, baseURL string
	timeout                        time.Duration
	maxBytes                       int64
	client                         *http.Client
}

var _ Observable = (*OpenRouter)(nil)

// NewOpenRouter validates the settings. Errors never echo them.
func NewOpenRouter(o OpenRouterOptions) (*OpenRouter, error) {
	c := &OpenRouter{
		key:       strings.TrimSpace(o.APIKey),
		model:     o.Model,
		reasoning: o.Reasoning,
		baseURL:   o.BaseURL,
		timeout:   o.Timeout,
		maxBytes:  o.MaxOutputBytes,
		client:    o.Client,
	}
	if c.model == "" {
		c.model = FreeModel
	}
	if c.reasoning == "" {
		c.reasoning = "none"
	}
	if c.baseURL == "" {
		c.baseURL = OpenRouterURL
	}
	if c.timeout == 0 {
		c.timeout = 120 * time.Second
	}
	if c.maxBytes == 0 {
		c.maxBytes = 2_000_000
	}
	if c.client == nil {
		c.client = &http.Client{}
	}
	switch c.reasoning {
	case "none", "low", "medium", "high":
	default:
		return nil, errors.New("OpenRouter reasoning must be none, low, medium or high.")
	}
	if !modelID.MatchString(c.model) || len(c.model) > 200 || (c.key != "" && strings.Contains(c.model, c.key)) {
		return nil, errors.New("OpenRouter model must be a provider/model identifier.")
	}
	if c.timeout <= 0 || c.timeout.Milliseconds() > 2_147_483_647 || c.maxBytes <= 0 {
		return nil, errors.New("OpenRouter timeout and response limit must be positive bounded integers.")
	}
	return c, nil
}

// ID names the connection in run records.
func (c *OpenRouter) ID() string { return "openrouter:" + c.model }

// Settings are the evidence settings.
func (c *OpenRouter) Settings() Settings {
	return Settings{Model: c.model, ReasoningEffort: c.reasoning, TimeoutMs: c.timeout.Milliseconds(), MaxOutputBytes: c.maxBytes}
}

// Generate sends one request and returns the parsed JSON answer.
func (c *OpenRouter) Generate(ctx context.Context, request unit.ModelRequest) (unit.ModelResponse, error) {
	return c.GenerateObserved(ctx, request, nil)
}

// GenerateObserved also passes the raw answer to observe before parsing it.
func (c *OpenRouter) GenerateObserved(ctx context.Context, request unit.ModelRequest, observe Observer) (unit.ModelResponse, error) {
	cancelled := func(usage *unit.Usage) error {
		return failed(&unit.Failure{Provider: "OpenRouter", Code: unit.CodeCancelled, Message: "OpenRouter generation was cancelled."}, usage)
	}
	if ctx.Err() != nil {
		return unit.ModelResponse{}, cancelled(nil)
	}
	if c.key == "" {
		return unit.ModelResponse{}, failed(&unit.Failure{Provider: "OpenRouter", Code: unit.CodeAuthentication, Message: "OpenRouter needs an API key. Set it in Settings or OPENROUTER_API_KEY."}, nil)
	}
	deadline, stop := context.WithTimeout(ctx, c.timeout)
	defer stop()
	interrupted := func(usage *unit.Usage) error {
		if ctx.Err() != nil {
			return cancelled(usage)
		}
		ms := c.timeout.Milliseconds()
		return failed(&unit.Failure{
			Provider:  "OpenRouter",
			Code:      unit.CodeLocalTimeout,
			TimeoutMs: int(ms),
			Message:   "Generation timed out at the app's " + seconds(ms) + "-second limit while waiting for OpenRouter. Retry this stage or choose a faster model. No OpenRouter rate-limit or credit error was received.",
		}, usage)
	}

	httpRequest, err := http.NewRequestWithContext(deadline, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(c.body(request)))
	if err != nil {
		return unit.ModelResponse{}, failed(&unit.Failure{Provider: "OpenRouter", Code: unit.CodeFailed, Message: "The OpenRouter request could not be created."}, nil)
	}
	httpRequest.Header.Set("Authorization", "Bearer "+c.key)
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Accept", "application/json")
	httpRequest.Header.Set("X-OpenRouter-Title", "mardwerk-unit")
	response, err := c.client.Do(httpRequest)
	if err != nil {
		if deadline.Err() != nil {
			return unit.ModelResponse{}, interrupted(nil)
		}
		// Transport errors can quote URLs, headers or payloads. Never expose them.
		return unit.ModelResponse{}, failed(&unit.Failure{Provider: "OpenRouter", Code: unit.CodeNetworkError, Message: "The app could not connect to OpenRouter. Check the connection and retry this stage. No provider error response was received."}, nil)
	}
	defer response.Body.Close()
	status := response.StatusCode
	retry := RetryAfter(response.Header.Get("Retry-After"), time.Now())
	body, err := io.ReadAll(io.LimitReader(response.Body, c.maxBytes+1))
	if err != nil {
		if deadline.Err() != nil {
			return unit.ModelResponse{}, interrupted(nil)
		}
		return unit.ModelResponse{}, failed(OpenRouterFailure(status, nil, retry, ""), nil)
	}
	if int64(len(body)) > c.maxBytes {
		return unit.ModelResponse{}, failed(&unit.Failure{Provider: "OpenRouter", Code: unit.CodeOutputLimit, Message: "OpenRouter's response exceeded the app's " + groupThousands(c.maxBytes) + "-byte output limit. Request a shorter Unit draft."}, nil)
	}
	var payload map[string]any
	if json.Unmarshal(body, &payload) != nil {
		payload = nil
	}
	// OpenRouter can also return an error envelope after HTTP 200.
	envelope, isEnvelope := payload["error"].(map[string]any)
	if status < 200 || status > 299 || isEnvelope {
		message, _ := envelope["message"].(string)
		upstream := ""
		if metadata, ok := envelope["metadata"].(map[string]any); ok {
			upstream, _ = metadata["raw"].(string)
		}
		usage := envelopeUsage(payload["usage"])
		return unit.ModelResponse{}, failed(OpenRouterFailure(status, providerCode(envelope["code"]), retry, clip(message, 4000)+"\n"+clip(upstream, 4000)), usage)
	}
	if payload == nil {
		return unit.ModelResponse{}, failed(OpenRouterFailure(status, nil, retry, ""), nil)
	}
	choices, hasChoices := payload["choices"].([]any)
	var choice, message map[string]any
	if len(choices) > 0 {
		choice, _ = choices[0].(map[string]any)
		message, _ = choice["message"].(map[string]any)
	}
	content, hasContent := message["content"].(string)
	refusal, _ := message["refusal"].(string)
	finish, _ := choice["finish_reason"].(string)
	if observe != nil && hasChoices {
		raw := RawOutput{Redacted: strings.Contains(content, c.key) || strings.Contains(refusal, c.key)}
		redact := func(value string, present bool) *string {
			if !present {
				return nil
			}
			value = strings.ReplaceAll(value, c.key, "[REDACTED]")
			return &value
		}
		raw.Content = redact(content, hasContent)
		_, hasRefusal := message["refusal"].(string)
		raw.Refusal = redact(refusal, hasRefusal)
		_, hasFinish := choice["finish_reason"].(string)
		raw.FinishReason = redact(finish, hasFinish)
		if _, ok := payload["usage"]; ok {
			raw.Usage = envelopeUsage(payload["usage"])
		}
		if err := observe(raw); err != nil {
			return unit.ModelResponse{}, err
		}
	}
	if !hasChoices {
		return unit.ModelResponse{}, invalidOutput(unit.CodeOutputInvalid, "OpenRouter did not return a structured final response.", nil)
	}
	usage, ok := c.reportedUsage(payload)
	if !ok {
		return unit.ModelResponse{}, failed(OpenRouterFailure(status, nil, retry, ""), nil)
	}
	switch {
	case refusal != "" || finish == "content_filter":
		return unit.ModelResponse{}, invalidOutput(unit.CodeRefusal, "OpenRouter declined to generate this response. Check the character brief or try another model.", usage)
	case finish == "length":
		return unit.ModelResponse{}, invalidOutput(unit.CodeOutputLimit, "The model reached its output token limit before completing the Unit. Reduce the requested detail or choose a model with a larger output allowance.", usage)
	case finish != "stop":
		return unit.ModelResponse{}, invalidOutput(unit.CodeOutputInvalid, "OpenRouter did not complete the structured response. Retry this stage or choose another model.", usage)
	case strings.TrimSpace(content) == "":
		return unit.ModelResponse{}, invalidOutput(unit.CodeOutputInvalid, "OpenRouter did not return a structured final response.", usage)
	case strings.Contains(content, c.key):
		return unit.ModelResponse{}, invalidOutput(unit.CodeOutputInvalid, "OpenRouter returned credential-bearing content. The response was rejected.", usage)
	}
	output, err := s.Decode([]byte(content))
	if err != nil {
		return unit.ModelResponse{}, invalidOutput(unit.CodeOutputInvalid, "OpenRouter returned invalid JSON in its structured response.", usage)
	}
	return unit.ModelResponse{Output: output, Usage: usage}, nil
}

func invalidOutput(code, message string, usage *unit.Usage) error {
	return failed(&unit.Failure{Provider: "OpenRouter", Code: code, Message: message}, usage)
}

func (c *OpenRouter) body(request unit.ModelRequest) []byte {
	provider := s.NewObject().Set("require_parameters", true)
	if c.model == FreeModel || strings.HasSuffix(c.model, ":free") {
		provider.Set("max_price", s.NewObject().Set("prompt", "0").Set("completion", "0").Set("request", "0"))
	}
	schema := any(request.Schema)
	if request.Schema == nil {
		schema = s.NewObject()
	}
	body := s.NewObject().
		Set("model", c.model).
		Set("reasoning", s.NewObject().Set("effort", c.reasoning)).
		Set("messages", []any{
			s.NewObject().Set("role", "system").Set("content", request.System),
			s.NewObject().Set("role", "user").Set("content", request.Prompt),
		}).
		Set("response_format", s.NewObject().
			Set("type", "json_schema").
			Set("json_schema", s.NewObject().Set("name", "unit_result").Set("strict", true).Set("schema", schema))).
		Set("provider", provider).
		Set("stream", false)
	return []byte(s.Stringify(body))
}

// reportedUsage keeps what OpenRouter reported. Identifiers that are long
// or echo the key are dropped.
func (c *OpenRouter) reportedUsage(payload map[string]any) (*unit.Usage, bool) {
	usage, _ := payload["usage"].(map[string]any)
	details := func(key, field string) any {
		inner, _ := usage[key].(map[string]any)
		return inner[field]
	}
	identifier := func(value any) any {
		text, ok := value.(string)
		if !ok || text == "" || len(text) > 256 || strings.Contains(text, c.key) {
			return nil
		}
		return text
	}
	return parseUsage(s.NewObject().
		Set("inputTokens", usage["prompt_tokens"]).
		Set("outputTokens", usage["completion_tokens"]).
		Set("totalTokens", usage["total_tokens"]).
		Set("reasoningTokens", details("completion_tokens_details", "reasoning_tokens")).
		Set("cachedInputTokens", details("prompt_tokens_details", "cached_tokens")).
		Set("costUsd", usage["cost"]).
		Set("actualModel", identifier(payload["model"])).
		// OpenRouter does not report the upstream provider name here.
		Set("provider", nil).
		Set("generationId", identifier(payload["id"])))
}

// envelopeUsage keeps valid numeric usage from an error envelope, which can
// include billable work.
func envelopeUsage(value any) *unit.Usage {
	raw, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	usage, ok := parseUsage(s.NewObject().
		Set("inputTokens", raw["prompt_tokens"]).
		Set("outputTokens", raw["completion_tokens"]).
		Set("totalTokens", raw["total_tokens"]).
		Set("reasoningTokens", nil).
		Set("cachedInputTokens", nil).
		Set("costUsd", raw["cost"]).
		Set("actualModel", nil).
		Set("provider", nil).
		Set("generationId", nil))
	if !ok {
		return nil
	}
	return usage
}

func parseUsage(value *s.Object) (*unit.Usage, bool) {
	parsed, issues := s.Parse(unit.ModelUsageSchema, value)
	if len(issues) > 0 {
		return nil, false
	}
	var usage unit.Usage
	if s.ToGo(parsed, &usage) != nil {
		return nil, false
	}
	return &usage, true
}

func clip(value string, limit int) string {
	if len(value) > limit {
		return value[:limit]
	}
	return value
}
