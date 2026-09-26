package mechanics

import (
	"math"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/mardwerk/unit-generator/src/cli/internal/parity"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

// legacyStatus maps a version 1 status stat to its version 2 effect field.
var legacyStatus = map[string][2]string{
	"slowPercent":         {"slow", "magnitude"},
	"slowSeconds":         {"slow", "seconds"},
	"burnDamagePerSecond": {"burn", "magnitude"},
	"burnSeconds":         {"burn", "seconds"},
	"stunSeconds":         {"stun", "seconds"},
}

// upgradeAttack rewrites a version 1 attack value in version 2 form.
func upgradeAttack(value any) any {
	attack, ok := value.(*s.Object)
	if !ok {
		return value
	}
	stats, ok := attack.Get("stats")
	statsObject, isObject := stats.(*s.Object)
	if !ok || !isObject {
		return value
	}
	number := func(key string) float64 {
		v, _ := statsObject.Get(key)
		f, _ := v.(float64)
		return f
	}
	statuses := []any{}
	for _, pair := range [][3]string{{"slow", "slowPercent", "slowSeconds"}, {"burn", "burnDamagePerSecond", "burnSeconds"}} {
		if number(pair[1]) != 0 || number(pair[2]) != 0 {
			statuses = append(statuses, s.NewObject().Set("effect", pair[0]).Set("magnitude", number(pair[1])).Set("seconds", number(pair[2])))
		}
	}
	if number("stunSeconds") != 0 {
		statuses = append(statuses, s.NewObject().Set("effect", "stun").Set("seconds", number("stunSeconds")))
	}
	core := s.NewObject()
	for _, key := range statsObject.Keys() {
		if _, legacy := legacyStatus[key]; !legacy {
			v, _ := statsObject.Get(key)
			core.Set(key, v)
		}
	}
	out := s.NewObject()
	for _, key := range attack.Keys() {
		v, _ := attack.Get(key)
		switch key {
		case "camo":
			detects := []any{}
			if v == true {
				detects = append(detects, "camo")
			}
			out.Set("detects", detects)
		case "stats":
			out.Set("stats", core).Set("statuses", statuses)
		default:
			out.Set(key, v)
		}
	}
	return out
}

// upgradeBlueprint rewrites a version 1 blueprint value in version 2 form.
func upgradeBlueprint(value any) any {
	blueprint, ok := s.Clone(value).(*s.Object)
	if !ok {
		return value
	}
	if base, ok := blueprint.Get("baseAttack"); ok {
		blueprint.Set("baseAttack", upgradeAttack(base))
	}
	paths, _ := blueprint.Get("paths")
	pathObject, _ := paths.(*s.Object)
	if pathObject == nil {
		return blueprint
	}
	for _, pathKey := range pathObject.Keys() {
		path, _ := pathObject.Get(pathKey)
		tiers, _ := path.(*s.Object).Get("tiers")
		tierObject, _ := tiers.(*s.Object)
		if tierObject == nil {
			continue
		}
		for _, tierKey := range tierObject.Keys() {
			tier, _ := tierObject.Get(tierKey)
			changes, _ := tier.(*s.Object).Get("changes")
			list, _ := changes.([]any)
			for i, raw := range list {
				change, ok := raw.(*s.Object)
				if !ok {
					continue
				}
				kind, _ := change.Get("kind")
				stat, _ := change.Get("stat")
				name, _ := stat.(string)
				if field, legacy := legacyStatus[name]; kind == "stat" && legacy {
					operation, _ := change.Get("operation")
					number, _ := change.Get("value")
					list[i] = s.NewObject().Set("kind", "status").Set("target", "base").Set("effect", field[0]).
						Set("field", field[1]).Set("operation", operation).Set("value", number)
				} else if kind == "camo" {
					on, _ := change.Get("value")
					list[i] = s.NewObject().Set("kind", "detection").Set("target", "base").Set("trait", "camo").Set("value", on)
				}
			}
		}
	}
	return blueprint
}

// A version 1 blueprint and its version 2 translation must pass or fail
// validation together and measure the same in every legal build.
func TestVersion2ReproducesVersion1(t *testing.T) {
	entries, err := parity.Entries("validateBlueprint")
	if err != nil {
		t.Fatal(err)
	}
	checked := 0
	for _, entry := range entries {
		input, definitionValue := parity.Restore(parity.Arg(entry, 0)), parity.Arg(entry, 1)
		var legacy Definition
		if err := s.ParseInto(MechanicsDefinitionSchema, definitionValue, &legacy); err != nil {
			continue
		}
		upgraded := UpgradeDefinition(legacy)
		if _, issues := s.Parse(DefinitionV2Schema, s.FromGoValue(upgraded)); len(issues) > 0 {
			t.Fatalf("upgraded Definition is invalid: %v", issues)
		}
		v1Issues := ValidateBlueprint(input, definitionValue)
		v2Input := upgradeBlueprint(input)
		v2Issues := ValidateBlueprint(v2Input, s.FromGoValue(upgraded))
		if (len(v1Issues) == 0) != (len(v2Issues) == 0) {
			t.Errorf("version 1 issues %v, version 2 issues %v", v1Issues, v2Issues)
			continue
		}
		if len(v1Issues) > 0 {
			continue
		}
		var v1, v2 Blueprint
		if err := s.ToGo(input, &v1); err != nil {
			t.Fatal(err)
		}
		if err := s.ToGo(v2Input, &v2); err != nil {
			t.Fatal(err)
		}
		if !v2.BaseAttack.IsV2() || v1.BaseAttack.IsV2() {
			t.Fatal("attack versions were not recognized")
		}
		vocabulary := upgraded.Terms()
		for _, selection := range AllLegalBuilds(legacy) {
			a, b := ResolveUnchecked(&v1, selection), ResolveUnchecked(&v2, selection)
			if got, want := s.Stringify(PurchaseMetricsWith(b, &vocabulary)), s.Stringify(PurchaseMetrics(a)); got != want {
				t.Fatalf("%v metrics: version 2 %s, version 1 %s", selection, got, want)
			}
			// Version 2 sorts statuses by ID; version 1 lists slow, burn, stun.
			want := a.BaseAttack.AppliedStatuses()
			sort.Slice(want, func(i, j int) bool { return want[i].Effect < want[j].Effect })
			if s.Stringify(s.FromGoValue(want)) != s.Stringify(s.FromGoValue(b.BaseAttack.AppliedStatuses())) {
				t.Fatalf("%v statuses differ", selection)
			}
		}
		if got, want := s.Stringify(CompareCapstonePurchasesWith(&v2, &vocabulary)), s.Stringify(CompareCapstonePurchases(&v1)); got != want {
			t.Fatalf("capstones: version 2 %s, version 1 %s", got, want)
		}
		checked++
	}
	if checked < 20 {
		t.Fatalf("only %d valid blueprints compared", checked)
	}
}

// AssessTargetEffects agrees with every recorded AssessTarget call, under
// the version 1 Definition and its version 2 translation.
func TestAssessTargetEffectsReproducesVersion1(t *testing.T) {
	entries, err := parity.Entries("assessTarget")
	if err != nil {
		t.Fatal(err)
	}
	checked := 0
	for _, entry := range entries {
		var attack Attack
		if err := s.ToGo(parity.Arg(entry, 0), &attack); err != nil {
			t.Fatal(err)
		}
		target := parity.Arg(entry, 1).(*s.Object)
		camo, _ := target.Get("camo")
		obstructed, _ := target.Get("obstructed")
		props, _ := target.Get("properties")
		var properties []string
		for _, p := range props.([]any) {
			properties = append(properties, p.(string))
		}
		var legacy Definition
		if err := s.ParseInto(MechanicsDefinitionSchema, parity.Arg(entry, 2), &legacy); err != nil {
			continue
		}
		var hidden []string
		if camo == true {
			hidden = []string{"camo"}
		}
		checked++
		want := AssessTarget(attack, camo == true, obstructed == true, properties, legacy)
		var v2 Attack
		if err := s.ToGo(upgradeAttack(parity.Arg(entry, 0)), &v2); err != nil {
			t.Fatal(err)
		}
		for _, version := range []struct {
			attack     Attack
			definition Definition
		}{{attack, legacy}, {v2, UpgradeDefinition(legacy)}} {
			got := AssessTargetEffects(version.attack, hidden, obstructed == true, properties, version.definition)
			applies := func(effect string) bool { return slices.Contains(got.Statuses, effect) }
			if got.Detected != want.Detected || got.Reachable != want.Reachable || got.CanDamage != want.CanDamage ||
				applies("slow") != want.CanSlow || applies("stun") != want.CanStun {
				t.Errorf("version %s: got %+v, want %+v", version.definition.Version, got, want)
			}
		}
	}
	if checked < 10 {
		t.Fatalf("only %d recorded targets compared", checked)
	}
}

func TestVersion2DefinitionsSerializeWithoutFixedRules(t *testing.T) {
	upgraded := UpgradeDefinition(DefaultDefinition())
	value := s.FromGoValue(upgraded).(*s.Object)
	text := s.Stringify(value)
	rules, _ := value.Get("rules")
	for _, key := range legacyRules {
		if _, kept := rules.(*s.Object).Get(key); kept {
			t.Errorf("version 2 rules keep %s", key)
		}
	}
	var back Definition
	if err := s.ParseInto(DefinitionSchemaOf(s.FromGoValue(upgraded)), s.FromGoValue(upgraded), &back); err != nil {
		t.Fatal(err)
	}
	if s.Stringify(s.FromGoValue(back)) != text || !back.IsV2() {
		t.Errorf("round trip changed the Definition")
	}
	// Version 1 still parses as version 1 and serializes as before.
	legacy := s.FromGoValue(DefaultDefinition())
	if DefinitionSchemaOf(legacy) != MechanicsDefinitionSchema || strings.Contains(s.Stringify(legacy), "vocabulary") {
		t.Error("version 1 changed")
	}
}

func TestVocabularyIssues(t *testing.T) {
	vocabulary := UpgradeDefinition(DefaultDefinition()).Terms()
	if issues := VocabularyIssues(vocabulary); len(issues) > 0 {
		t.Fatalf("default vocabulary: %v", issues)
	}
	broken := vocabulary
	broken.StatusEffects = append([]StatusEffect{}, vocabulary.StatusEffects...)
	broken.StatusEffects = append(broken.StatusEffects,
		StatusEffect{ID: "slow", Name: "Again", Kind: KindCustom, MaxSeconds: 1, Stacking: Stacking{MaxStacks: 1, Refresh: RefreshReset}},
		StatusEffect{ID: "freeze", Name: "Freeze", Kind: KindDisable, Magnitude: &Magnitude{Unit: "percent", Max: 10}, MaxSeconds: 1, Stacking: Stacking{MaxStacks: 1, Refresh: RefreshReset}, Immune: []string{"ghost"}},
		StatusEffect{ID: "poison", Name: "Poison", Aliases: []string{"burn"}, Kind: KindDamageOverTime, Magnitude: &Magnitude{Unit: "hp", Max: 10}, MaxSeconds: 1, Stacking: Stacking{MaxStacks: 1, Refresh: RefreshReset}},
		StatusEffect{ID: "splash", Name: "Splash", Kind: KindCustom, MaxSeconds: 1, Stacking: Stacking{MaxStacks: 1, Refresh: RefreshReset}},
	)
	var messages []string
	for _, issue := range VocabularyIssues(broken) {
		messages = append(messages, issue.Path+": "+issue.Message)
	}
	joined := strings.Join(messages, "\n")
	for _, want := range []string{
		"statusEffects.3.id: The ID slow is already used",
		"statusEffects.4.magnitude: A disable effect has no magnitude",
		"statusEffects.4.immune.0: ghost is not a declared enemy property",
		"statusEffects.5.aliases.0: burn already names the effect burn",
		"statusEffects.5.magnitude.unit: Damage over time is measured in damage/s",
		"statusEffects.6.id: splash is reserved by the Engine",
	} {
		if !strings.Contains(joined, "vocabulary."+want) {
			t.Errorf("missing %q in\n%s", want, joined)
		}
	}
}

func TestSustainedStacking(t *testing.T) {
	five := 5.0
	cap12 := 12.0
	poison := StatusEffect{Kind: KindDamageOverTime, Stacking: Stacking{MaxStacks: 10, Refresh: RefreshIndependent}}
	status := StatusApplication{Magnitude: &five, Seconds: 3}
	for _, test := range []struct {
		name     string
		stacking Stacking
		interval float64
		want     float64
	}{
		{"single stack is magnitude × uptime", Stacking{MaxStacks: 1, Refresh: RefreshReset}, 6, 2.5},
		{"independent stacks are limited by duration over interval", Stacking{MaxStacks: 10, Refresh: RefreshIndependent}, 1, 15},
		{"independent stacks are limited by the stack limit", Stacking{MaxStacks: 2, Refresh: RefreshIndependent}, 1, 10},
		{"resetting stacks reach the limit", Stacking{MaxStacks: 10, Refresh: RefreshReset}, 1, 50},
		{"resetting stacks below full uptime act once", Stacking{MaxStacks: 10, Refresh: RefreshReset}, 6, 2.5},
		{"extending adds duration, not magnitude", Stacking{MaxStacks: 10, Refresh: RefreshExtend}, 1, 5},
		{"the stacked cap bounds the total", Stacking{MaxStacks: 10, Refresh: RefreshReset, MaxMagnitude: &cap12}, 1, 12},
	} {
		poison.Stacking = test.stacking
		if got := Sustained(poison, status, test.interval); math.Abs(got-test.want) > 1e-12 {
			t.Errorf("%s: got %v, want %v", test.name, got, test.want)
		}
	}
}
