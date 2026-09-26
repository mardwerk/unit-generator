// Package fixture builds a scripted reference unit for tests. It prepares the
// Dart Monkey reference request under the bundled default Profile, then runs
// the real plan, mechanics, check and review stages with recorded model
// outputs. The unit is a test fixture written by hand from the btd6-atlas
// brief: it exercises the Engine and is not a model generation or a
// balanced design.
package fixture

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"time"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

//go:embed testdata/*.json
var files embed.FS

// ModelID names the scripted model in the fixture's runs.
const ModelID = "fixture:scripted"

// Stages are the artifacts of one scripted run, in pipeline order.
type Stages struct {
	Prepared unit.Prepared
	Draft    unit.Draft
	Checked  unit.Checked
	Result   unit.Result
}

// Values returns the stages as contract-ordered JSON values.
func (st Stages) Values() []any {
	return []any{s.FromGoValue(st.Prepared), s.FromGoValue(st.Draft), s.FromGoValue(st.Checked), s.FromGoValue(st.Result)}
}

// JSON reads one of the fixture's recorded files: request, plan, mechanics
// or review.
func JSON(name string) (any, error) {
	raw, err := files.ReadFile("testdata/" + name + ".json")
	if err != nil {
		return nil, err
	}
	return s.Decode(raw)
}

// Request is the fixture request with its documents resolved as supplied
// text attributed to their source URLs.
func Request() (unit.Request, error) {
	value, err := JSON("request")
	if err != nil {
		return unit.Request{}, err
	}
	object := value.(*s.Object)
	documents, _ := object.Get("documents")
	for _, raw := range documents.([]any) {
		document := raw.(*s.Object)
		location, _ := document.Get("sourceUrl")
		document.Delete("sourceUrl")
		note := "User-supplied text attributed to this URL; the URL was not retrieved or independently verified."
		document.Set("origin", s.NewObject().Set("location", location).Set("access", "supplied").Set("note", note))
	}
	return unit.ParseRequest(object)
}

// Model answers each call with the next recorded output and keeps the requests.
type Model struct {
	Outputs  []any
	Requests []unit.ModelRequest
}

// ID names the scripted model.
func (m *Model) ID() string { return ModelID }

// Generate returns the next output.
func (m *Model) Generate(_ context.Context, request unit.ModelRequest) (unit.ModelResponse, error) {
	m.Requests = append(m.Requests, request)
	if len(m.Requests) > len(m.Outputs) {
		return unit.ModelResponse{}, errors.New("fixture: unexpected extra model call")
	}
	return unit.ModelResponse{Output: s.Clone(m.Outputs[len(m.Requests)-1])}, nil
}

// Options fixes the clock and the IDs, so every run is identical.
func Options() unit.Options {
	count := 0
	return unit.Options{
		Now: func() time.Time { return time.Date(2026, 9, 26, 12, 0, 0, 0, time.UTC) },
		NewID: func() string {
			count++
			return fmt.Sprintf("00000000-0000-4000-8000-%012d", count)
		},
	}
}

// Prepare prepares the fixture request under the default Profile.
func Prepare() (unit.Prepared, error) {
	request, err := Request()
	if err != nil {
		return unit.Prepared{}, err
	}
	return unit.Prepare(s.FromGoValue(unit.ApplyProfile(request, unit.DefaultProfile())))
}

// Build runs the scripted pipeline: plan, mechanics, check and review.
func Build() (Stages, error) {
	prepared, err := Prepare()
	if err != nil {
		return Stages{}, fmt.Errorf("fixture prepare: %w", err)
	}
	var outputs []any
	for _, name := range []string{"plan", "mechanics", "review"} {
		output, err := JSON(name)
		if err != nil {
			return Stages{}, err
		}
		outputs = append(outputs, output)
	}
	model := &Model{Outputs: outputs}
	options := Options()
	draft, err := unit.DraftUnit(context.Background(), prepared, model, options)
	if err != nil {
		return Stages{}, fmt.Errorf("fixture draft: %w", err)
	}
	checked, err := unit.CheckDraft(draft)
	if err != nil {
		return Stages{}, fmt.Errorf("fixture check: %w", err)
	}
	result, err := unit.ReviewDraft(context.Background(), checked, model, options)
	if err != nil {
		return Stages{}, fmt.Errorf("fixture review: %w", err)
	}
	return Stages{Prepared: prepared, Draft: draft, Checked: checked, Result: result}, nil
}
