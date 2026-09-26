package unit

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	"github.com/mardwerk/unit-generator/src/cli/internal/parity"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

// scriptedModel answers each call with the next output and keeps the requests.
type scriptedModel struct {
	outputs  []any
	requests []ModelRequest
}

func (m *scriptedModel) ID() string { return "scripted" }

func (m *scriptedModel) Generate(_ context.Context, request ModelRequest) (ModelResponse, error) {
	m.requests = append(m.requests, request)
	if len(m.requests) > len(m.outputs) {
		return ModelResponse{}, errors.New("unexpected extra model call")
	}
	return ModelResponse{Output: m.outputs[len(m.requests)-1]}, nil
}

// wireAttackV2 rewrites a recorded version 1 base attack in version 2 wire form.
func wireAttackV2(attack *s.Object) *s.Object {
	out := s.NewObject()
	for _, key := range attack.Keys() {
		value, _ := attack.Get(key)
		switch key {
		case "camo":
			detects := []any{}
			if value == true {
				detects = append(detects, "camo")
			}
			out.Set("detects", detects)
		case "stats":
			core := s.NewObject()
			for _, stat := range mechanics.CoreStatKeys {
				v, _ := value.(*s.Object).Get(stat)
				core.Set(stat, v)
			}
			out.Set("stats", core).Set("statuses", []any{})
		default:
			out.Set(key, value)
		}
	}
	return out
}

// wireTierV2 rewrites a recorded version 1 tier without statuses in
// version 2 wire form.
func wireTierV2(t *testing.T, tier *s.Object) *s.Object {
	out := s.NewObject()
	for _, key := range tier.Keys() {
		value, _ := tier.Get(key)
		switch key {
		case "slow", "burn":
			if value != nil {
				t.Fatal("the recorded tier has a status")
			}
		case "camo":
			if value == true {
				out.Set("detect", "camo")
			} else {
				out.Set("detect", nil)
			}
			out.Set("statuses", []any{})
		default:
			out.Set(key, value)
		}
	}
	return out
}

// A unit authored under the stacking example Profile adds poison at Tier3,
// strengthens it at Tier4 and passes every stage in version 2 form.
func TestVersion2AuthorsWithStackingEffects(t *testing.T) {
	entries, err := parity.Entries("draftUnit")
	if err != nil {
		t.Fatal(err)
	}
	var entry *s.Object
	for _, e := range entries {
		if _, ok := parity.Output(e); ok {
			entry = e
			break
		}
	}
	recorded, err := ParsePrepared(parity.Arg(entry, 0))
	if err != nil {
		t.Fatal(err)
	}
	profile := ExampleStackingProfile()
	if _, err := ValidateProfile(s.FromGoValue(profile)); err != nil {
		t.Fatalf("example Profile: %v", err)
	}
	prepared, err := Prepare(s.FromGoValue(ApplyProfile(recorded.Request, profile)))
	if err != nil {
		t.Fatal(err)
	}
	if prepared.SchemaVersion != "2" {
		t.Fatalf("prepared version %s", prepared.SchemaVersion)
	}

	model, _ := entry.Get("model")
	exchanges, _ := model.(*s.Object).Get("exchanges")
	output := func(i int) *s.Object {
		response, _ := exchanges.([]any)[i].(*s.Object).Get("response")
		value, _ := response.(*s.Object).Get("output")
		return s.Clone(parity.Restore(value)).(*s.Object)
	}
	plan := output(0)
	intents := field(field(plan, "upgradeIntents").(*s.Object), "path1").(*s.Object)
	field(intents, "tier3").(*s.Object).Set("unlock", "poison")
	field(intents, "tier4").(*s.Object).Set("improves", []any{"damage", "poison"})

	mechanicsOutput := output(1)
	mechanicsOutput.Set("baseAttack", wireAttackV2(field(mechanicsOutput, "baseAttack").(*s.Object)))
	paths := field(mechanicsOutput, "paths").(*s.Object)
	for _, pathKey := range paths.Keys() {
		tiers := field(field(paths, pathKey).(*s.Object), "tiers").(*s.Object)
		for _, tierKey := range tiers.Keys() {
			tiers.Set(tierKey, wireTierV2(t, field(tiers, tierKey).(*s.Object)))
		}
	}
	// The recorded Definition had no design policy; the Profile's needs one
	// specialization per path.
	for pathKey, specialization := range map[string]string{"path1": "direct-damage", "path2": "ability-burst", "path3": "group-damage"} {
		field(paths, pathKey).(*s.Object).Set("specialization", specialization)
	}
	tiers := field(field(paths, "path1").(*s.Object), "tiers").(*s.Object)
	poison := func(magnitude float64) []any {
		return []any{s.NewObject().Set("effect", "poison").Set("magnitude", magnitude).Set("seconds", 4.0)}
	}
	field(tiers, "tier3").(*s.Object).Set("statuses", poison(2))
	field(tiers, "tier4").(*s.Object).Set("statuses", poison(3))

	scripted := &scriptedModel{outputs: []any{plan, mechanicsOutput}}
	draft, err := DraftUnit(context.Background(), prepared, scripted, Options{})
	if err != nil {
		last := scripted.requests[len(scripted.requests)-1].Prompt
		t.Fatalf("draft after %d calls: %v\n%s", len(scripted.requests), err, retryReason(last))
	}
	if len(scripted.requests) != 2 {
		t.Fatalf("%d model calls", len(scripted.requests))
	}
	for i, request := range scripted.requests {
		if !strings.Contains(request.Prompt, "poison (Poison; also venom, toxin): damageOverTime, magnitude 0.5 to 5 damage/s, at most 8 s, stacks to 5 (independent), combined at most 10") {
			t.Errorf("call %d does not describe poison", i+1)
		}
	}
	if schema := s.Stringify(scripted.requests[1].Schema); !strings.Contains(schema, `"statuses"`) || strings.Contains(schema, `"slowPercent"`) {
		t.Error("the mechanics schema is not version 2")
	}
	if draft.SchemaVersion != "2" {
		t.Fatalf("draft version %s", draft.SchemaVersion)
	}
	var benefit string
	for _, path := range draft.Candidate.Paths {
		if path.ID == "path-1" {
			benefit = path.Tiers[2].Benefit
		}
	}
	if !strings.Contains(benefit, "Poison") {
		t.Errorf("Tier3 benefit %q does not name Poison", benefit)
	}

	checked, err := CheckDraft(draft)
	if err != nil {
		t.Fatal(err)
	}
	for _, finding := range checked.Findings {
		if finding.Outcome == "fail" {
			t.Errorf("finding %s: %s", finding.ID, finding.Message)
		}
	}
	// Four seconds of poison every second stack four times: 4 × 3 damage/s
	// exceeds the combined cap of 10.
	d := prepared.Request.MechanicsDefinition
	vocabulary := d.Terms()
	build := mechanics.ResolveUnchecked(draft.Candidate.Blueprint, mechanics.Selection{4, 0, 0})
	effect, _ := vocabulary.Effect("poison")
	status, ok := build.BaseAttack.Status("poison")
	if !ok {
		t.Fatal("the 4-0-0 build has no poison")
	}
	if got := mechanics.Sustained(effect, status, build.BaseAttack.Stats.IntervalSeconds); got != 10 {
		t.Errorf("sustained poison %v, want the cap 10", got)
	}

	review := &scriptedModel{outputs: []any{s.NewObject().Set("summary", "Poison develops path1.").Set("findings", []any{})}}
	result, err := ReviewDraft(context.Background(), checked, review, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if result.SchemaVersion != "2" || !strings.Contains(review.requests[0].Prompt, "stacking and immunities are defined in the Definition's vocabulary") {
		t.Error("the review is not version 2")
	}
	if _, err := ParseResult(s.FromGoValue(result)); err != nil {
		t.Errorf("result does not parse: %v", err)
	}
}

func TestBundledProfilesAreVersion2(t *testing.T) {
	for _, profile := range []Profile{DefaultProfile(), ExampleStackingProfile()} {
		parsed, err := ValidateProfile(s.FromGoValue(profile))
		if err != nil {
			t.Fatalf("%s: %v", profile.ID, err)
		}
		if parsed.SchemaVersion != "2" || !parsed.MechanicsDefinition.IsV2() {
			t.Errorf("%s is not version 2", profile.ID)
		}
		if s.Stringify(s.FromGoValue(parsed)) != s.Stringify(s.FromGoValue(profile)) {
			t.Errorf("%s changes when parsed", profile.ID)
		}
	}
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
