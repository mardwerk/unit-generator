package mechanics

import (
	"testing"

	"github.com/mardwerk/unit-generator/internal/golden"
	s "github.com/mardwerk/unit-generator/internal/schema"
)

func definitionArg(t *testing.T, entry *s.Object, i int) (Definition, any) {
	t.Helper()
	value := golden.Arg(entry, i)
	if value == s.Missing || value == nil {
		d := DefaultDefinition()
		return d, s.FromGoValue(d)
	}
	var d Definition
	_ = s.ToGo(value, &d)
	return d, value
}

func blueprintArg(t *testing.T, entry *s.Object, i int) *Blueprint {
	t.Helper()
	var b Blueprint
	if err := s.ToGo(golden.Restore(golden.Arg(entry, i)), &b); err != nil {
		t.Fatalf("blueprint: %v", err)
	}
	return &b
}

func selectionArg(entry *s.Object, i int) (Selection, bool) {
	list, ok := golden.Arg(entry, i).([]any)
	if !ok || len(list) != 3 {
		return Selection{}, false
	}
	var sel Selection
	for n, v := range list {
		f, ok := v.(float64)
		if !ok || f != float64(int(f)) {
			return Selection{}, false
		}
		sel[n] = int(f)
	}
	return sel, true
}

func each(t *testing.T, name string, fn func(t *testing.T, entry *s.Object)) {
	entries, err := golden.Entries(name)
	if err != nil {
		t.Fatal(err)
	}
	failures := 0
	for _, entry := range entries {
		if args, _ := entry.Get("args"); golden.NonFinite(args) {
			continue
		}
		ok := t.Run(name, func(t *testing.T) { fn(t, entry) })
		if !ok {
			failures++
			if failures > 5 {
				t.Fatalf("stopping after %d failing %s cases", failures, name)
			}
		}
	}
}

func TestAllLegalBuildsGolden(t *testing.T) {
	each(t, "allLegalBuilds", func(t *testing.T, entry *s.Object) {
		d, _ := definitionArg(t, entry, 0)
		want, _ := golden.Output(entry)
		if got := AllLegalBuilds(d); !golden.Same(got, want) {
			t.Errorf("got %s", s.Stringify(s.FromGoValue(got)))
		}
	})
}

func TestSelectionIssuesGolden(t *testing.T) {
	each(t, "selectionIssues", func(t *testing.T, entry *s.Object) {
		sel, ok := selectionArg(entry, 0)
		if !ok {
			t.Skip("non-integer selection")
		}
		d, _ := definitionArg(t, entry, 1)
		want, _ := golden.Output(entry)
		got := SelectionIssues(sel, d)
		if got == nil {
			got = []Issue{}
		}
		if !golden.Same(got, want) {
			t.Errorf("%v got %s want %s", sel, s.Stringify(s.FromGoValue(got)), s.Stringify(want))
		}
	})
}

func TestValidateBlueprintGolden(t *testing.T) {
	each(t, "validateBlueprint", func(t *testing.T, entry *s.Object) {
		_, dv := definitionArg(t, entry, 1)
		want, _ := golden.Output(entry)
		got := ValidateBlueprint(golden.Restore(golden.Arg(entry, 0)), dv)
		if got == nil {
			got = []Issue{}
		}
		if !golden.Same(got, want) {
			t.Errorf("got  %s\nwant %s", s.Stringify(s.FromGoValue(got)), s.Stringify(want))
		}
	})
}

func TestResolveBuildGolden(t *testing.T) {
	each(t, "resolveBuild", func(t *testing.T, entry *s.Object) {
		d, _ := definitionArg(t, entry, 2)
		sel, ok := selectionArg(entry, 1)
		if !ok {
			t.Skip("non-integer selection")
		}
		got, err := ResolveBuild(blueprintArg(t, entry, 0), sel, d)
		if want, ok := golden.Output(entry); ok {
			if err != nil {
				t.Fatalf("unexpected error %v", err)
			}
			if !golden.Same(got, want) {
				t.Errorf("got  %s\nwant %s", s.Stringify(golden.Mark(s.FromGoValue(got))), s.Stringify(want))
			}
			return
		}
		recorded := golden.ErrorOf(entry)
		issues, _ := recorded.Get("issues")
		verr, ok := err.(*ValidationError)
		if !ok {
			t.Fatalf("expected validation error, got %v", err)
		}
		if !golden.Same(verr.Issues, issues) {
			t.Errorf("issues got %s want %s", s.Stringify(s.FromGoValue(verr.Issues)), s.Stringify(issues))
		}
	})
}

func TestDesignPolicyGolden(t *testing.T) {
	each(t, "designPolicyIssues", func(t *testing.T, entry *s.Object) {
		d, _ := definitionArg(t, entry, 1)
		want, _ := golden.Output(entry)
		got := DesignPolicyIssues(blueprintArg(t, entry, 0), d)
		if got == nil {
			got = []Issue{}
		}
		if !golden.Same(got, want) {
			t.Errorf("got  %s\nwant %s", s.Stringify(s.FromGoValue(got)), s.Stringify(want))
		}
	})
}

func TestSpecialtyMetricsGolden(t *testing.T) {
	each(t, "specialtyMetrics", func(t *testing.T, entry *s.Object) {
		var build Build
		if err := s.ToGo(golden.Restore(golden.Arg(entry, 0)), &build); err != nil {
			t.Skip("unreadable build")
		}
		spec, _ := golden.Arg(entry, 1).(string)
		want, _ := golden.Output(entry)
		if got := SpecialtyMetrics(build, spec); !golden.Same(got, want) {
			t.Errorf("got %s want %s", s.Stringify(golden.Mark(got)), s.Stringify(want))
		}
	})
}

func TestCompareCapstonePurchasesGolden(t *testing.T) {
	each(t, "compareCapstonePurchases", func(t *testing.T, entry *s.Object) {
		want, _ := golden.Output(entry)
		if got := CompareCapstonePurchases(blueprintArg(t, entry, 0)); !golden.Same(got, want) {
			t.Errorf("got  %s\nwant %s", s.Stringify(golden.Mark(s.FromGoValue(got))), s.Stringify(want))
		}
	})
}

func TestAssessTargetGolden(t *testing.T) {
	each(t, "assessTarget", func(t *testing.T, entry *s.Object) {
		var attack Attack
		_ = s.ToGo(golden.Arg(entry, 0), &attack)
		target := golden.Arg(entry, 1).(*s.Object)
		camo, _ := target.Get("camo")
		obstructed, _ := target.Get("obstructed")
		props, _ := target.Get("properties")
		var list []string
		for _, p := range props.([]any) {
			list = append(list, p.(string))
		}
		d, _ := definitionArg(t, entry, 2)
		want, _ := golden.Output(entry)
		if got := AssessTarget(attack, camo.(bool), obstructed.(bool), list, d); !golden.Same(got, want) {
			t.Errorf("got %+v want %s", got, s.Stringify(want))
		}
	})
}
