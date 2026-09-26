package unit_test

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/mardwerk/unit-generator/src/cli/internal/fixture"
	"github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// at reads a key path from a JSON value; nil when absent.
func at(value any, path ...string) any {
	for _, key := range path {
		object, ok := value.(*s.Object)
		if !ok {
			return nil
		}
		value, _ = object.Get(key)
	}
	return value
}

func recordedOutput(t *testing.T, name string) *s.Object {
	t.Helper()
	value, err := fixture.JSON(name)
	if err != nil {
		t.Fatal(err)
	}
	return value.(*s.Object)
}

// retryReason is the part of a retry prompt that names the rejected output's issues.
func retryReason(prompt string) string {
	for _, marker := range []string{"\"violations\"", "\"issues\"", "\"findings\"", "Correct the"} {
		if i := strings.Index(prompt, marker); i >= 0 {
			return prompt[i:min(len(prompt), i+2500)]
		}
	}
	return "no marker"
}

// The scripted fixture passes plan, mechanics, check and review, and every
// stage reproduces from the retained inputs alone.
func TestScriptedPipelineRunsEveryStage(t *testing.T) {
	prepared, err := fixture.Prepare()
	if err != nil {
		t.Fatal(err)
	}
	model := &fixture.Model{Outputs: []any{recordedOutput(t, "plan"), recordedOutput(t, "mechanics")}}
	draft, err := unit.DraftUnit(context.Background(), prepared, model, fixture.Options())
	if err != nil {
		t.Fatalf("draft: %v\n%s", err, retryReason(model.Requests[len(model.Requests)-1].Prompt))
	}
	var purposes []string
	for _, attempt := range *draft.Run.Attempts {
		purposes = append(purposes, attempt.Purpose)
	}
	if strings.Join(purposes, ",") != "plan,design" || len(model.Requests) != 2 {
		t.Fatalf("attempts %v after %d calls", purposes, len(model.Requests))
	}
	if draft.Run.DesignPlan == nil || draft.Run.DesignEvaluation == nil {
		t.Fatal("the draft lost its plan or purchase evidence")
	}
	checked, err := unit.CheckDraft(draft)
	if err != nil {
		t.Fatal(err)
	}
	legal := false
	for _, finding := range checked.Findings {
		if finding.Outcome == "fail" {
			t.Errorf("%s %s: %s", finding.Rule, finding.Subject, finding.Message)
		}
		if finding.Rule == "typed-mechanics" && finding.Outcome == "pass" && strings.Contains(finding.Message, "All 64 legal builds") {
			legal = true
		}
	}
	if !legal {
		t.Error("the typed mechanics check did not cover all 64 legal builds")
	}
	again, err := unit.CheckDraft(draft)
	if err != nil || s.Stringify(s.FromGoValue(again)) != s.Stringify(s.FromGoValue(checked)) {
		t.Error("checking the same draft twice differs")
	}
	tampered := checked
	tampered.Findings = checked.Findings[1:]
	review := &fixture.Model{Outputs: []any{recordedOutput(t, "review")}}
	if _, err := unit.ReviewDraft(context.Background(), tampered, review, fixture.Options()); err == nil || len(review.Requests) != 0 {
		t.Error("the review accepted findings that the checks do not reproduce")
	}
	result, err := unit.ReviewDraft(context.Background(), checked, review, fixture.Options())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := unit.ParseResult(s.FromGoValue(result)); err != nil || result.SchemaVersion != "2" {
		t.Errorf("result %s: %v", result.SchemaVersion, err)
	}
	if last := result.Findings[len(result.Findings)-1]; last.Method != "model" || last.ID != "model.fan-club-allies" {
		t.Errorf("the model finding is missing: %+v", last)
	}
	// A candidate edited after compilation no longer matches its blueprint.
	edited := draft
	edited.Candidate.Paths[0].Tiers[0].Benefit = "Edited by hand."
	checkedEdit, err := unit.CheckDraft(edited)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, finding := range checkedEdit.Findings {
		if finding.Outcome == "fail" && finding.Subject == "candidate" {
			found = true
		}
	}
	if !found {
		t.Error("an edited candidate passed the compile check")
	}
}

// An over-budget tier gets a targeted repair: the model picks one effect
// subset and code keeps every other tier as authored.
func TestTargetedRepairKeepsOtherTiers(t *testing.T) {
	prepared, err := fixture.Prepare()
	if err != nil {
		t.Fatal(err)
	}
	mechanicsOutput := recordedOutput(t, "mechanics")
	tier1 := at(mechanicsOutput, "paths", "path1", "tiers", "tier1").(*s.Object)
	tier1.Set("statChanges", []any{
		s.NewObject().Set("stat", "pierce").Set("operation", "add").Set("value", 1.0),
		s.NewObject().Set("stat", "damage").Set("operation", "add").Set("value", 1.0),
		s.NewObject().Set("stat", "range").Set("operation", "add").Set("value", 2.0),
		s.NewObject().Set("stat", "intervalSeconds").Set("operation", "multiply").Set("value", 0.9),
	})
	repair := s.NewObject().Set("paths", s.NewObject().Set("path1", s.NewObject().Set("tiers", s.NewObject().Set("tier1", s.NewObject().Set("choice", "option-1")))))
	model := &fixture.Model{Outputs: []any{recordedOutput(t, "plan"), mechanicsOutput, repair}}
	draft, err := unit.DraftUnit(context.Background(), prepared, model, fixture.Options())
	if err != nil {
		t.Fatalf("draft: %v", err)
	}
	if len(model.Requests) != 3 || !strings.Contains(model.Requests[2].Prompt, "effectSubsetChoices") || !strings.Contains(model.Requests[2].Prompt, "Code checks each milestone's improves and unlock") {
		t.Fatalf("expected a subset repair, got %d calls", len(model.Requests))
	}
	kept := draft.Candidate.Blueprint.Paths.Path1.Tiers.Tier1.Changes
	if len(kept) != 3 {
		t.Errorf("repair kept %d effects", len(kept))
	}
	if draft.Candidate.Blueprint.Paths.Path3.Tiers.Tier5.Cost != 21500 {
		t.Error("repair changed an untouched tier")
	}
}

// Output that stays invalid through the repair budget is never published.
func TestInvalidMechanicsAreNeverPublished(t *testing.T) {
	prepared, err := fixture.Prepare()
	if err != nil {
		t.Fatal(err)
	}
	broken := recordedOutput(t, "mechanics")
	at(broken, "paths", "path2", "tiers", "tier3").(*s.Object).Set("statChanges", []any{
		s.NewObject().Set("stat", "projectiles").Set("operation", "multiply").Set("value", 1.5),
	})
	repairs := 0
	model := &fixture.Model{Outputs: []any{recordedOutput(t, "plan"), broken, broken}}
	_, err = unit.DraftUnit(context.Background(), prepared, model, unit.Options{MaxRepairAttempts: &repairs})
	var failure *unit.ModelError
	if !errors.As(err, &failure) || !strings.Contains(failure.Message, "No invalid Unit was published") || !strings.Contains(failure.Message, "projectiles") {
		t.Fatalf("got %v", err)
	}
}

// A unit authored under the stacking example Profile adds poison at 3-x-x,
// strengthens it at 4-x-x and passes every stage in version 2 form.
func TestVersion2AuthorsWithStackingEffects(t *testing.T) {
	request, err := fixture.Request()
	if err != nil {
		t.Fatal(err)
	}
	profile := unit.ExampleStackingProfile()
	if _, err := unit.ValidateProfile(s.FromGoValue(profile)); err != nil {
		t.Fatalf("example Profile: %v", err)
	}
	prepared, err := unit.Prepare(s.FromGoValue(unit.ApplyProfile(request, profile)))
	if err != nil {
		t.Fatal(err)
	}
	if prepared.SchemaVersion != "2" {
		t.Fatalf("prepared version %s", prepared.SchemaVersion)
	}
	plan := recordedOutput(t, "plan")
	milestones := at(plan, "paths", "path1", "milestones").(*s.Object)
	at(milestones, "tier3").(*s.Object).Set("improves", []any{"damage", "pierce"}).Set("unlock", "poison")
	at(milestones, "tier4").(*s.Object).Set("improves", []any{"pierce", "poison"})

	mechanicsOutput := recordedOutput(t, "mechanics")
	tiers := at(mechanicsOutput, "paths", "path1", "tiers").(*s.Object)
	poison := func(magnitude float64) []any {
		return []any{s.NewObject().Set("effect", "poison").Set("magnitude", magnitude).Set("seconds", 4.0)}
	}
	tier3 := at(tiers, "tier3").(*s.Object)
	tier3.Set("statChanges", tier3Changes(tier3, "damage", "pierce")).Set("statuses", poison(2))
	tier4 := at(tiers, "tier4").(*s.Object)
	tier4.Set("statChanges", tier3Changes(tier4, "pierce")).Set("statuses", poison(3))

	scripted := &fixture.Model{Outputs: []any{plan, mechanicsOutput}}
	draft, err := unit.DraftUnit(context.Background(), prepared, scripted, unit.Options{})
	if err != nil {
		last := scripted.Requests[len(scripted.Requests)-1].Prompt
		t.Fatalf("draft after %d calls: %v\n%s", len(scripted.Requests), err, retryReason(last))
	}
	if len(scripted.Requests) != 2 {
		t.Fatalf("%d model calls", len(scripted.Requests))
	}
	for i, request := range scripted.Requests {
		if !strings.Contains(request.Prompt, "poison (Poison; also venom, toxin): damageOverTime, magnitude 0.5 to 5 damage/s, at most 8 s, stacks to 5 (independent), combined at most 10") {
			t.Errorf("call %d does not describe poison", i+1)
		}
	}
	if schema := s.Stringify(scripted.Requests[1].Schema); !strings.Contains(schema, `"statuses"`) || strings.Contains(schema, `"slowPercent"`) {
		t.Error("the mechanics schema is not version 2")
	}
	if draft.SchemaVersion != "2" {
		t.Fatalf("draft version %s", draft.SchemaVersion)
	}
	if benefit := draft.Candidate.Paths[0].Tiers[2].Benefit; !strings.Contains(benefit, "Poison") {
		t.Errorf("3-x-x benefit %q does not name Poison", benefit)
	}
	checked, err := unit.CheckDraft(draft)
	if err != nil {
		t.Fatal(err)
	}
	for _, finding := range checked.Findings {
		if finding.Outcome == "fail" {
			t.Errorf("finding %s: %s", finding.ID, finding.Message)
		}
	}
	// Four seconds of poison every 0.95 seconds stack four times: about
	// 4.2 × 3 damage/s exceeds the combined cap of 10.
	vocabulary := prepared.Request.MechanicsDefinition.Terms()
	build := mechanics.ResolveUnchecked(draft.Candidate.Blueprint, mechanics.Selection{4, 0, 0})
	effect, _ := vocabulary.Effect("poison")
	status, ok := build.BaseAttack.Status("poison")
	if !ok {
		t.Fatal("the 4-0-0 build has no poison")
	}
	if got := mechanics.Sustained(effect, status, build.BaseAttack.Stats.IntervalSeconds); got != 10 {
		t.Errorf("sustained poison %v, want the cap 10", got)
	}
	review := &fixture.Model{Outputs: []any{s.NewObject().Set("summary", "Poison develops the top path.").Set("findings", []any{})}}
	result, err := unit.ReviewDraft(context.Background(), checked, review, unit.Options{})
	if err != nil {
		t.Fatal(err)
	}
	if result.SchemaVersion != "2" || !strings.Contains(review.Requests[0].Prompt, "stacking and immunities are defined in the Definition's vocabulary") {
		t.Error("the review is not version 2")
	}
}

// tier3Changes keeps only the named stat changes of a wire tier.
func tier3Changes(tier *s.Object, stats ...string) []any {
	var kept []any
	for _, change := range at(tier, "statChanges").([]any) {
		for _, stat := range stats {
			if at(change, "stat") == stat {
				kept = append(kept, change)
			}
		}
	}
	return kept
}

// Prepared requests hashed by the retired TypeScript Tool keep verifying.
func TestLegacyHashesStillVerify(t *testing.T) {
	raw, err := os.ReadFile("testdata/legacy-hash.json")
	if err != nil {
		t.Fatal(err)
	}
	value, err := s.Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	request, err := unit.ParseRequest(at(value, "request"))
	if err != nil {
		t.Fatal(err)
	}
	hash := at(value, "hash").(string)
	if ok, err := unit.VerifyHash(request, hash); !ok || err != nil {
		t.Fatalf("legacy hash no longer verifies: %v", err)
	}
	request.Task += " Changed."
	if ok, _ := unit.VerifyHash(request, hash); ok {
		t.Error("a changed request verified")
	}
	current, err := unit.HashRequest(request)
	if err != nil || !strings.HasPrefix(current, unit.HashJCS) {
		t.Errorf("new hashes use %s: %s %v", unit.HashJCS, current, err)
	}
}

// Artifacts are strict: unknown keys and unknown versions are rejected.
func TestContractsAreStrict(t *testing.T) {
	stages, err := fixture.Build()
	if err != nil {
		t.Fatal(err)
	}
	prepared := s.FromGoValue(stages.Prepared).(*s.Object)
	if _, err := unit.ParsePrepared(prepared); err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]func(*s.Object){
		"unknown key":     func(o *s.Object) { o.Set("apiKey", "x") },
		"unknown version": func(o *s.Object) { o.Set("schemaVersion", "3") },
		"missing hash":    func(o *s.Object) { o.Delete("inputHash") },
	} {
		edited := s.Clone(prepared).(*s.Object)
		change(edited)
		if _, err := unit.ParsePrepared(edited); err == nil {
			t.Errorf("%s was accepted", name)
		}
	}
	draft := s.FromGoValue(stages.Draft).(*s.Object)
	at(draft, "candidate", "blueprint", "paths", "path1", "tiers", "tier1").(*s.Object).Set("cost", -1.0)
	if _, err := unit.ParseDraft(draft); err == nil {
		t.Error("a negative price was accepted")
	}
}
