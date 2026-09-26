package render

import (
	"testing"

	"github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	"github.com/mardwerk/unit-generator/src/cli/internal/parity"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// leanRuns reduces recorded stage runs to what StageRun keeps.
func leanRuns(value any) any {
	summary, ok := value.(*s.Object)
	if !ok {
		return value
	}
	stages, _ := summary.Get("stages")
	for _, stage := range stages.([]any) {
		leanStage(stage)
	}
	return summary
}

func leanStage(value any) {
	stage := value.(*s.Object)
	run, _ := stage.Get("run")
	if full, ok := run.(*s.Object); ok {
		lean := s.NewObject()
		id, _ := full.Get("modelId")
		lean.Set("modelId", id)
		if usage, ok := full.Get("usage"); ok {
			lean.Set("usage", usage)
		}
		stage.Set("run", lean)
	}
}

func TestRenderArtifactParity(t *testing.T) {
	parity.Each(t, "renderArtifact", func(t *testing.T, entry *s.Object) {
		details := false
		if options, ok := parity.Arg(entry, 1).(*s.Object); ok {
			if d, ok := options.Get("details"); ok {
				details, _ = d.(bool)
			}
		}
		got, err := Markdown(parity.Arg(entry, 0), details)
		if err != nil {
			t.Fatal(err)
		}
		want, _ := parity.Output(entry)
		if got != want {
			t.Errorf("render differs\n got %q\nwant %q", got, want)
		}
	})
}

func TestReadArtifactViewParity(t *testing.T) {
	parity.Each(t, "readArtifactView", func(t *testing.T, entry *s.Object) {
		got, err := ReadView(parity.Arg(entry, 0))
		if err != nil {
			t.Fatal(err)
		}
		want, _ := parity.Output(entry)
		usage, _ := want.(*s.Object).Get("usage")
		leanRuns(usage)
		if !parity.Same(got, want) {
			t.Errorf("view differs\n got %s\nwant %s", parity.Canonical(s.FromGoValue(got)), parity.Canonical(want))
		}
	})
}

func TestSummarizeUsageParity(t *testing.T) {
	parity.Each(t, "summarizeUsage", func(t *testing.T, entry *s.Object) {
		artifact := parity.Arg(entry, 0)
		kind, _ := artifact.(*s.Object).Get("kind")
		var got UsageSummary
		switch kind {
		case "prepared":
			got = SummarizeUsage(nil, nil)
		case "draft":
			draft, err := unit.ParseDraft(artifact)
			if err != nil {
				t.Fatal(err)
			}
			got = SummarizeUsage(&draft.Run, nil)
		case "checked":
			checked, err := unit.ParseChecked(artifact)
			if err != nil {
				t.Fatal(err)
			}
			got = SummarizeUsage(&checked.Draft.Run, nil)
		case "result":
			result, err := unit.ParseResult(artifact)
			if err != nil {
				t.Fatal(err)
			}
			got = SummarizeUsage(&result.Run.Draft, &result.Run.Review)
		default:
			t.Fatalf("unknown kind %v", kind)
		}
		want, _ := parity.Output(entry)
		if !parity.Same(got, leanRuns(want)) {
			t.Errorf("summary differs\n got %s\nwant %s", parity.Canonical(s.FromGoValue(got)), parity.Canonical(want))
		}
	})
}

func TestUsageSummaryTextParity(t *testing.T) {
	parity.Each(t, "usageSummaryText", func(t *testing.T, entry *s.Object) {
		var summary UsageSummary
		if err := s.ToGo(parity.Arg(entry, 0), &summary); err != nil {
			t.Fatal(err)
		}
		want, _ := parity.Output(entry)
		if got := UsageSummaryText(summary); got != want {
			t.Errorf("got %q want %q", got, want)
		}
	})
}

func TestStageUsageRowsParity(t *testing.T) {
	parity.Each(t, "stageUsageRows", func(t *testing.T, entry *s.Object) {
		var stage StageUsage
		if err := s.ToGo(parity.Arg(entry, 0), &stage); err != nil {
			t.Fatal(err)
		}
		want, _ := parity.Output(entry)
		if got := StageUsageRows(stage); !parity.Same(got, want) {
			t.Errorf("got %s want %s", parity.Canonical(s.FromGoValue(got)), parity.Canonical(want))
		}
	})
}

func TestKitStatsParity(t *testing.T) {
	parity.Each(t, "kitStats", func(t *testing.T, entry *s.Object) {
		want, _ := parity.Output(entry)
		candidate, err := unit.ParseCandidate(parity.Arg(entry, 0))
		if err != nil {
			// An invalid blueprint cannot resolve; both sides have no stats.
			if want != nil {
				t.Fatal(err)
			}
			return
		}
		var definition *mechanics.Definition
		if value := parity.Arg(entry, 1); value != nil && value != s.Missing {
			definition = &mechanics.Definition{}
			if err := s.ToGo(value, definition); err != nil {
				t.Fatal(err)
			}
		}
		got := Stats(candidate, definition)
		if want == nil {
			if got != nil {
				t.Errorf("expected no stats, got %s", parity.Canonical(s.FromGoValue(got)))
			}
			return
		}
		if !parity.Same(got, want) {
			t.Errorf("stats differ\n got %s\nwant %s", parity.Canonical(s.FromGoValue(got)), parity.Canonical(want))
		}
	})
}
