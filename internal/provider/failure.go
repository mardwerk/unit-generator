// Package provider adapts model services to the Engine's Model interface:
// OpenRouter over HTTP, a local Codex CLI, and OpenRouter image generation.
// Adapters own transport, credentials and bounds. Provider text is used only
// to classify a failure and never reaches a user-facing message.
package provider

import (
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/mardwerk/unit-generator/internal/unit"
)

var (
	grammarRejection = regexp.MustCompile(`(?is)compiled grammar is too large|schema.{0,40}(?:too complex|too large)`)
	contextRejection = regexp.MustCompile(`(?is)context (?:length|window)|maximum.{0,24}tokens|too many (?:input )?tokens`)
	secondsValue     = regexp.MustCompile(`^\d+(?:\.\d+)?$`)
)

// OpenRouterFailure classifies an HTTP status, or the provider's own code
// when it reported one, into a safe failure.
func OpenRouterFailure(status int, providerCode *int, retryAfter *float64, providerMessage string) *unit.Failure {
	code := status
	if providerCode != nil {
		code = *providerCode
	}
	failure := func(kind, message string) *unit.Failure {
		f := &unit.Failure{Provider: "OpenRouter", HTTPStatus: status, RetryAfterSeconds: retryAfter, Code: kind, Message: message}
		if providerCode != nil {
			f.ProviderCode = *providerCode
		}
		return f
	}
	switch code {
	case 401:
		return failure(unit.CodeAuthentication, "OpenRouter authentication failed (401). Check the API key and its account access in Settings.")
	case 402:
		return failure(unit.CodeInsufficientCredits, "OpenRouter rejected the request for insufficient credits (402). Check the account balance and the API key spending limit.")
	case 403:
		return failure(unit.CodeRequestRejected, "OpenRouter denied this request (403). Check the key permissions and provider restrictions.")
	case 408, 504:
		return failure(unit.CodeProviderTimeout, fmt.Sprintf("OpenRouter reported a provider timeout (%d). Retry this stage or choose another model.", code))
	case 429:
		advice := "Wait before retrying; check the model request quota if this continues."
		if retryAfter != nil {
			advice = fmt.Sprintf("Retry after %s seconds. Check the model request quota if this continues.", strconv.FormatFloat(*retryAfter, 'f', -1, 64))
		}
		return failure(unit.CodeRateLimit, "OpenRouter rate limit reached (429). "+advice)
	case 404, 503:
		return failure(unit.CodeModelUnavailable, fmt.Sprintf("OpenRouter has no available endpoint for this model and request (%d). Try another model supporting structured output, or retry later.", code))
	case 400, 413, 422:
		if grammarRejection.MatchString(providerMessage) {
			return failure(unit.CodeRequestRejected, fmt.Sprintf("The selected OpenRouter provider rejected the Unit output format as too complex (%d). Choose another model.", code))
		}
		if code == 413 || contextRejection.MatchString(providerMessage) {
			return failure(unit.CodeContextLimit, fmt.Sprintf("OpenRouter rejected the request because the input exceeds the model or request size limit (%d). Reduce source text or use a model with a larger context window.", code))
		}
		return failure(unit.CodeRequestRejected, fmt.Sprintf("OpenRouter rejected the request parameters (%d). Check that the selected model supports structured output.", code))
	}
	if code >= 500 && code < 600 {
		return failure(unit.CodeProviderUnavailable, fmt.Sprintf("OpenRouter or the model provider failed (%d). Retry this stage later or choose another model.", code))
	}
	return failure(unit.CodeFailed, fmt.Sprintf("OpenRouter returned an unrecognized response (%d). Try another model with structured-output support. No fallback model was requested.", code))
}

// RetryAfter reads a Retry-After header in seconds or as an HTTP date,
// rounded up. Expired and malformed values report nothing.
func RetryAfter(header string, now time.Time) *float64 {
	value := strings.TrimSpace(header)
	if value == "" {
		return nil
	}
	var seconds float64
	if secondsValue.MatchString(value) {
		seconds, _ = strconv.ParseFloat(value, 64)
	} else {
		at, err := http.ParseTime(value)
		if err != nil {
			return nil
		}
		seconds = at.Sub(now).Seconds()
	}
	if math.IsInf(seconds, 0) || math.IsNaN(seconds) || seconds < 0 {
		return nil
	}
	rounded := math.Ceil(seconds)
	return &rounded
}

// failed builds the error an adapter returns for a classified failure.
func failed(f *unit.Failure, usage *unit.Usage) *unit.ModelError {
	return &unit.ModelError{Message: f.Message, Usage: usage, Failure: f}
}

// providerCode reads an error envelope's numeric or three-digit string code.
func providerCode(value any) *int {
	switch v := value.(type) {
	case float64:
		if v == math.Trunc(v) && math.Abs(v) < 1e9 {
			n := int(v)
			return &n
		}
	case string:
		if len(v) == 3 {
			if n, err := strconv.Atoi(v); err == nil && n >= 0 {
				return &n
			}
		}
	}
	return nil
}

// groupThousands formats a byte count like toLocaleString('en-US').
func groupThousands(n int64) string {
	digits := strconv.FormatInt(n, 10)
	var b strings.Builder
	for i, digit := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(digit)
	}
	return b.String()
}

// seconds formats a millisecond limit as JavaScript prints ms / 1000.
func seconds(ms int64) string {
	return strconv.FormatFloat(float64(ms)/1000, 'f', -1, 64)
}
