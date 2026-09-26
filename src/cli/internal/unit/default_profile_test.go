package unit_test

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/mardwerk/unit-generator/src/cli/internal/fixture"
	m "github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// The default Profile cites the pinned btd6-atlas capture and none of the
// retired dataset or deleted snapshots.
func TestDefaultProfileCitesThePinnedAtlasCapture(t *testing.T) {
	profile := unit.DefaultProfile()
	rules := profile.Rules.Text
	for _, want := range []string{
		"btd6-atlas capture 56.3, Steam build 24829026, repository revision a380413",
		"DartMonkey-100 to -500", "BoomerangMonkey.json and -010 to -050", "SniperMonkey.json and -100 to -500",
		"IceMonkey.json and -100 to -500", "TackShooter.json and -010 to -050", "MonkeyVillage.json",
		"0-0-0", "x-4-x", "1-2-0", "12 early builds", "36 advanced builds",
		"Private design checks, never printed in the unit", "Unit output.",
		"a fifth purchase that only raises ordinary damage is a token step",
		"A second x-5-x Active", "no universal capstone multiplier",
	} {
		if !strings.Contains(rules, want) {
			t.Errorf("the default rules lack %q", want)
		}
	}
	prepared, err := fixture.Prepare()
	if err != nil {
		t.Fatal(err)
	}
	plan, err := unit.DesignPlanRequest(prepared)
	if err != nil {
		t.Fatal(err)
	}
	everything := rules + profile.Task + plan.Prompt + plan.System
	for _, retired := range []string{"btd6_towers.json", "a2a5e2bb4591", "source-snapshots", "bloons.fandom.com", "cyberquincy", "workedExamples", "universal threefold"} {
		if strings.Contains(everything, retired) {
			t.Errorf("the default Profile or plan prompt still cites %q", retired)
		}
	}
	definition := profile.MechanicsDefinition
	if definition.Revision != "2026-09-26-atlas-56.3-v13" || !strings.Contains(definition.Label, "btd6-atlas 56.3") || definition.Profile.MaxChangesPerTier != 5 {
		t.Errorf("Definition %s %q", definition.Revision, definition.Label)
	}
	if scale := definition.Profile.ReferenceScale; scale.BaseCost != 200 || scale.BaseDamage != 1 || scale.BaseIntervalSeconds != 0.95 || scale.BaseRange != 32 || scale.BasePierce != 2 ||
		scale.IncrementalUpgradeCosts != [5]float64{140, 200, 320, 1800, 15000} {
		t.Errorf("reference scale %+v does not match DartMonkey.json and its top-path upgrades", scale)
	}
	if policy := definition.Profile.DesignPolicy; policy.MinTier5SpecialtyMultiplier != nil {
		t.Error("the default Profile demands a universal capstone multiplier")
	}
}

// Every stage's prompt states which instructions are private checks and
// which text reaches the unit, and none demands one recipe for every path.
func TestPromptsSeparatePrivateChecksFromOutput(t *testing.T) {
	stages, err := fixture.Build()
	if err != nil {
		t.Fatal(err)
	}
	model := &fixture.Model{Outputs: []any{recordedOutput(t, "plan"), recordedOutput(t, "mechanics"), recordedOutput(t, "review")}}
	draft, err := unit.DraftUnit(context.Background(), stages.Prepared, model, fixture.Options())
	if err != nil {
		t.Fatal(err)
	}
	checked, _ := unit.CheckDraft(draft)
	if _, err := unit.ReviewDraft(context.Background(), checked, model, fixture.Options()); err != nil {
		t.Fatal(err)
	}
	plan, mechanics, review := model.Requests[0].Prompt, model.Requests[1].Prompt, model.Requests[2].Prompt
	for name, test := range map[string]struct {
		prompt string
		want   []string
	}{
		"plan": {plan, []string{
			"buyFor, weakness and capstoneValue are private design checks and never appear in the unit description",
			"Name every purchase by build code", "a purchase that only raises damage is a token step",
			"A second Active at the fifth purchase", "12 early and 36 advanced crosspath builds",
			"more shots per attack to projectiles, heavier hits to damage",
		}},
		"mechanics": {mechanics, []string{
			"Refer to purchases by build code", "The boost is the only activated ability this Definition expresses",
			"List in unsupportedMechanics", "a fifth purchase that only raises ordinary damage is a token step",
			"No universal capstone multiplier applies", "Role scales from the rules document's btd6-atlas 56.3 references",
			"Code checks each milestone's improves and unlock in every legal build", "more projectiles do not count",
			"Tier1 to Tier2 allow 1 to 3 primitive changes total; Tier3 to Tier5 allow up to 5.",
		}},
		"review": {review, []string{
			"Check privately and report only concrete problems", "Findings are review data kept apart from the unit description",
			"Do not demand a universal capstone multiplier, a new subsystem at every purchase or one recipe for every path",
		}},
	} {
		for _, want := range test.want {
			if !strings.Contains(test.prompt, want) {
				t.Errorf("%s prompt lacks %q", name, want)
			}
		}
		for _, banned := range []string{"—", "–"} {
			if strings.Contains(strings.SplitN(test.prompt, "{", 2)[0], banned) {
				t.Errorf("%s instructions use a dash %q", name, banned)
			}
		}
	}
}

// A plan whose fourth or fifth purchase promises one dimension is rejected
// before any mechanics call.
func TestPlansRejectTokenCapstones(t *testing.T) {
	prepared, err := fixture.Prepare()
	if err != nil {
		t.Fatal(err)
	}
	plan := recordedOutput(t, "plan")
	at(plan, "paths", "path3", "milestones", "tier5").(*s.Object).Set("improves", []any{"damage", "active-damage"}).Set("unlock", "none")
	_, err = unit.DecodeDesignPlan(plan, &prepared.Request)
	if err == nil || !strings.Contains(err.Error(), "x-x-5 must promise at least two independent dimensions or an unlock") {
		t.Fatalf("got %v", err)
	}
	fine := recordedOutput(t, "plan")
	if _, err := unit.DecodeDesignPlan(fine, &prepared.Request); err != nil {
		t.Fatalf("the fixture plan was rejected: %v", err)
	}
}

// Every blueprint proposal becomes an explicit unsupported-mechanic finding.
func TestUnsupportedMechanicsAreFindings(t *testing.T) {
	stages, err := fixture.Build()
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, finding := range stages.Checked.Findings {
		if finding.Rule == unit.UnsupportedMechanicRule {
			if finding.Category != "unsupported" || finding.Outcome != "unresolved" {
				t.Errorf("finding %+v", finding)
			}
			names = append(names, finding.Message)
		}
	}
	if len(names) != 3 || !strings.Contains(names[1], "Unsupported mechanic Critical shot counter") {
		t.Errorf("unsupported findings %v", names)
	}
}

// The change budget belongs to the Definition profile: the Default Profile
// allows the five changes of a real Crossbow Master, a Definition that sets
// four rejects them, and no version 2 Definition may exceed the limit.
func TestTheDefinitionProfileSetsTheChangeBudget(t *testing.T) {
	stages, err := fixture.Build()
	if err != nil {
		t.Fatal(err)
	}
	blueprint := *stages.Result.Candidate.Blueprint
	tier := &blueprint.Paths.Path3.Tiers.Tier5
	tier.Changes = append(append([]m.Change(nil), tier.Changes...), m.Change{Kind: "stat", Target: "base", Stat: "range", Operation: "add", Number: 20})
	if len(tier.Changes) != 5 {
		t.Fatalf("x-x-5 has %d changes", len(tier.Changes))
	}
	definition := unit.DefaultAuthoringDefinition()
	if issues := m.ValidateBlueprint(s.FromGoValue(blueprint), s.FromGoValue(definition)); len(issues) > 0 {
		t.Errorf("five changes rejected under the Default Profile: %v", issues)
	}
	definition.Profile.MaxChangesPerTier = 4
	issues := m.ValidateBlueprint(s.FromGoValue(blueprint), s.FromGoValue(definition))
	if len(issues) == 0 || !strings.Contains(fmt.Sprint(issues), "Exceeds the Definition change budget.") {
		t.Errorf("five changes accepted under a four-change Definition: %v", issues)
	}
	definition.Profile.MaxChangesPerTier = m.MaxChangesLimit + 1
	if _, issues := s.Parse(m.DefinitionV2Schema, s.FromGoValue(definition)); len(issues) == 0 {
		t.Error("a Definition exceeded the change limit")
	}
}

// Under the Default Profile the third purchase of every path adds a
// supported behavior or access; larger numbers or a targeting change alone
// are rejected when the plan is authored.
func TestPlansRequireABehaviorAtTheThirdPurchase(t *testing.T) {
	prepared, err := fixture.Prepare()
	if err != nil {
		t.Fatal(err)
	}
	for unlock, rejected := range map[string]bool{"none": true, "targeting-change": true, "splash": false, "damage-type-change": false} {
		plan := recordedOutput(t, "plan")
		at(plan, "paths", "path3", "milestones", "tier3").(*s.Object).Set("improves", []any{"damage", "range"}).Set("unlock", unlock)
		_, err := unit.DecodeDesignPlan(plan, &prepared.Request)
		if got := err != nil && strings.Contains(err.Error(), "x-x-3 must add a supported behavior or access"); got != rejected {
			t.Errorf("unlock %s: %v", unlock, err)
		}
	}
	plan := recordedOutput(t, "plan")
	if request, err := unit.DesignPlanRequest(prepared); err != nil || !strings.Contains(request.Prompt, "This Profile requires the third purchase of every path to add a supported behavior or access") {
		t.Errorf("the plan prompt does not state the requirement: %v", err)
	}
	if _, err := unit.DecodeDesignPlan(plan, &prepared.Request); err != nil {
		t.Fatalf("the fixture plan was rejected: %v", err)
	}
}
