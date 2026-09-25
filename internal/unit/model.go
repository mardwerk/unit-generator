package unit

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"time"
)

// Model is the Engine's only external dependency: one structured call.
// Adapters own transport and credentials.
type Model interface {
	ID() string
	Generate(ctx context.Context, request ModelRequest) (ModelResponse, error)
}

// ModelResponse is one call's output and the usage the provider reported.
// A nil Usage means the provider did not report it.
type ModelResponse struct {
	Output any
	Usage  *Usage
}

// Failure is a safe description of a failed model stage.
type Failure struct {
	Code              string   `json:"code"`
	Message           string   `json:"message"`
	Provider          string   `json:"provider,omitempty"`
	HTTPStatus        int      `json:"httpStatus,omitempty"`
	ProviderCode      int      `json:"providerCode,omitempty"`
	TimeoutMs         int      `json:"timeoutMs,omitempty"`
	RetryAfterSeconds *float64 `json:"retryAfterSeconds,omitempty"`
	Stage             string   `json:"stage,omitempty"`
}

// ModelError is a failed model stage. Usage stays attached when billed.
type ModelError struct {
	Message string
	Usage   *Usage
	Failure *Failure
	Cause   error
}

func (e *ModelError) Error() string { return e.Message }
func (e *ModelError) Unwrap() error { return e.Cause }

// Failure codes adapters and stages report.
const (
	CodeLocalTimeout        = "LOCAL_TIMEOUT"
	CodeProviderTimeout     = "PROVIDER_TIMEOUT"
	CodeRateLimit           = "RATE_LIMIT"
	CodeInsufficientCredits = "INSUFFICIENT_CREDITS"
	CodeAuthentication      = "AUTHENTICATION"
	CodeRequestRejected     = "REQUEST_REJECTED"
	CodeModelUnavailable    = "MODEL_UNAVAILABLE"
	CodeProviderUnavailable = "PROVIDER_UNAVAILABLE"
	CodeNetworkError        = "NETWORK_ERROR"
	CodeOutputInvalid       = "MODEL_OUTPUT_INVALID"
	CodeOutputLimit         = "OUTPUT_LIMIT"
	CodeCancelled           = "CANCELLED"
	CodeRefusal             = "MODEL_REFUSAL"
	CodeContextLimit        = "CONTEXT_LIMIT"
	CodeFailed              = "MODEL_FAILED"
)

func isCancelled(err error) bool {
	return errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)
}

// StageFailure classifies an error from a model stage.
func StageFailure(err error, stage string, usage *Usage, invalidOutput bool) *ModelError {
	var retained *ModelError
	errors.As(err, &retained)
	operation := "review"
	if stage == "draft" {
		operation = "Unit draft"
	}
	var failure Failure
	switch {
	case isCancelled(err):
		failure = Failure{Code: CodeCancelled, Stage: stage, Message: operation + " was cancelled."}
	case retained != nil && retained.Failure != nil:
		failure = *retained.Failure
		failure.Stage = stage
	case invalidOutput:
		failure = Failure{Code: CodeOutputInvalid, Stage: stage, Message: fmt.Sprintf("The model returned an incomplete or invalid %s. Retry this stage or choose another model.", operation)}
	default:
		failure = Failure{Code: CodeFailed, Stage: stage, Message: fmt.Sprintf("The model could not complete the %s. Check the provider configuration and retry this stage.", operation)}
	}
	label := "Review"
	if stage == "draft" {
		label = "Draft"
	}
	if retained != nil && retained.Usage != nil {
		usage = retained.Usage
	}
	return &ModelError{Message: label + " model execution failed: " + failure.Message, Usage: usage, Failure: &failure, Cause: err}
}

// totalUsage sums known billed attempts once; unreported parts stay unknown.
func totalUsage(attempts []Attempt) *Usage {
	any := false
	for _, a := range attempts {
		if a.Usage != nil {
			any = true
		}
	}
	if !any {
		return nil
	}
	sum := func(get func(*Usage) *float64) *float64 {
		total := 0.0
		for _, a := range attempts {
			if a.Usage == nil || get(a.Usage) == nil {
				return nil
			}
			total += *get(a.Usage)
		}
		return &total
	}
	last := attempts[len(attempts)-1].Usage
	out := &Usage{
		InputTokens:       sum(func(u *Usage) *float64 { return u.InputTokens }),
		OutputTokens:      sum(func(u *Usage) *float64 { return u.OutputTokens }),
		TotalTokens:       sum(func(u *Usage) *float64 { return u.TotalTokens }),
		ReasoningTokens:   sum(func(u *Usage) *float64 { return u.ReasoningTokens }),
		CachedInputTokens: sum(func(u *Usage) *float64 { return u.CachedInputTokens }),
		CostUSD:           sum(func(u *Usage) *float64 { return u.CostUSD }),
	}
	if last != nil {
		out.ActualModel, out.Provider = last.ActualModel, last.Provider
	}
	if len(attempts) == 1 && attempts[0].Usage != nil {
		out.GenerationID = attempts[0].Usage.GenerationID
	}
	return out
}

// Clock and IDs are explicit so runs can be reproduced in tests.
type Options struct {
	// MaxRepairAttempts is 0, 1 (default) or 2.
	MaxRepairAttempts *int
	Now               func() time.Time
	NewID             func() string
}

func (o Options) now() string {
	t := time.Now()
	if o.Now != nil {
		t = o.Now()
	}
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

func (o Options) id() string {
	if o.NewID != nil {
		return o.NewID()
	}
	return NewUUID()
}

// NewUUID returns a random version 4 UUID.
func NewUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
