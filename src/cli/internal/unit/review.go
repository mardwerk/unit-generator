package unit

import (
	"context"
	"errors"
	"strings"

	m "github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

// ParseChecked validates a checked artifact value.
func ParseChecked(value any) (Checked, error) {
	var c Checked
	return c, s.ParseInto(Versioned(value, CheckedSchema, CheckedSchemaV2), value, &c)
}

// ParseResult validates a Result value.
func ParseResult(value any) (Result, error) {
	var r Result
	return r, s.ParseInto(Versioned(value, ResultSchema, ResultSchemaV2), value, &r)
}

// ErrNoBlueprint means an older prose draft reached a stage that needs typed mechanics.
var ErrNoBlueprint = errors.New("This draft has no typed blueprint. It can be rendered, but reviewing needs a unit generated under a Profile.")

// BlueprintReviewRequest asks a separate model call for a semantic review.
func BlueprintReviewRequest(checked Checked) ModelRequest {
	request := &checked.Draft.Prepared.Request
	candidate := checked.Draft.Candidate
	blueprint := candidate.Blueprint
	var documentIDs []string
	for _, d := range request.Documents {
		documentIDs = append(documentIDs, d.ID)
	}
	finding := ReviewFindingSchema().Extend(s.F("evidence", s.Array(s.Enum(documentIDs...))))
	schema := SemanticReviewSchema.Extend(s.F("findings", s.Array(finding).Max(8)))
	mechanicsID := "mechanics:undefined"
	if request.MechanicsDefinition != nil {
		mechanicsID = "mechanics:" + request.MechanicsDefinition.ID
	}
	documents := []any{}
	for _, d := range request.Documents {
		if d.ID == mechanicsID {
			continue
		}
		entry := s.NewObject().Set("id", d.ID).Set("kind", d.Kind)
		if d.Kind != "source" {
			entry.Set("text", d.Text)
		}
		documents = append(documents, entry.Set("origin", s.FromGoValue(d.Origin)))
	}
	context := s.NewObject()
	if checked.Draft.Run.DesignPlan != nil {
		context.Set("designPlan", s.FromGoValue(checked.Draft.Run.DesignPlan))
	}
	comparisons := []any{}
	if blueprint != nil {
		var vocabulary *m.Vocabulary
		if d := request.MechanicsDefinition; d != nil {
			terms := d.Terms()
			vocabulary = &terms
		}
		comparisons = m.CompareCapstonePurchasesWith(blueprint, vocabulary)
	}
	context.Set("purchaseComparisons", comparisons).
		Set("character", s.FromGoValue(request.Character)).
		Set("task", request.Task).
		Set("constraints", s.FromGoValue(request.Constraints)).
		Set("previous", previousValue(request)).
		Set("previousFindings", previousFindings(request)).
		Set("feedback", nullableString(request.Feedback))
	if request.MechanicsDefinition != nil {
		context.Set("definition", s.FromGoValue(request.MechanicsDefinition))
	}
	evidence := AuthorEvidence(request)
	context.Set("documents", documents).
		Set("sourcePassages", s.FromGoValue(evidence)).
		Set("sourceScope", s.NewObject().
			Set("selected", float64(len(evidence))).
			Set("available", float64(len(EvidenceSpans(request)))).
			Set("note", "Bounded source selection; do not claim exhaustive canon coverage.")).
		Set("mechanicsEvidenceId", mechanicsID)
	pathEvidence := []any{}
	if blueprint != nil {
		context.Set("sourceFacts", s.FromGoValue(blueprint.SourceFacts))
		for index, path := range m.PathKeys {
			design := blueprint.Paths.At(index)
			entry := s.NewObject().Set("path", path)
			if design.Specialization != "" {
				entry.Set("specialization", design.Specialization)
			}
			quotes := []any{}
			for _, i := range design.SourceFactIndices {
				if i < len(blueprint.SourceFacts) {
					quotes = append(quotes, s.FromGoValue(blueprint.SourceFacts[i]))
				} else {
					quotes = append(quotes, nil)
				}
			}
			pathEvidence = append(pathEvidence, entry.Set("quotes", quotes))
		}
	}
	context.Set("pathEvidence", pathEvidence)
	var paths []any
	for _, p := range candidate.Paths {
		var tiers []any
		for _, t := range p.Tiers {
			tiers = append(tiers, s.NewObject().Set("tier", float64(t.Tier)).Set("name", t.Name).Set("benefit", t.Benefit))
		}
		if tiers == nil {
			tiers = []any{}
		}
		paths = append(paths, s.NewObject().Set("id", p.ID).Set("name", p.Name).Set("theme", p.Theme).Set("tiers", tiers))
	}
	if paths == nil {
		paths = []any{}
	}
	context.Set("unit", s.NewObject().
		Set("role", candidate.Role).
		Set("basicAttack", s.FromGoValue(candidate.BasicAttack)).
		Set("paths", paths).
		Set("abilities", s.FromGoValue(candidate.Abilities)).
		Set("mechanics", s.FromGoValue(candidate.Mechanics)).
		Set("unresolvedQuestions", s.FromGoValue(candidate.UnresolvedQuestions)))
	failed := []Finding{}
	for _, f := range checked.Findings {
		if f.Outcome == "fail" {
			failed = append(failed, f)
		}
	}
	context.Set("deterministicFindings", s.FromGoValue(failed))
	statuses := reviewLine33
	if isV2(request) {
		statuses = reviewStatusesV2
	}
	prompt := []string{reviewLine27, reviewLine28, reviewLine29, reviewLine30, reviewLine31, reviewLine32, statuses, reviewLine34, reviewLine35, s.Stringify(context)}
	return ModelRequest{System: reviewLine25, Prompt: strings.Join(prompt, "\n\n"), Schema: s.JSONSchema(schema)}
}

func invalidReview() *ModelError {
	message := "The model returned a review with invalid finding or evidence references. The draft is retained. Retry the review or choose another model."
	return &ModelError{Message: message, Failure: &Failure{Code: CodeOutputInvalid, Message: message, Stage: "review"}}
}

// ReviewDraft adds a model's semantic review to a checked draft.
func ReviewDraft(ctx context.Context, input Checked, model Model, options Options) (Result, error) {
	checked, err := ParseChecked(s.FromGoValue(input))
	if err != nil {
		return Result{}, err
	}
	verified, err := CheckDraft(checked.Draft)
	if err != nil {
		return Result{}, err
	}
	if s.Stringify(s.FromGoValue(verified.Findings)) != s.Stringify(s.FromGoValue(checked.Findings)) {
		return Result{}, errors.New("Checked findings do not match deterministic checks of the retained draft")
	}
	if err := ctx.Err(); err != nil {
		return Result{}, err
	}
	if checked.Draft.Candidate.Blueprint == nil {
		return Result{}, ErrNoBlueprint
	}
	startedAt := options.now()
	response, err := model.Generate(ctx, BlueprintReviewRequest(checked))
	usage := response.Usage
	var review SemanticReview
	if err == nil {
		err = s.ParseInto(SemanticReviewSchema, response.Output, &review)
	}
	if err == nil {
		documents := map[string]bool{}
		for _, d := range checked.Draft.Prepared.Request.Documents {
			documents[d.ID] = true
		}
		ids := map[string]bool{}
		for _, f := range review.Findings {
			if !strings.HasPrefix(f.ID, "model.") || ids[f.ID] {
				err = invalidReview()
				break
			}
			ids[f.ID] = true
			for _, id := range f.Evidence {
				if !documents[id] {
					err = invalidReview()
				}
			}
			if err != nil {
				break
			}
		}
	}
	if err == nil && ctx.Err() != nil {
		err = ctx.Err()
	}
	if err != nil {
		var validation *s.Error
		return Result{}, StageFailure(err, "review", usage, errors.As(err, &validation))
	}
	result := Result{
		SchemaVersion: checked.SchemaVersion, Kind: "result", ID: options.id(),
		Prepared: checked.Draft.Prepared, Candidate: checked.Draft.Candidate,
		Findings:      append(append([]Finding{}, checked.Findings...), review.Findings...),
		ReviewSummary: review.Summary,
		Run: ResultRuns{
			Draft:  checked.Draft.Run,
			Review: Run{ID: options.id(), ModelID: model.ID(), StartedAt: startedAt, CompletedAt: options.now(), Usage: usage},
		},
	}
	value := s.FromGoValue(result)
	if err := s.ParseInto(Versioned(value, ResultSchema, ResultSchemaV2), value, &result); err != nil {
		return Result{}, err
	}
	return result, nil
}

// Author prepares, drafts, checks and reviews one request.
func Author(ctx context.Context, request any, model Model, options Options) (Result, error) {
	prepared, err := Prepare(request)
	if err != nil {
		return Result{}, err
	}
	draft, err := DraftUnit(ctx, prepared, model, options)
	if err != nil {
		return Result{}, err
	}
	checked, err := CheckDraft(draft)
	if err != nil {
		return Result{}, err
	}
	return ReviewDraft(ctx, checked, model, options)
}
