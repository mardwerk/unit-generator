package provider

import (
	"context"

	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// RawOutput is a provider's answer before the Engine validates it: content,
// refusal and finish reason only, never transport envelopes or headers.
type RawOutput struct {
	Content      *string     `json:"content"`
	Refusal      *string     `json:"refusal,omitempty"`
	FinishReason *string     `json:"finishReason,omitempty"`
	Truncated    bool        `json:"truncated,omitempty"`
	Redacted     bool        `json:"redacted,omitempty"`
	Usage        *unit.Usage `json:"usage,omitempty"`
}

// Observer receives the raw output of one call. An Observer error ends the
// call with that error.
type Observer func(RawOutput) error

// Settings are the non-secret settings an evidence record keeps.
type Settings struct {
	Model           string `json:"model,omitempty"`
	ReasoningEffort string `json:"reasoningEffort,omitempty"`
	TimeoutMs       int64  `json:"timeoutMs,omitempty"`
	MaxOutputBytes  int64  `json:"maxOutputBytes,omitempty"`
}

// Observable is a Model that can report its raw output and settings.
type Observable interface {
	unit.Model
	Settings() Settings
	GenerateObserved(ctx context.Context, request unit.ModelRequest, observe Observer) (unit.ModelResponse, error)
}
