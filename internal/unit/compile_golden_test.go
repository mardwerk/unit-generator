package unit

import (
	"testing"

	"github.com/mardwerk/unit-generator/internal/golden"
	m "github.com/mardwerk/unit-generator/internal/mechanics"
	s "github.com/mardwerk/unit-generator/internal/schema"
)

func blueprintArg(t *testing.T, entry *s.Object, i int) m.Blueprint {
	t.Helper()
	var b m.Blueprint
	if err := s.ToGo(golden.Arg(entry, i), &b); err != nil {
		t.Skipf("blueprint not decodable: %v", err)
	}
	return b
}

func TestCompileBlueprintGolden(t *testing.T) {
	each(t, "compileBlueprint", func(t *testing.T, entry *s.Object) {
		want, ok := golden.Output(entry)
		got, err := CompileBlueprint(blueprintArg(t, entry, 0), requestArg(t, entry, 1))
		if !ok {
			if err == nil {
				t.Error("expected an error")
			}
			return
		}
		if err != nil {
			t.Fatal(err)
		}
		if !golden.Same(got, want) {
			t.Errorf("got  %s\nwant %s", show(got), s.Stringify(want))
		}
	})
}

func TestSummariesGolden(t *testing.T) {
	each(t, "unitSummary", func(t *testing.T, entry *s.Object) {
		var a m.Attack
		var d m.Definition
		_ = s.ToGo(golden.Arg(entry, 0), &a)
		_ = s.ToGo(golden.Arg(entry, 1), &d)
		want, _ := golden.Output(entry)
		if got := UnitSummary(a, d); got != want {
			t.Errorf("got %q want %q", got, want)
		}
	})
	each(t, "pathSummary", func(t *testing.T, entry *s.Object) {
		var a m.Attack
		var b m.ResolvedBuild
		_ = s.ToGo(golden.Arg(entry, 0), &a)
		_ = s.ToGo(golden.Arg(entry, 1), &b)
		want, _ := golden.Output(entry)
		if got := PathSummary(a, b); got != want {
			t.Errorf("got %q want %q", got, want)
		}
	})
}
