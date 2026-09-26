// Package evidence records one generation's exact model inputs and raw
// outputs in a local folder, for later inspection. Inputs may hold private
// design material: files are owner-readable only and never overwritten.
package evidence

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"github.com/mardwerk/unit-generator/internal/provider"
	s "github.com/mardwerk/unit-generator/internal/schema"
	"github.com/mardwerk/unit-generator/internal/unit"
)

// ErrWrite means evidence could not be saved. A run stops rather than
// continue without its evidence.
var ErrWrite = errors.New("Evidence could not be saved. Check the evidence directory and available disk space.")

// Run is one evidence folder.
type Run struct {
	Directory string
	settings  provider.Settings
	mu        sync.Mutex
	attempts  int
}

// Start creates a new folder under directory and saves the input, a
// manifest and an unassessed observations template.
func Start(directory string, input any, settings provider.Settings) (*Run, error) {
	started := time.Now().UTC()
	stamp := strings.ReplaceAll(started.Format("2006-01-02T15:04:05.000Z"), ":", "-")
	path, err := filepath.Abs(filepath.Join(directory, stamp+"-"+unit.NewUUID()))
	if err != nil {
		return nil, ErrWrite
	}
	run := &Run{Directory: path, settings: settings}
	if os.MkdirAll(path, 0o700) != nil {
		return nil, ErrWrite
	}
	manifest := s.NewObject().
		Set("format", "unit-generator-evidence-v1").
		Set("startedAt", started.Format("2006-01-02T15:04:05.000Z")).
		Set("runtime", runtimeManifest()).
		Set("settings", safeSettings(settings)).
		Set("limits", []any{
			"Development evidence, not a controlled study or gameplay observation.",
			"Provider routing, sampling and usage remain unknown unless reported.",
			"Input and model requests retain caller-supplied private design material.",
		})
	observations := s.NewObject().
		Set("status", "unassessed").
		Set("demonstration", s.NewObject().
			Set("status", "not-recorded").
			Set("distinctiveBehavior", nil).
			Set("helpfulSituation", nil).
			Set("unhelpfulSituation", nil).
			Set("expectedPlayerDecision", nil).
			Set("execution", "not-executed")).
		Set("preservation", s.NewObject().
			Set("status", "not-assessed").
			Set("originalBehavior", nil).
			Set("revisedBehavior", nil).
			Set("classification", nil)).
		Set("acceptance", s.NewObject().
			Set("status", "not-assessed").
			Set("reviewer", nil).
			Set("reasons", []any{}).
			Set("humanCorrectionMinutes", nil)).
		Set("checks", []any{}).
		Set("instructions", "Record scenarios as predicted until executed. Separate deterministic checks, model judgments and human observations. Acceptance is a caller decision.")
	for _, file := range []struct {
		name  string
		value any
	}{{"input.json", input}, {"manifest.json", manifest}, {"observations.json", observations}} {
		if err := run.save(file.name, file.value); err != nil {
			return nil, err
		}
	}
	return run, nil
}

func (r *Run) save(name string, value any) error {
	file, err := os.OpenFile(filepath.Join(r.Directory, name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return ErrWrite
	}
	_, err = io.WriteString(file, s.Indent(value)+"\n")
	if closeErr := file.Close(); err != nil || closeErr != nil {
		return ErrWrite
	}
	return nil
}

// Wrap records every call of model. Raw output is recorded when the model
// can report it.
func (r *Run) Wrap(model unit.Model) unit.Model { return &recorded{run: r, model: model} }

type recorded struct {
	run   *Run
	model unit.Model
}

func (m *recorded) ID() string { return m.model.ID() }

func (m *recorded) Generate(ctx context.Context, request unit.ModelRequest) (unit.ModelResponse, error) {
	r := m.run
	r.mu.Lock()
	r.attempts++
	attempt := fmt.Sprintf("%03d", r.attempts)
	r.mu.Unlock()
	start := time.Now()
	settings := r.settings
	observable, canObserve := m.model.(provider.Observable)
	if canObserve {
		settings = observable.Settings()
	}
	schema := any(request.Schema)
	if request.Schema == nil {
		schema = nil
	}
	if err := r.save(attempt+"-request.json", s.NewObject().
		Set("requestedAt", start.UTC().Format("2006-01-02T15:04:05.000Z")).
		Set("model", safeIdentifier(m.model.ID())).
		Set("settings", safeSettings(settings)).
		Set("system", request.System).
		Set("prompt", request.Prompt).
		Set("schema", schema)); err != nil {
		return unit.ModelResponse{}, err
	}
	captured := false
	var response unit.ModelResponse
	var err error
	if canObserve {
		response, err = observable.GenerateObserved(ctx, request, func(output provider.RawOutput) error {
			if err := r.save(attempt+"-raw-output.json", output); err != nil {
				return err
			}
			captured = true
			return nil
		})
	} else {
		response, err = m.model.Generate(ctx, request)
	}
	rawOutput := "unavailable"
	if captured {
		rawOutput = "recorded"
	}
	outcome := s.NewObject().
		Set("completedAt", time.Now().UTC().Format("2006-01-02T15:04:05.000Z")).
		Set("elapsedMs", float64(time.Since(start).Microseconds())/1000).
		Set("model", safeIdentifier(m.model.ID())).
		Set("settings", safeSettings(settings)).
		Set("rawOutput", rawOutput)
	if err != nil {
		if errors.Is(err, ErrWrite) {
			return response, err
		}
		failure, usage := safeFailure(err)
		if saveErr := r.save(attempt+"-outcome.json", prepend(outcome, "status", "failed").Set("failure", failure).Set("usage", usage)); saveErr != nil {
			return response, saveErr
		}
		return response, err
	}
	// Saved before the Engine validates the output.
	if err := r.save(attempt+"-output.json", s.NewObject().Set("output", response.Output).Set("usage", safeUsage(response.Usage))); err != nil {
		return unit.ModelResponse{}, err
	}
	if err := r.save(attempt+"-outcome.json", prepend(outcome, "status", "returned").
		Set("usage", safeUsage(response.Usage)).
		Set("validation", "not-performed-by-recorder")); err != nil {
		return unit.ModelResponse{}, err
	}
	return response, nil
}

func prepend(object *s.Object, key string, value any) *s.Object {
	out := s.NewObject().Set(key, value)
	for _, k := range object.Keys() {
		v, _ := object.Get(k)
		out.Set(k, v)
	}
	return out
}

// Finish saves the final artifact and a completed outcome.
func (r *Run) Finish(artifact any) error {
	if err := r.save("artifact.json", artifact); err != nil {
		return err
	}
	r.mu.Lock()
	attempts := r.attempts
	r.mu.Unlock()
	return r.save("outcome.json", s.NewObject().
		Set("status", "completed").
		Set("completedAt", time.Now().UTC().Format("2006-01-02T15:04:05.000Z")).
		Set("attempts", float64(attempts)).
		Set("acceptance", "not-assessed"))
}

// Fail saves a failed outcome with safe failure facts only.
func (r *Run) Fail(cause error) error {
	r.mu.Lock()
	attempts := r.attempts
	r.mu.Unlock()
	failure, usage := safeFailure(cause)
	return r.save("outcome.json", s.NewObject().
		Set("status", "failed").
		Set("completedAt", time.Now().UTC().Format("2006-01-02T15:04:05.000Z")).
		Set("attempts", float64(attempts)).
		Set("failure", failure).
		Set("usage", usage))
}

func safeFailure(err error) (*s.Object, any) {
	var known *unit.ModelError
	errors.As(err, &known)
	code := unit.CodeFailed
	var stage, httpStatus, timeout any
	var usage any
	switch {
	case errors.Is(err, ErrWrite):
		code = "EVIDENCE_WRITE_FAILED"
	case errors.Is(err, context.Canceled):
		code = unit.CodeCancelled
	case known != nil && known.Failure != nil:
		code = known.Failure.Code
	}
	if known != nil {
		if f := known.Failure; f != nil {
			if f.Stage != "" {
				stage = f.Stage
			}
			if f.HTTPStatus != 0 {
				httpStatus = float64(f.HTTPStatus)
			}
			if f.TimeoutMs != 0 {
				timeout = float64(f.TimeoutMs)
			}
		}
		usage = safeUsage(known.Usage)
	}
	return s.NewObject().Set("code", code).Set("stage", stage).Set("httpStatus", httpStatus).Set("timeoutMs", timeout), usage
}

func safeUsage(usage *unit.Usage) any {
	if usage == nil {
		return nil
	}
	parsed, issues := s.Parse(unit.ModelUsageSchema, s.FromGoValue(usage))
	if len(issues) > 0 {
		return nil
	}
	return parsed
}

var identifier = regexp.MustCompile(`^[a-zA-Z0-9._:/=+-]+$`)

func safeIdentifier(value string) any {
	if value == "" || len(value) > 256 || !identifier.MatchString(value) {
		return nil
	}
	return value
}

func safeSettings(settings provider.Settings) *s.Object {
	number := func(n int64) any {
		if n == 0 {
			return nil
		}
		return float64(n)
	}
	return s.NewObject().
		Set("model", safeIdentifier(settings.Model)).
		Set("reasoningEffort", safeIdentifier(settings.ReasoningEffort)).
		Set("temperature", nil).
		Set("topP", nil).
		Set("maxTokens", nil).
		Set("timeoutMs", number(settings.TimeoutMs)).
		Set("maxOutputBytes", number(settings.MaxOutputBytes))
}

// runtimeManifest identifies the executed program: its build and a hash of
// the binary itself, which a commit hash alone cannot do for local edits.
func runtimeManifest() *s.Object {
	out := s.NewObject().Set("go", runtime.Version())
	if info, ok := debug.ReadBuildInfo(); ok {
		out.Set("module", info.Main.Path).Set("version", info.Main.Version)
		for _, setting := range info.Settings {
			if setting.Key == "vcs.revision" || setting.Key == "vcs.modified" {
				out.Set(setting.Key, setting.Value)
			}
		}
	}
	if path, err := os.Executable(); err == nil {
		if file, err := os.Open(path); err == nil {
			hash := sha256.New()
			if _, err := io.Copy(hash, file); err == nil {
				out.Set("executableSha256", hex.EncodeToString(hash.Sum(nil)))
			}
			file.Close()
		}
	}
	return out
}
