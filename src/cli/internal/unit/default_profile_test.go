package unit_test

import (
	"context"
	"strings"
	"testing"

	"github.com/mardwerk/unit-generator/src/cli/internal/fixture"
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
	if definition.Revision != "2026-09-26-atlas-56.3-v12" || !strings.Contains(definition.Label, "btd6-atlas 56.3") {
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
		}},
		"mechanics": {mechanics, []string{
			"Refer to purchases by build code", "The boost is the only activated ability this Definition expresses",
			"List in unsupportedMechanics", "a fifth purchase that only raises ordinary damage is a token step",
			"No universal capstone multiplier applies", "Role scales from the rules document's btd6-atlas 56.3 references",
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
