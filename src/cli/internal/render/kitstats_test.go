package render

import (
	"testing"

	"github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// stackingBlueprint is a version 2 blueprint whose path1 adds poison at
// Tier3 and strengthens it at Tier4, and whose path3 detects Camo at Tier1.
func stackingBlueprint(t *testing.T, definition mechanics.Definition) *mechanics.Blueprint {
	t.Helper()
	change := func(stat string, value float64) any {
		return s.NewObject().Set("kind", "stat").Set("target", "base").Set("stat", stat).Set("operation", "add").Set("value", value)
	}
	status := func(field string, value float64) any {
		return s.NewObject().Set("kind", "status").Set("target", "base").Set("effect", "poison").Set("field", field).Set("operation", "set").Set("value", value)
	}
	camo := s.NewObject().Set("kind", "detection").Set("target", "base").Set("trait", "camo").Set("value", true)
	paths := s.NewObject()
	for index, stat := range []string{"damage", "range", "pierce"} {
		tiers := s.NewObject()
		for tier := 1; tier <= 5; tier++ {
			changes := []any{change(stat, 1)}
			switch {
			case index == 0 && tier == 3:
				changes = append(changes, status("magnitude", 2), status("seconds", 4))
			case index == 0 && tier == 4:
				changes = append(changes, status("magnitude", 3))
			case index == 2 && tier == 1:
				changes = []any{camo}
			}
			tiers.Set("tier"+itoa(tier), s.NewObject().Set("name", "Tier "+itoa(tier)).Set("cost", float64(100*tier)).Set("changes", changes))
		}
		specialization := []string{"direct-damage", "range", "group-damage"}[index]
		paths.Set(mechanics.PathKeys[index], s.NewObject().Set("name", "Path "+itoa(index+1)).Set("specialization", specialization).Set("theme", "Theme").
			Set("rationale", "Rationale").Set("sourceFactIndices", []any{0.0}).Set("tiers", tiers))
	}
	value := s.NewObject().Set("name", "Mira").Set("role", "Role").Set("weakness", "Weakness").
		Set("sourceFacts", []any{s.NewObject().Set("documentId", "source1").Set("quote", "Mira throws sparks.")}).
		Set("constraintCoverage", []any{}).
		Set("baseAttack", s.NewObject().Set("name", "Spark").Set("cost", 250.0).Set("delivery", "projectile").
			Set("damageType", "energy").Set("targeting", "first").Set("detects", []any{}).
			Set("stats", s.NewObject().Set("damage", 1.0).Set("intervalSeconds", 1.0).Set("range", 20.0).
				Set("pierce", 1.0).Set("projectiles", 1.0).Set("splashRadius", 0.0)).
			Set("statuses", []any{s.NewObject().Set("effect", "slow").Set("magnitude", 20.0).Set("seconds", 1.0)})).
		Set("paths", paths).Set("proposals", []any{}).Set("reservedTechniques", []any{})
	var blueprint mechanics.Blueprint
	if err := s.ParseInto(mechanics.BlueprintSchemaV2(definition.Vocabulary), value, &blueprint); err != nil {
		t.Fatal(err)
	}
	return &blueprint
}

func TestVersion2KitStatsUseTheVocabulary(t *testing.T) {
	definition := unit.ExampleStackingProfile().MechanicsDefinition
	candidate := unit.Candidate{Blueprint: stackingBlueprint(t, definition)}
	for index := range mechanics.PathKeys {
		candidate.Paths = append(candidate.Paths, unit.CandidatePath{ID: "path-" + itoa(index+1)})
	}
	stats := Stats(candidate, &definition)
	if stats == nil {
		t.Fatal("no stats")
	}
	if got := s.Stringify(s.FromGoValue(stats.BaseEffects)); got != `[{"key":"status.slow.magnitude","label":"Slow","unit":"percent","kind":"moveSpeed","after":20},{"key":"status.slow.seconds","label":"Slow duration","unit":"s","kind":"moveSpeed","after":1}]` {
		t.Errorf("base effects %s", got)
	}
	for key, want := range map[string]string{
		"path-1:3": `[{"key":"damage","before":3,"after":4,"improvement":true},{"key":"status.poison.magnitude","label":"Poison","unit":"damage/s","kind":"damageOverTime","after":2},{"key":"status.poison.seconds","label":"Poison duration","unit":"s","kind":"damageOverTime","after":4}]`,
		"path-1:4": `[{"key":"damage","before":4,"after":5,"improvement":true},{"key":"status.poison.magnitude","label":"Poison","unit":"damage/s","kind":"damageOverTime","before":2,"after":3,"improvement":true}]`,
		"path-3:1": `[{"key":"detects.camo","label":"Camo detection","kind":"detection","before":"No","after":"Yes"}]`,
	} {
		if got := s.Stringify(s.FromGoValue(stats.Tiers[key].Changes)); got != want {
			t.Errorf("%s\n got %s\nwant %s", key, got, want)
		}
	}
}
