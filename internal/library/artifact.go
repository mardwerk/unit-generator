// Package library is the local store and index of research and units:
// Sources, prepared requests, drafts, checked drafts and Results, each with
// its Markdown render, plus unit icons and portrait choices. Profiles live
// separately (see Profiles). Filesystem state belongs here, never in the
// Engine.
package library

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"

	"github.com/mardwerk/unit-generator/internal/research"
	s "github.com/mardwerk/unit-generator/internal/schema"
	"github.com/mardwerk/unit-generator/internal/unit"
)

// Artifact is a validated artifact of any stored kind.
type Artifact struct {
	Kind string
	// Value is the contract-ordered artifact, as saved.
	Value    any
	Sources  *research.Sources
	Prepared *unit.Prepared
	Draft    *unit.Draft
	Checked  *unit.Checked
	Result   *unit.Result
}

// Character is the character the artifact is about.
func (a Artifact) Character() unit.Character {
	if a.Sources != nil {
		return a.Sources.Character
	}
	return a.Request().Character
}

// Request is the prepared request, or the starter request of Sources.
func (a Artifact) Request() unit.Request {
	switch {
	case a.Sources != nil:
		return a.Sources.Request()
	case a.Prepared != nil:
		return a.Prepared.Request
	case a.Draft != nil:
		return a.Draft.Prepared.Request
	case a.Checked != nil:
		return a.Checked.Draft.Prepared.Request
	}
	return a.Result.Prepared.Request
}

// Candidate is the unit, when the artifact has one.
func (a Artifact) Candidate() (unit.Candidate, bool) {
	switch {
	case a.Draft != nil:
		return a.Draft.Candidate, true
	case a.Checked != nil:
		return a.Checked.Draft.Candidate, true
	case a.Result != nil:
		return a.Result.Candidate, true
	}
	return unit.Candidate{}, false
}

var schemas = map[string]s.Schema{
	"sources":  research.SourcesSchema,
	"prepared": unit.PreparedSchema,
	"draft":    unit.DraftSchema,
	"checked":  unit.CheckedSchema,
	"result":   unit.ResultSchema,
}

// ErrNotArtifact means the value is an editable request or unknown input.
var ErrNotArtifact = errors.New("Save a completed stage or researched sources to the library.")

// Inspect validates a stored kind and verifies its input hash.
func Inspect(value any) (Artifact, error) {
	object, ok := value.(*s.Object)
	if !ok {
		return Artifact{}, ErrNotArtifact
	}
	kind, _ := object.Get("kind")
	name, _ := kind.(string)
	schema, ok := schemas[name]
	if !ok {
		return Artifact{}, ErrNotArtifact
	}
	parsed, issues := s.Parse(schema, value)
	if len(issues) > 0 {
		return Artifact{}, &s.Error{Issues: issues}
	}
	artifact := Artifact{Kind: name, Value: parsed}
	var err error
	switch name {
	case "sources":
		artifact.Sources = &research.Sources{}
		err = s.ToGo(parsed, artifact.Sources)
	case "prepared":
		artifact.Prepared = &unit.Prepared{}
		err = s.ToGo(parsed, artifact.Prepared)
	case "draft":
		artifact.Draft = &unit.Draft{}
		err = s.ToGo(parsed, artifact.Draft)
	case "checked":
		artifact.Checked = &unit.Checked{}
		err = s.ToGo(parsed, artifact.Checked)
	case "result":
		artifact.Result = &unit.Result{}
		err = s.ToGo(parsed, artifact.Result)
	}
	if err != nil {
		return Artifact{}, err
	}
	if name != "sources" {
		var prepared unit.Prepared
		switch {
		case artifact.Prepared != nil:
			prepared = *artifact.Prepared
		case artifact.Draft != nil:
			prepared = artifact.Draft.Prepared
		case artifact.Checked != nil:
			prepared = artifact.Checked.Draft.Prepared
		default:
			prepared = artifact.Result.Prepared
		}
		if err := unit.VerifyPrepared(prepared); err != nil {
			return Artifact{}, err
		}
	}
	return artifact, nil
}

// ID is the SHA-256 of the artifact's contract-ordered JSON, as the
// TypeScript library computed it.
func (a Artifact) ID() string {
	sum := sha256.Sum256([]byte(s.Stringify(a.Value)))
	return hex.EncodeToString(sum[:])
}

// artifactID names the artifact inside its kind: the Result ID, input hash
// or run ID.
func (a Artifact) artifactID(libraryID string) string {
	switch {
	case a.Result != nil:
		return a.Result.ID
	case a.Prepared != nil:
		return a.Prepared.InputHash
	case a.Checked != nil:
		return a.Checked.Draft.Run.ID
	case a.Draft != nil:
		return a.Draft.Run.ID
	}
	return libraryID
}
