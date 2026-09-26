package unit

import (
	"errors"
	"fmt"
	"regexp"

	"github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

// DefinitionDocument turns a Definition into inspectable rules evidence.
func DefinitionDocument(definition mechanics.Definition) (Document, error) {
	out, issues := s.Parse(mechanics.MechanicsDefinitionSchema, s.FromGoValue(definition))
	if len(issues) > 0 {
		return Document{}, &s.Error{Issues: issues}
	}
	return Document{
		ID:   "mechanics:" + definition.ID,
		Kind: "rules",
		Text: s.Stringify(out),
		Origin: Origin{
			Location: fmt.Sprintf("unit-mechanics:%s:%s", definition.ID, definition.Revision),
			Access:   "supplied",
			Note:     strPtr("Explicit mechanics definition. Build resolution is implemented; combat simulation and balance are not certified."),
		},
	}, nil
}

// WithDefinitionEvidence appends the Definition's evidence document when missing.
// It reports whether the request changed.
func WithDefinitionEvidence(request Request) (Request, bool, error) {
	if request.MechanicsDefinition == nil {
		return request, false, nil
	}
	document, err := DefinitionDocument(*request.MechanicsDefinition)
	if err != nil {
		return request, false, err
	}
	for _, existing := range request.Documents {
		if existing.ID == document.ID {
			if s.Stringify(s.FromGoValue(existing)) != s.Stringify(s.FromGoValue(document)) {
				return request, false, errors.New("The mechanics evidence document differs from the supplied definition. Edit mechanicsDefinition, not its generated evidence document.")
			}
			return request, false, nil
		}
	}
	request.Documents = append(append([]Document(nil), request.Documents...), document)
	return request, true, nil
}

// DefinitionProgression is the request progression a Definition implies.
func DefinitionProgression(definition mechanics.Definition) Progression {
	paths := make([]ProgressionPath, 3)
	for i := range paths {
		paths[i] = ProgressionPath{ID: fmt.Sprintf("path-%d", i+1), Tiers: []int{1, 2, 3, 4, 5}}
	}
	return Progression{
		Paths:          paths,
		MaxActivePaths: definition.Progression.MaxPurchasedPaths,
		MaxPathsAboveTier: &Threshold{
			Tier:  definition.Progression.CrosspathTier,
			Count: definition.Progression.MaxAdvancedPaths,
		},
	}
}

// ParseRequest validates a request value and decodes it.
func ParseRequest(value any) (Request, error) {
	var request Request
	return request, s.ParseInto(RequestSchema, value, &request)
}

func unique[T comparable](values []T, subject string) error {
	seen := map[T]bool{}
	for _, v := range values {
		if seen[v] {
			return fmt.Errorf("%s must have unique identifiers or values", subject)
		}
		seen[v] = true
	}
	return nil
}

func validateRequest(request Request) error {
	var ids []string
	for _, d := range request.Documents {
		ids = append(ids, d.ID)
	}
	if err := unique(ids, "Documents"); err != nil {
		return err
	}
	ids = nil
	for _, c := range request.Constraints {
		ids = append(ids, c.ID)
	}
	if err := unique(ids, "Constraints"); err != nil {
		return err
	}
	hasSource := false
	for _, d := range request.Documents {
		if d.Kind == "source" {
			hasSource = true
		}
	}
	if !hasSource {
		return errors.New("At least one supplied source document is required; a character name is insufficient evidence")
	}
	if request.Previous != nil && request.Feedback == nil {
		return errors.New("A revision requires explicit feedback")
	}
	if err := validateProgression(request.Progression); err != nil {
		return err
	}
	if request.MechanicsDefinition != nil {
		expected := DefinitionProgression(*request.MechanicsDefinition)
		if request.Progression == nil || s.Stringify(s.FromGoValue(request.Progression)) != s.Stringify(s.FromGoValue(expected)) {
			return errors.New("Progression must match the explicit mechanics definition. Use its three paths and crosspath limits.")
		}
		_, changed, err := WithDefinitionEvidence(request)
		if err != nil {
			return err
		}
		if changed {
			return errors.New("Prepared requests must retain their mechanics definition evidence. Run prepare again.")
		}
	}
	return nil
}

func validateProgression(progression *Progression) error {
	if progression == nil {
		return nil
	}
	var ids []string
	for _, p := range progression.Paths {
		ids = append(ids, p.ID)
	}
	if err := unique(ids, "Progression paths"); err != nil {
		return err
	}
	for _, p := range progression.Paths {
		if err := unique(p.Tiers, "Progression path "+p.ID+" tiers"); err != nil {
			return err
		}
	}
	if progression.MaxActivePaths > len(progression.Paths) {
		return errors.New("maxActivePaths exceeds declared path count")
	}
	if progression.MaxPathsAboveTier != nil && progression.MaxPathsAboveTier.Count > len(progression.Paths) {
		return errors.New("maxPathsAboveTier.count exceeds declared path count")
	}
	if progression.AllowedTierCombinations != nil {
		for _, combination := range *progression.AllowedTierCombinations {
			if err := validateAllowedCombination(combination, progression); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateAllowedCombination(combination []int, progression *Progression) error {
	usesDeclared := len(combination) == len(progression.Paths)
	if usesDeclared {
		for i, tier := range combination {
			if tier == 0 {
				continue
			}
			found := false
			for _, t := range progression.Paths[i].Tiers {
				if t == tier {
					found = true
				}
			}
			if !found {
				usesDeclared = false
			}
		}
	}
	if !usesDeclared {
		return errors.New("Allowed tier combinations must give one declared tier or zero for every path in declaration order")
	}
	active, total, above := 0, 0, 0
	for _, tier := range combination {
		if tier > 0 {
			active++
		}
		total += tier
		if progression.MaxPathsAboveTier != nil && tier > progression.MaxPathsAboveTier.Tier {
			above++
		}
	}
	if active > progression.MaxActivePaths ||
		(progression.MaxTotalTiers != nil && total > *progression.MaxTotalTiers) ||
		(progression.MaxPathsAboveTier != nil && above > progression.MaxPathsAboveTier.Count) {
		return errors.New("An allowed tier combination contradicts the supplied progression limits")
	}
	return nil
}

// Prepare validates a request value and returns a prepared request with its hash.
func Prepare(value any) (Prepared, error) {
	request, err := ParseRequest(value)
	if err != nil {
		return Prepared{}, err
	}
	request, _, err = WithDefinitionEvidence(request)
	if err != nil {
		return Prepared{}, err
	}
	if request, err = ParseRequest(s.FromGoValue(request)); err != nil {
		return Prepared{}, err
	}
	if err := validateRequest(request); err != nil {
		return Prepared{}, err
	}
	hash, err := HashRequest(request)
	if err != nil {
		return Prepared{}, err
	}
	return Prepared{SchemaVersion: "1", Kind: "prepared", InputHash: hash, Request: request}, nil
}

// VerifyPrepared checks a prepared request's rules and its hash.
func VerifyPrepared(prepared Prepared) error {
	if err := validateRequest(prepared.Request); err != nil {
		return err
	}
	ok, err := VerifyHash(prepared.Request, prepared.InputHash)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("Prepared input hash does not match its retained request")
	}
	return nil
}

var profileDocument = regexp.MustCompile(`^(default-td-profile-v[0-9]+|profile:.+|mechanics:.+)$`)

// IsProfileDocument reports whether a document ID belongs to a Profile: its
// rules or its Definition's evidence. Applying another Profile replaces them.
func IsProfileDocument(id string) bool { return profileDocument.MatchString(id) }

// ApplyProfile replaces the rules a request is generated under with a Profile:
// its task, progression, Definition and rules document. Character, sources,
// decisions and revision context stay.
func ApplyProfile(request Request, profile Profile) Request {
	progression := DefinitionProgression(profile.MechanicsDefinition)
	definition := profile.MechanicsDefinition
	request.Task = profile.Task
	request.Progression = &progression
	request.MechanicsDefinition = &definition
	var documents []Document
	for _, d := range request.Documents {
		if !IsProfileDocument(d.ID) {
			documents = append(documents, d)
		}
	}
	request.Documents = append(documents, profile.Rules)
	return request
}

// ParseProfile validates a Profile value.
func ParseProfile(value any) (Profile, error) {
	var profile Profile
	return profile, s.ParseInto(UnitProfileSchema, value, &profile)
}

// ValidateProfile checks that a request prepared under the Profile passes
// the same checks as any other.
func ValidateProfile(value any) (Profile, error) {
	profile, err := ParseProfile(value)
	if err != nil {
		return Profile{}, err
	}
	placeholder := Request{
		SchemaVersion: "1",
		Task:          profile.Task,
		Character:     Character{Name: "Profile check", Work: "Profile check", Scope: "Profile check"},
		Documents: []Document{{
			ID: "profile-check-source", Kind: "source",
			Text:   "Placeholder source text used only to validate a Profile.",
			Origin: Origin{Location: "profile-check", Access: "supplied"},
		}},
		Constraints: []Constraint{},
	}
	if _, err := Prepare(s.FromGoValue(ApplyProfile(placeholder, profile))); err != nil {
		return Profile{}, err
	}
	return profile, nil
}
