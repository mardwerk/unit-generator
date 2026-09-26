package unit

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/mardwerk/unit-generator/internal/parity"
	s "github.com/mardwerk/unit-generator/internal/schema"
)

// replayModel answers with recorded responses and checks each request against the recording.
type replayModel struct {
	t         *testing.T
	id        string
	exchanges []any
	next      int
	mismatch  string
}

func newReplay(t *testing.T, entry *s.Object) *replayModel {
	model, _ := entry.Get("model")
	id, _ := model.(*s.Object).Get("id")
	exchanges, _ := model.(*s.Object).Get("exchanges")
	name, _ := id.(string)
	return &replayModel{t: t, id: name, exchanges: exchanges.([]any)}
}

func (r *replayModel) ID() string { return r.id }

func (r *replayModel) Generate(_ context.Context, request ModelRequest) (ModelResponse, error) {
	if r.next >= len(r.exchanges) {
		r.mismatch = "unexpected extra model call"
		return ModelResponse{}, errors.New("no recorded exchange")
	}
	exchange := r.exchanges[r.next].(*s.Object)
	r.next++
	recorded := field(exchange, "request").(*s.Object)
	if r.mismatch == "" {
		if got, want := request.System, field(recorded, "system"); got != want {
			r.mismatch = fmt.Sprintf("call %d system differs:\n got %q\nwant %q", r.next, got, want)
		} else if got, want := request.Prompt, field(recorded, "prompt").(string); got != want {
			r.mismatch = fmt.Sprintf("call %d prompt differs at %d:\n got %s\nwant %s", r.next, firstDiff(got, want), excerpt(got, firstDiff(got, want)), excerpt(want, firstDiff(got, want)))
		} else if got, want := s.Canonical(request.Schema), s.Canonical(field(recorded, "schema")); got != want {
			r.mismatch = fmt.Sprintf("call %d schema differs at %d:\n got %s\nwant %s", r.next, firstDiff(got, want), excerpt(got, firstDiff(got, want)), excerpt(want, firstDiff(got, want)))
		}
	}
	if recordedErr, ok := exchange.Get("error"); ok {
		return ModelResponse{}, replayError(recordedErr.(*s.Object))
	}
	response := field(exchange, "response").(*s.Object)
	out := ModelResponse{Output: parity.Restore(field(response, "output"))}
	if usage, ok := response.Get("usage"); ok && usage != nil {
		var u Usage
		_ = s.ToGo(usage, &u)
		out.Usage = &u
	}
	return out, nil
}

func replayError(recorded *s.Object) error {
	message, _ := recorded.Get("message")
	e := &ModelError{Message: message.(string)}
	if failure, ok := recorded.Get("failure"); ok {
		var f Failure
		_ = s.ToGo(failure, &f)
		e.Failure = &f
	}
	if usage, ok := recorded.Get("usage"); ok {
		var u Usage
		_ = s.ToGo(usage, &u)
		e.Usage = &u
	}
	return e
}

func firstDiff(a, b string) int {
	for i := 0; i < len(a) && i < len(b); i++ {
		if a[i] != b[i] {
			return i
		}
	}
	return min(len(a), len(b))
}

func excerpt(text string, at int) string {
	start, end := max(0, at-120), min(len(text), at+120)
	return fmt.Sprintf("%q", text[start:end])
}

// normalize replaces run IDs, Result IDs and timestamps, which differ per run.
func normalize(value any) any {
	switch v := value.(type) {
	case *s.Object:
		out := s.NewObject()
		isRun := v.Has("modelId") && v.Has("startedAt")
		kind, _ := v.Get("kind")
		for _, key := range v.Keys() {
			item, _ := v.Get(key)
			if (isRun && (key == "id" || key == "startedAt" || key == "completedAt")) || (kind == "result" && key == "id") {
				item = "<normalized>"
			}
			out.Set(key, normalize(item))
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = normalize(item)
		}
		return out
	}
	return value
}

func sameArtifact(got any, want any) bool {
	return parity.Canonical(normalize(parity.Mark(s.FromGoValue(got)))) == parity.Canonical(normalize(want))
}

func legacyRoute(entry *s.Object) bool {
	args, _ := entry.Get("args")
	return !containsKey2(args, "mechanicsDefinition")
}

func containsKey2(value any, key string) bool {
	switch v := value.(type) {
	case *s.Object:
		if v.Has(key) {
			return true
		}
		for _, k := range v.Keys() {
			item, _ := v.Get(k)
			if containsKey2(item, key) {
				return true
			}
		}
	case []any:
		for _, item := range v {
			if containsKey2(item, key) {
				return true
			}
		}
	}
	return false
}

func recordedCode(entry *s.Object) string {
	e := parity.ErrorOf(entry)
	if e == nil {
		return ""
	}
	if failure, ok := e.Get("failure"); ok {
		code, _ := failure.(*s.Object).Get("code")
		text, _ := code.(string)
		return text
	}
	return ""
}

func compareFailure(t *testing.T, err error, entry *s.Object) {
	t.Helper()
	recorded := parity.ErrorOf(entry)
	message, _ := recorded.Get("message")
	if err == nil {
		t.Fatalf("expected failure %q", message)
	}
	if err.Error() != message {
		t.Errorf("message\n got %q\nwant %q", err.Error(), message)
	}
	var modelErr *ModelError
	if failure, ok := recorded.Get("failure"); ok {
		if !errors.As(err, &modelErr) || modelErr.Failure == nil {
			t.Fatalf("expected a model failure, got %T", err)
		}
		if !parity.Same(modelErr.Failure, failure) {
			t.Errorf("failure got %s want %s", show(modelErr.Failure), s.Stringify(failure))
		}
	}
	if usage, ok := recorded.Get("usage"); ok {
		if modelErr == nil || !parity.Same(modelErr.Usage, usage) {
			t.Errorf("usage got %s want %s", show(modelErr), s.Stringify(usage))
		}
	}
}

func recordedName(entry *s.Object) string {
	if e := parity.ErrorOf(entry); e != nil {
		name, _ := e.Get("name")
		text, _ := name.(string)
		return text
	}
	return ""
}
