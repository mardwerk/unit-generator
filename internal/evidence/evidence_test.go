package evidence

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mardwerk/unit-generator/internal/provider"
	s "github.com/mardwerk/unit-generator/internal/schema"
	"github.com/mardwerk/unit-generator/internal/unit"
)

const secret = "PRIVATE_PROVIDER_CREDENTIAL"

var request = unit.ModelRequest{System: "Use the supplied source.", Prompt: "An independent kick while the fist is away.", Schema: s.NewObject().Set("type", "object")}

func read(t *testing.T, directory, name string) map[string]any {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(directory, name))
	if err != nil {
		t.Fatal(err)
	}
	var value map[string]any
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func noSecret(t *testing.T, directory string) {
	t.Helper()
	entries, _ := os.ReadDir(directory)
	for _, entry := range entries {
		raw, _ := os.ReadFile(filepath.Join(directory, entry.Name()))
		if strings.Contains(string(raw), secret) {
			t.Errorf("%s holds the secret", entry.Name())
		}
	}
}

type fixedModel struct {
	check  func()
	output any
}

func (m fixedModel) ID() string { return "test:model" }
func (m fixedModel) Generate(context.Context, unit.ModelRequest) (unit.ModelResponse, error) {
	m.check()
	return unit.ModelResponse{Output: m.output}, nil
}

func TestEvidenceSavesInputsBeforeCallsAndOutputBeforeValidation(t *testing.T) {
	input := map[string]any{"rules": "arbitrary rules", "source": "original source"}
	run, err := Start(t.TempDir(), input, provider.Settings{TimeoutMs: 1000})
	if err != nil {
		t.Fatal(err)
	}
	if got := read(t, run.Directory, "input.json"); got["source"] != "original source" {
		t.Errorf("input %v", got)
	}
	model := run.Wrap(fixedModel{output: s.NewObject().Set("incomplete", true), check: func() {
		if read(t, run.Directory, "001-request.json")["prompt"] != request.Prompt {
			t.Error("request not saved before the call")
		}
	}})
	response, err := model.Generate(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if output := read(t, run.Directory, "001-output.json")["output"].(map[string]any); output["incomplete"] != true || s.Stringify(response.Output) != `{"incomplete":true}` {
		t.Errorf("output %v", output)
	}
	if read(t, run.Directory, "001-outcome.json")["validation"] != "not-performed-by-recorder" {
		t.Error("outcome claims validation")
	}
	if err := run.Fail(errors.New("Core schema rejected the incomplete output: " + secret)); err != nil {
		t.Fatal(err)
	}
	if read(t, run.Directory, "outcome.json")["status"] != "failed" {
		t.Error("outcome not failed")
	}
	manifest := read(t, run.Directory, "manifest.json")
	settings := manifest["settings"].(map[string]any)
	if settings["temperature"] != nil || settings["timeoutMs"] != float64(1000) {
		t.Errorf("settings %v", settings)
	}
	if runtime := manifest["runtime"].(map[string]any); len(runtime["executableSha256"].(string)) != 64 {
		t.Errorf("runtime %v", runtime)
	}
	if info, _ := os.Stat(filepath.Join(run.Directory, "input.json")); info.Mode().Perm() != 0o600 {
		t.Errorf("mode %v", info.Mode())
	}
	noSecret(t, run.Directory)
}

func TestEvidenceFinishesWithUnassessedObservations(t *testing.T) {
	directory := t.TempDir()
	run, _ := Start(directory, map[string]any{}, provider.Settings{})
	if err := run.Finish(map[string]any{"unit": map[string]any{"independentKick": true}}); err != nil {
		t.Fatal(err)
	}
	if read(t, run.Directory, "outcome.json")["acceptance"] != "not-assessed" {
		t.Error("acceptance assessed")
	}
	observations := read(t, run.Directory, "observations.json")
	if observations["demonstration"].(map[string]any)["execution"] != "not-executed" || observations["acceptance"].(map[string]any)["status"] != "not-assessed" {
		t.Errorf("observations %v", observations)
	}
	second, _ := Start(directory, map[string]any{}, provider.Settings{})
	if second.Directory == run.Directory {
		t.Error("runs share a folder")
	}
	if run.Finish(nil) == nil {
		t.Error("an existing file was overwritten")
	}
}

func openRouter(t *testing.T, handler http.HandlerFunc) *provider.OpenRouter {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	c, err := provider.NewOpenRouter(provider.OpenRouterOptions{APIKey: secret, Model: "test/model", Reasoning: "low", BaseURL: server.URL})
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestEvidenceKeepsRejectedAnswersWithoutEnvelopes(t *testing.T) {
	for _, c := range []struct{ content, finish, refusal, code string }{
		{"{invalid", "stop", "", unit.CodeOutputInvalid},
		{`{"part":`, "length", "", unit.CodeOutputLimit},
		{"", "stop", "declined", unit.CodeRefusal},
	} {
		run, _ := Start(t.TempDir(), map[string]any{}, provider.Settings{})
		model := run.Wrap(openRouter(t, func(w http.ResponseWriter, r *http.Request) {
			message := map[string]any{"role": "assistant", "content": c.content}
			if c.refusal != "" {
				message["refusal"] = c.refusal
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id": "generation-1", "model": "test/model",
				"choices": []any{map[string]any{"index": 0, "finish_reason": c.finish, "message": message}},
				"usage":   map[string]any{"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
			})
		}))
		_, err := model.Generate(context.Background(), request)
		var failure *unit.ModelError
		if !errors.As(err, &failure) || failure.Failure.Code != c.code {
			t.Fatalf("got %v", err)
		}
		raw := read(t, run.Directory, "001-raw-output.json")
		if raw["content"] != c.content || raw["finishReason"] != c.finish || (c.refusal != "" && raw["refusal"] != c.refusal) {
			t.Errorf("raw %v", raw)
		}
		outcome := read(t, run.Directory, "001-outcome.json")
		if outcome["failure"].(map[string]any)["code"] != c.code || outcome["usage"].(map[string]any)["totalTokens"] != float64(15) || outcome["settings"].(map[string]any)["reasoningEffort"] != "low" {
			t.Errorf("outcome %v", outcome)
		}
		noSecret(t, run.Directory)
	}
}

func TestEvidenceKeepsSafeFailureFacts(t *testing.T) {
	run, _ := Start(t.TempDir(), map[string]any{}, provider.Settings{})
	model := run.Wrap(openRouter(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"code": 401, "message": secret, "metadata": map[string]any{"raw": secret}}})
	}))
	if _, err := model.Generate(context.Background(), request); err == nil {
		t.Fatal("expected a failure")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := model.Generate(ctx, request); err == nil {
		t.Fatal("expected a cancellation")
	}
	if read(t, run.Directory, "001-outcome.json")["failure"].(map[string]any)["code"] != unit.CodeAuthentication {
		t.Error("first outcome")
	}
	second := read(t, run.Directory, "002-outcome.json")
	if second["failure"].(map[string]any)["code"] != unit.CodeCancelled || second["rawOutput"] != "unavailable" {
		t.Errorf("second outcome %v", second)
	}
	noSecret(t, run.Directory)
}

func TestEvidenceWriteFailureStopsTheCall(t *testing.T) {
	run, _ := Start(t.TempDir(), map[string]any{}, provider.Settings{})
	calls := 0
	model := run.Wrap(fixedModel{output: s.NewObject(), check: func() { calls++ }})
	_ = os.WriteFile(filepath.Join(run.Directory, "001-request.json"), nil, 0o600)
	if _, err := model.Generate(context.Background(), request); !errors.Is(err, ErrWrite) || calls != 0 {
		t.Errorf("err %v, calls %d", err, calls)
	}
}
