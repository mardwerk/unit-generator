package mechanics

import (
	"fmt"
	"math"
	"strings"
	"testing"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

func stat(name, operation string, value float64) Change {
	return Change{Kind: "stat", Target: "base", Stat: name, Operation: operation, Number: value}
}

func tier(name string, cost float64, changes ...Change) Tier {
	return Tier{Name: name, Cost: cost, Changes: changes}
}

// starter is a valid version 1 blueprint: a damage path, a speed path with
// a manual boost and a range path with Camo, slow and a follow-up.
func starter() *Blueprint {
	path := func(name string, tiers ...Tier) Path {
		return Path{Name: name, Theme: name + " theme.", Rationale: name + " rationale.", SourceFactIndices: []int{0},
			Tiers: Tiers{tiers[0], tiers[1], tiers[2], tiers[3], tiers[4]}}
	}
	return &Blueprint{
		Name: "Starter", Role: "Test unit.", Weakness: "Slow base.",
		SourceFacts:        []SourceFact{{DocumentID: "source", Quote: "A quoted source passage."}},
		ConstraintCoverage: []Coverage{},
		BaseAttack: Attack{Name: "Throw", Cost: 200, Delivery: "projectile", DamageType: "sharp", Targeting: "first",
			Stats: AttackStats{Damage: 10, IntervalSeconds: 1, Range: 30, Pierce: 2, Projectiles: 1}},
		Paths: Paths{
			Path1: path("Power",
				tier("Heavier", 100, stat("damage", "add", 2)),
				tier("Sharper", 150, stat("pierce", "add", 1)),
				tier("Hammer", 400, stat("damage", "set", 20), stat("pierce", "add", 2)),
				tier("Crusher", 1500, stat("damage", "multiply", 2), stat("splashRadius", "add", 5)),
				tier("Titan", 12000, stat("damage", "multiply", 1.5), stat("pierce", "add", 6)),
			),
			Path2: path("Speed",
				tier("Quick", 100, stat("intervalSeconds", "multiply", 0.8)),
				tier("Quicker", 150, stat("intervalSeconds", "multiply", 0.8)),
				tier("Volley", 500, stat("projectiles", "add", 2)),
				tier("Frenzy", 4000, Change{Kind: "unlockBoost", Target: "base", Boost: &Boost{Name: "Frenzy", DurationSeconds: 8, CooldownSeconds: 40, DamageMultiplier: 3, IntervalMultiplier: 0.5, RangeBonus: 0}}),
				tier("Endless Frenzy", 30000, Change{Kind: "modifyBoost", Target: "base", Stat: "durationSeconds", Operation: "add", Number: 4}, stat("intervalSeconds", "multiply", 0.8)),
			),
			Path3: path("Reach",
				tier("Longer", 90, stat("range", "add", 8)),
				tier("Eyes", 200, Change{Kind: "camo", Target: "base", Bool: true}),
				tier("Frost", 600, stat("slowPercent", "set", 30), stat("slowSeconds", "set", 2)),
				tier("Chain", 2000, Change{Kind: "followUp", Target: "base", FollowUp: &FollowUp{Name: "Chain", Count: 3, DamageMultiplier: 0.5, Radius: 12, InheritStatuses: true}}),
				tier("Storm", 20000, stat("range", "add", 20), stat("slowSeconds", "add", 1)),
			),
		},
		Proposals:          []Proposal{},
		ReservedTechniques: []Proposal{},
	}
}

func extended() Definition {
	d := DefaultDefinition()
	extensions := []string{"distinct-volley", "volley-follow-up"}
	d.Rules.AttackExtensions = &extensions
	return d
}

func label(selection Selection) string {
	return fmt.Sprintf("%d-%d-%d", selection[0], selection[1], selection[2])
}

func TestLegalBuildsFollowTheCrosspathRule(t *testing.T) {
	builds := AllLegalBuilds(DefaultDefinition())
	if len(builds) != 64 {
		t.Fatalf("%d legal builds, want 64", len(builds))
	}
	legal := map[string]bool{}
	for _, build := range builds {
		legal[label(build)] = true
	}
	for _, want := range []string{"0-0-0", "2-2-0", "3-2-0", "5-0-2", "0-5-1", "1-0-5"} {
		if !legal[want] {
			t.Errorf("%s should be legal", want)
		}
	}
	for _, illegal := range []Selection{{3, 3, 0}, {1, 1, 1}, {3, 2, 1}, {5, 5, 0}, {6, 0, 0}} {
		if legal[label(illegal)] {
			t.Errorf("%s should be illegal", label(illegal))
		}
		if len(SelectionIssues(illegal, DefaultDefinition())) == 0 {
			t.Errorf("%s has no selection issue", label(illegal))
		}
	}
}

func TestStarterIsValid(t *testing.T) {
	if issues := ValidateTyped(starter(), extended()); len(issues) > 0 {
		t.Fatalf("issues: %v", issues)
	}
}

// Setters replace the baseline only; purchased additions and multipliers
// from both paths still apply, in canonical tier-then-path order.
func TestCrosspathArithmetic(t *testing.T) {
	blueprint := starter()
	build, err := ResolveBuild(blueprint, Selection{4, 2, 0}, extended())
	if err != nil {
		t.Fatal(err)
	}
	// (set 20 + add 2) × 2 = 44 damage; the secondary path's intervals stay.
	if got := build.BaseAttack.Stats.Damage; got != 44 {
		t.Errorf("damage %v, want 44", got)
	}
	if got := build.BaseAttack.Stats.IntervalSeconds; math.Abs(got-0.64) > 1e-12 {
		t.Errorf("interval %v", got)
	}
	if got := build.CumulativeCost; got != 200+100+150+400+1500+100+150 {
		t.Errorf("cost %v", got)
	}
	var order []string
	for _, delta := range build.TierDeltas {
		order = append(order, fmt.Sprintf("%s.%d", delta.Path, delta.Tier))
	}
	if strings.Join(order, " ") != "path1.1 path2.1 path1.2 path2.2 path1.3 path1.4" {
		t.Errorf("purchase order %v", order)
	}
	// The x-4-x boost multiplies the fully purchased attack, crosspath included.
	boosted, err := ResolveBuild(blueprint, Selection{2, 4, 0}, extended())
	if err != nil {
		t.Fatal(err)
	}
	ability := boosted.Abilities[0]
	if ability.Path != "path2" || ability.BoostedAttack.Stats.Damage != 36 || ability.BoostedAttack.Stats.Pierce != 3 {
		t.Errorf("boosted attack %+v", ability.BoostedAttack.Stats)
	}
	// Camo and slow from the bottom path reach a top-path T5.
	full := ResolveUnchecked(blueprint, Selection{5, 0, 2})
	if !full.BaseAttack.Camo || full.BaseAttack.Stats.Range != 38 || full.BaseAttack.Stats.Damage != 66 {
		t.Errorf("5-0-2 attack %+v camo %v", full.BaseAttack.Stats, full.BaseAttack.Camo)
	}
	if _, err := ResolveBuild(blueprint, Selection{3, 3, 0}, extended()); err == nil {
		t.Error("an illegal build resolved")
	}
}

func TestValidationRejectsInvalidPurchases(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*Blueprint)
		want   string
	}{
		{"no-op upgrade", func(b *Blueprint) { b.Paths.Path1.Tiers.Tier2.Changes = []Change{stat("damage", "add", 0)} }, "changes no behavior"},
		{"downgrade", func(b *Blueprint) { b.Paths.Path1.Tiers.Tier2.Changes = []Change{stat("range", "add", -5)} }, "only reduces or preserves"},
		{"fractional count", func(b *Blueprint) { b.Paths.Path2.Tiers.Tier3.Changes = []Change{stat("projectiles", "multiply", 1.5)} }, "Resolved projectiles is 1.5"},
		{"boost too early", func(b *Blueprint) { b.Paths.Path2.Tiers.Tier3.Changes = b.Paths.Path2.Tiers.Tier4.Changes }, "only unlock at tier 4"},
		{"boost modified early", func(b *Blueprint) {
			b.Paths.Path2.Tiers.Tier4.Changes = append(b.Paths.Path2.Tiers.Tier4.Changes, Change{Kind: "modifyBoost", Target: "base", Stat: "cooldownSeconds", Operation: "add", Number: -5})
		}, "only be modified at tier 5"},
		{"splash on one target", func(b *Blueprint) {
			b.BaseAttack.Stats.Pierce = 1
			b.Paths.Path1.Tiers.Tier2.Changes = []Change{stat("damage", "add", 1)}
			b.Paths.Path1.Tiers.Tier3.Changes = []Change{stat("damage", "set", 20)}
		}, "Splash requires pierce of at least 2"},
		{"too many early capabilities", func(b *Blueprint) {
			b.Paths.Path3.Tiers.Tier2.Changes = []Change{{Kind: "camo", Target: "base", Bool: true}, stat("stunSeconds", "add", 1)}
		}, "Early tiers may add at most 1 capability group"},
		{"duration above cooldown", func(b *Blueprint) {
			b.Paths.Path2.Tiers.Tier5.Changes = []Change{{Kind: "modifyBoost", Target: "base", Stat: "durationSeconds", Operation: "add", Number: 40}}
		}, "Duration may not exceed cooldown"},
	} {
		blueprint := starter()
		test.change(blueprint)
		var messages []string
		for _, issue := range ValidateTyped(blueprint, extended()) {
			messages = append(messages, issue.Path+": "+issue.Message)
		}
		if joined := strings.Join(messages, "\n"); !strings.Contains(joined, test.want) {
			t.Errorf("%s: want %q in\n%s", test.name, test.want, joined)
		}
	}
}

func TestDesignPolicyGates(t *testing.T) {
	definition := extended()
	no := false
	definition.Profile.DesignPolicy = &DesignPolicy{
		Version: "1", DistinctFirstUpgrades: true, DistinctCapstones: true, PreserveEarlyAttackIdentity: &no,
		MaxManualAbilityPaths: 1, ManualAbilityPath: NullableString{Present: true, Value: "path2"},
		Tier5Uniqueness: "one-per-player-unit-type-and-path",
	}
	blueprint := starter()
	for i, specialization := range []string{"direct-damage", "ability-burst", "range"} {
		blueprint.Paths.At(i).Specialization = specialization
	}
	if issues := ValidateTyped(blueprint, definition); len(issues) > 0 {
		t.Fatalf("issues: %v", issues)
	}
	same := starter()
	for i, specialization := range []string{"direct-damage", "ability-burst", "range"} {
		same.Paths.At(i).Specialization = specialization
	}
	same.Paths.Path3.Tiers.Tier1.Changes = []Change{stat("damage", "add", 2)}
	moved := starter()
	for i, specialization := range []string{"direct-damage", "ability-burst", "range"} {
		moved.Paths.At(i).Specialization = specialization
	}
	moved.Paths.Path1.Tiers.Tier4.Changes = moved.Paths.Path2.Tiers.Tier4.Changes
	for name, test := range map[string]struct {
		blueprint *Blueprint
		want      string
	}{
		"duplicate first upgrades": {same, "Resolved tier 1 behavior duplicates path1"},
		"manual ability off path2": {moved, "permits a manual ability only on path2"},
	} {
		var messages []string
		for _, issue := range ValidateTyped(test.blueprint, definition) {
			messages = append(messages, issue.Message)
		}
		if joined := strings.Join(messages, "\n"); !strings.Contains(joined, test.want) {
			t.Errorf("%s: want %q in\n%s", name, test.want, joined)
		}
	}
	multiplier := 3.0
	definition.Profile.DesignPolicy.MinTier5SpecialtyMultiplier = &multiplier
	var messages []string
	for _, issue := range ValidateTyped(blueprint, definition) {
		messages = append(messages, issue.Path+": "+issue.Message)
	}
	if joined := strings.Join(messages, "\n"); !strings.Contains(joined, "paths.path1.tiers.tier5: Tier 5 must improve an established direct-damage specialty metric by at least 3x") {
		t.Errorf("the optional multiplier gate did not apply:\n%s", joined)
	}
}

// The capstone comparison counts pure T4 copies at the T5 budget and keeps
// per-copy metrics that do not add across copies.
func TestCapstoneComparison(t *testing.T) {
	comparisons := CompareCapstonePurchases(starter())
	first := s.FromGoValue(comparisons[0]).(*s.Object)
	count, _ := first.Get("tier4CopiesAtTier5Budget")
	tier4Total := 200.0 + 100 + 150 + 400 + 1500
	if want := float64(int((tier4Total + 12000) / tier4Total)); count != want {
		t.Errorf("copies %v, want %v", count, want)
	}
}

// The illustrative Tatsuya candidate's crosspath arithmetic resolves exactly:
// a middle x-3-x setter replaces the ordinary attack's baseline while the top
// path's purchased multipliers still apply, so the 1-3-0 sniper strike deals
// 400 × 1.35 = 540 and the 2-3-0 interval is 3.5 × 2/3. Only the expressible
// parts are encoded; magazines, acquisition and the Actives are gaps.
func TestSetterKeepsCrosspathMultipliers(t *testing.T) {
	blueprint := starter()
	blueprint.BaseAttack.Delivery, blueprint.BaseAttack.DamageType = "instant", "normal"
	blueprint.BaseAttack.Stats = AttackStats{Damage: 100, IntervalSeconds: 1.5, Range: 20, Pierce: 1, Projectiles: 1}
	blueprint.Paths.Path1.Tiers.Tier1.Changes = []Change{stat("damage", "multiply", 1.35)}
	blueprint.Paths.Path1.Tiers.Tier2.Changes = []Change{stat("intervalSeconds", "multiply", 2.0/3)}
	blueprint.Paths.Path2.Tiers.Tier1.Changes = []Change{stat("range", "add", 6)}
	blueprint.Paths.Path2.Tiers.Tier2.Changes = []Change{{Kind: "camo", Target: "base", Bool: true}}
	// x-3-x sets the baseline to 39 so that x-1-x's +6 gives the sniper's 45.
	blueprint.Paths.Path2.Tiers.Tier3.Changes = []Change{stat("damage", "set", 400), stat("intervalSeconds", "set", 3.5), stat("range", "set", 39)}
	for _, test := range []struct {
		selection Selection
		damage    float64
		interval  float64
		rng       float64
	}{
		{Selection{1, 0, 0}, 135, 1.5, 20},
		{Selection{2, 0, 0}, 135, 1, 20},
		{Selection{0, 3, 0}, 400, 3.5, 45},
		{Selection{1, 3, 0}, 540, 3.5, 45},
		{Selection{2, 3, 0}, 540, 3.5 * 2 / 3, 45},
	} {
		attack := ResolveUnchecked(blueprint, test.selection).BaseAttack.Stats
		if math.Abs(attack.Damage-test.damage) > 1e-9 || math.Abs(attack.IntervalSeconds-test.interval) > 1e-9 || attack.Range != test.rng {
			t.Errorf("%s: damage %v interval %v range %v", label(test.selection), attack.Damage, attack.IntervalSeconds, attack.Range)
		}
	}
}

// A new damage type or detected trait is new access, which counts as a
// behavior transition; a larger number alone does not.
func TestAccessChangesAreBehaviorTransitions(t *testing.T) {
	base := Build{BaseAttack: Attack{Delivery: "projectile", DamageType: "sharp", Targeting: "first", Stats: AttackStats{Damage: 1, IntervalSeconds: 1, Range: 10, Pierce: 1, Projectiles: 1}}}
	for name, change := range map[string]func(*Attack){
		"damage type": func(a *Attack) { a.DamageType = "normal" },
		"camo":        func(a *Attack) { a.Camo = true },
		"splash":      func(a *Attack) { a.Stats.SplashRadius = 5 },
	} {
		after := Build{BaseAttack: base.BaseAttack.Clone()}
		change(&after.BaseAttack)
		if !HasBehaviorTransition(base, after) {
			t.Errorf("%s is not a behavior transition", name)
		}
	}
	after := Build{BaseAttack: base.BaseAttack.Clone()}
	after.BaseAttack.Stats.Damage = 5
	if HasBehaviorTransition(base, after) {
		t.Error("more damage counted as a behavior transition")
	}
}
