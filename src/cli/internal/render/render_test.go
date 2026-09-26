package render_test

import (
	"strings"
	"testing"

	"github.com/mardwerk/unit-generator/src/cli/internal/fixture"
	"github.com/mardwerk/unit-generator/src/cli/internal/render"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

func TestMarkdownRendersEveryStage(t *testing.T) {
	stages, err := fixture.Build()
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name     string
		artifact any
		status   string
	}{
		{"draft", s.FromGoValue(stages.Draft), "Draft with checked upgrade mechanics"},
		{"checked", s.FromGoValue(stages.Checked), "Structural checks complete. Model review has not run."},
		{"result", s.FromGoValue(stages.Result), "Structural checks and model review complete."},
	} {
		compact, err := render.Markdown(test.artifact, false)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(compact, "# Dart Monkey\n") || !strings.Contains(compact, test.status) {
			t.Errorf("%s compact render:\n%s", test.name, compact)
		}
		for _, name := range []string{"Juggernaut Line", "Fan Club Line", "Crossbow Line", "Ultra-Juggernaut"} {
			if !strings.Contains(compact, name) {
				t.Errorf("%s render lacks %s", test.name, name)
			}
		}
		detailed, err := render.Markdown(test.artifact, true)
		if err != nil {
			t.Fatal(err)
		}
		for _, section := range []string{"## Evidence", "## Purchase evidence", "## Generation usage", "dart-monkey-atlas-56-3"} {
			if !strings.Contains(detailed, section) {
				t.Errorf("%s details lack %q", test.name, section)
			}
		}
	}
	if _, err := render.Markdown(s.FromGoValue(stages.Prepared), false); err == nil {
		t.Error("a prepared request rendered as a unit")
	}
}

func TestViewCarriesStatsForEveryTier(t *testing.T) {
	stages, err := fixture.Build()
	if err != nil {
		t.Fatal(err)
	}
	view, err := render.ReadView(s.FromGoValue(stages.Result))
	if err != nil || view.Kind != "result" {
		t.Fatalf("view %s: %v", view.Kind, err)
	}
	stats := render.Stats(view.Candidate, view.Prepared.Request.MechanicsDefinition)
	if stats == nil {
		t.Fatal("no stats")
	}
	for _, path := range []string{"path-1", "path-2", "path-3"} {
		for tier := 1; tier <= 5; tier++ {
			if _, ok := stats.Tiers[render.TierKey(path, tier)]; !ok {
				t.Errorf("no stats for %s tier %d", path, tier)
			}
		}
	}
	if text := render.UsageSummaryText(view.Usage); text == "" {
		t.Error("no usage summary")
	}
}
