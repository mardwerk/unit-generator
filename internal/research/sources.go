// Package research turns a character name into a reusable Sources artifact:
// the character's identity, retrieved source documents and source images,
// cited and bounded. It makes no model call. It also resolves the explicit
// document inputs of a request file (text, local file or URL).
package research

import (
	s "github.com/mardwerk/unit-generator/internal/schema"
	"github.com/mardwerk/unit-generator/internal/unit"
)

// Sources is the saved result of researching a character. Preparing it
// under any Profile gives a request, so a unit can be regenerated or
// generated under another Profile without researching again.
type Sources struct {
	SchemaVersion string          `json:"schemaVersion"`
	Kind          string          `json:"kind"`
	Query         string          `json:"query"`
	RetrievedAt   string          `json:"retrievedAt"`
	Character     unit.Character  `json:"character"`
	Documents     []unit.Document `json:"documents"`
}

// SourcesSchema is the contract of a Sources artifact.
var SourcesSchema = s.StrictObject(
	s.F("schemaVersion", s.Literal("1")),
	s.F("kind", s.Literal("sources")),
	s.F("query", s.String().Trim().Min(1).Max(120)),
	s.F("retrievedAt", s.String().Min(1)),
	s.F("character", unit.CharacterSchema),
	s.F("documents", s.Array(unit.ResolvedDocumentSchema).Min(1)),
)

// ParseSources validates a Sources artifact.
func ParseSources(value any) (Sources, error) {
	var sources Sources
	return sources, s.ParseInto(SourcesSchema, value, &sources)
}

// Request is the starter request for these sources, before a Profile adds
// its task, progression, Definition and rules.
func (sources Sources) Request() unit.Request {
	documents := append([]unit.Document{}, sources.Documents...)
	return unit.Request{
		SchemaVersion: "1",
		Character:     sources.Character,
		Task:          unit.StarterTask,
		Documents:     documents,
		Constraints:   []unit.Constraint{},
	}
}

// Prepare applies a Profile to the sources and prepares the request.
func (sources Sources) Prepare(profile unit.Profile) (unit.Prepared, error) {
	return unit.Prepare(s.FromGoValue(unit.ApplyProfile(sources.Request(), profile)))
}

// Choice is one candidate when a name is ambiguous.
type Choice struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}
