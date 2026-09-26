package unit

import (
	"testing"

	m "github.com/mardwerk/unit-generator/internal/mechanics"
	"github.com/mardwerk/unit-generator/internal/parity"
	s "github.com/mardwerk/unit-generator/internal/schema"
)

func init() {
	contextSchemas["modelOutput"] = func(context any) (s.Schema, error) {
		var r Request
		if err := s.ToGo(context, &r); err != nil {
			return nil, err
		}
		return ModelOutputSchema(&r)
	}
	contextSchemas["purchasePlanOutput"] = func(context any) (s.Schema, error) {
		var r Request
		if err := s.ToGo(context, &r); err != nil {
			return nil, err
		}
		return PurchasePlanOutputSchema(&r), nil
	}
}

func sameRequest(t *testing.T, got ModelRequest, want any) {
	t.Helper()
	w := want.(*s.Object)
	if got.System != field(w, "system") {
		t.Errorf("system differs")
	}
	if prompt := field(w, "prompt").(string); got.Prompt != prompt {
		at := firstDiff(got.Prompt, prompt)
		t.Errorf("prompt differs at %d:\n got %s\nwant %s", at, excerpt(got.Prompt, at), excerpt(prompt, at))
	}
	if got, want := s.Canonical(got.Schema), s.Canonical(field(w, "schema")); got != want {
		at := firstDiff(got, want)
		t.Errorf("schema differs at %d:\n got %s\nwant %s", at, excerpt(got, at), excerpt(want, at))
	}
}

func issuesOf(err error) any {
	if e, ok := err.(*s.Error); ok {
		out := []any{}
		for _, issue := range e.Issues {
			out = append(out, issue.PathString()+": "+issue.Message)
		}
		return out
	}
	return nil
}

func recordedIssues(entry *s.Object) any {
	e := parity.ErrorOf(entry)
	if e == nil {
		return nil
	}
	message, _ := e.Get("message")
	// A ZodError message is the JSON issue list.
	list, err := s.Decode([]byte(message.(string)))
	if _, isList := list.([]any); err != nil || !isList {
		return message
	}
	out := []any{}
	for _, item := range list.([]any) {
		issue := item.(*s.Object)
		path, _ := issue.Get("path")
		text, _ := issue.Get("message")
		out = append(out, s.Issue{Path: pathOf(path)}.PathString()+": "+text.(string))
	}
	return out
}

func pathOf(value any) []any {
	var out []any
	for _, p := range value.([]any) {
		if f, ok := p.(float64); ok {
			out = append(out, int(f))
		} else {
			out = append(out, p)
		}
	}
	return out
}

func compareErr(t *testing.T, err error, entry *s.Object) {
	t.Helper()
	want := recordedIssues(entry)
	if err == nil {
		t.Fatalf("expected failure %s", s.Stringify(want))
	}
	got := issuesOf(err)
	if got == nil {
		got = err.Error()
	}
	if s.Stringify(got) != s.Stringify(want) {
		t.Errorf("error got %s\nwant %s", s.Stringify(got), s.Stringify(want))
	}
}

func TestPlanningParity(t *testing.T) {
	each(t, "designPlanRequest", func(t *testing.T, entry *s.Object) {
		prepared, err := ParsePrepared(parity.Arg(entry, 0))
		if err != nil {
			t.Skip(err)
		}
		got, err := DesignPlanRequest(prepared)
		if want, ok := parity.Output(entry); ok {
			if err != nil {
				t.Fatal(err)
			}
			sameRequest(t, got, want)
		} else {
			compareErr(t, err, entry)
		}
	})
	each(t, "decodeDesignPlan", func(t *testing.T, entry *s.Object) {
		r := requestArg(t, entry, 1)
		got, err := DecodeDesignPlan(parity.Arg(entry, 0), &r)
		if want, ok := parity.Output(entry); ok {
			if err != nil {
				t.Fatal(err)
			}
			if !parity.Same(got, want) {
				t.Errorf("got %s\nwant %s", show(got), s.Stringify(want))
			}
		} else {
			compareErr(t, err, entry)
		}
	})
	each(t, "expandPurchasePlan", func(t *testing.T, entry *s.Object) {
		got, err := ExpandPurchasePlan(parity.Arg(entry, 0))
		if want, ok := parity.Output(entry); ok {
			if err != nil || !parity.Same(got, want) {
				t.Errorf("got %s %v\nwant %s", show(got), err, s.Stringify(want))
			}
		} else {
			compareErr(t, err, entry)
		}
	})
	each(t, "bindDesignPlan", func(t *testing.T, entry *s.Object) {
		var plan DesignPlan
		if err := s.ToGo(parity.Arg(entry, 1), &plan); err != nil {
			t.Skip(err)
		}
		want, _ := parity.Output(entry)
		if got := BindDesignPlan(parity.Arg(entry, 0), plan); !parity.Same(got, want) {
			t.Errorf("got %s\nwant %s", show(got), s.Stringify(want))
		}
	})
	each(t, "mechanicsPlan", func(t *testing.T, entry *s.Object) {
		var plan DesignPlan
		_ = s.ToGo(parity.Arg(entry, 0), &plan)
		want, _ := parity.Output(entry)
		if got := MechanicsPlan(plan); s.Stringify(got) != s.Stringify(want) {
			t.Errorf("got %s\nwant %s", s.Stringify(got), s.Stringify(want))
		}
	})
	each(t, "planFeasibilityIssues", func(t *testing.T, entry *s.Object) {
		var plan DesignPlan
		var d m.Definition
		if err := s.ToGo(parity.Arg(entry, 0), &plan); err != nil {
			t.Skip(err)
		}
		_ = s.ToGo(parity.Arg(entry, 1), &d)
		want, _ := parity.Output(entry)
		got := PlanFeasibilityIssues(plan, d)
		if got == nil {
			got = []m.Issue{}
		}
		if !parity.Same(got, want) {
			t.Errorf("got %s\nwant %s", show(got), s.Stringify(want))
		}
	})
	each(t, "designGuidance", func(t *testing.T, entry *s.Object) {
		r := requestArg(t, entry, 0)
		want, _ := parity.Output(entry)
		got := DesignGuidance(&r)
		if got == nil {
			got = []string{}
		}
		if !parity.Same(got, want) {
			t.Errorf("got %s\nwant %s", show(got), s.Stringify(want))
		}
	})
}

func TestMechanicsOutputParity(t *testing.T) {
	each(t, "modelOutputJsonSchema", func(t *testing.T, entry *s.Object) {
		r := requestArg(t, entry, 0)
		got, err := ModelOutputJSONSchema(&r)
		if want, ok := parity.Output(entry); ok {
			if err != nil || s.Canonical(got) != s.Canonical(want) {
				t.Errorf("got %s %v\nwant %s", s.Canonical(got), err, s.Canonical(want))
			}
		} else {
			compareErr(t, err, entry)
		}
	})
	each(t, "tierEffectLimit", func(t *testing.T, entry *s.Object) {
		r := requestArg(t, entry, 0)
		want, _ := parity.Output(entry)
		if got := TierEffectLimit(&r, parity.Arg(entry, 1).(string)); float64(got) != want {
			t.Errorf("got %d want %v", got, want)
		}
	})
	each(t, "decodeBlueprintOutput", func(t *testing.T, entry *s.Object) {
		r := requestArg(t, entry, 1)
		got, err := DecodeBlueprintOutput(parity.Arg(entry, 0), &r)
		if want, ok := parity.Output(entry); ok {
			if err != nil || !parity.Same(got, want) {
				t.Errorf("got %s %v\nwant %s", show(got), err, s.Stringify(want))
			}
		} else {
			compareErr(t, err, entry)
		}
	})
	each(t, "decodeBlueprintOutputForDiagnostics", func(t *testing.T, entry *s.Object) {
		r := requestArg(t, entry, 1)
		blueprint, budget, err := DecodeForDiagnostics(parity.Arg(entry, 0), &r)
		if want, ok := parity.Output(entry); ok {
			if err != nil {
				t.Fatal(err)
			}
			wantObj := want.(*s.Object)
			if !parity.Same(blueprint, field(wantObj, "blueprint")) {
				t.Errorf("blueprint got %s\nwant %s", show(blueprint), s.Stringify(field(wantObj, "blueprint")))
			}
			var gotBudget []any
			for _, issue := range budget {
				gotBudget = append(gotBudget, s.NewObject().Set("code", issue.Code).Set("path", s.FromGoValue(issue.Path)).Set("message", issue.Message))
			}
			if gotBudget == nil {
				gotBudget = []any{}
			}
			if !parity.Same(gotBudget, field(wantObj, "budgetIssues")) {
				t.Errorf("budget got %s\nwant %s", s.Stringify(gotBudget), s.Stringify(field(wantObj, "budgetIssues")))
			}
		} else {
			compareErr(t, err, entry)
		}
	})
	each(t, "validateBlueprintRequest", func(t *testing.T, entry *s.Object) {
		b := blueprintArg(t, entry, 0)
		r := requestArg(t, entry, 1)
		want, _ := parity.Output(entry)
		got := ValidateBlueprintRequest(b, r)
		if got == nil {
			got = []m.Issue{}
		}
		if !parity.Same(got, want) {
			t.Errorf("got %s\nwant %s", show(got), s.Stringify(want))
		}
	})
	each(t, "planIntentIssues", func(t *testing.T, entry *s.Object) {
		b := blueprintArg(t, entry, 0)
		var plan DesignPlan
		plan.UpgradeIntents = nil
		if intents, ok := parity.Arg(entry, 1).(*s.Object).Get("upgradeIntents"); ok {
			var u UpgradeIntents
			_ = s.ToGo(intents, &u)
			plan.UpgradeIntents = &u
		}
		var d m.Definition
		_ = s.ToGo(parity.Arg(entry, 2), &d)
		want, _ := parity.Output(entry)
		got := PlanIntentIssues(b, plan.UpgradeIntents, d)
		if got == nil {
			got = []m.Issue{}
		}
		if !parity.Same(got, want) {
			t.Errorf("got %s\nwant %s", show(got), s.Stringify(want))
		}
	})
	each(t, "evaluateUnitDesign", func(t *testing.T, entry *s.Object) {
		b := blueprintArg(t, entry, 0)
		var plan *DesignPlan
		if value := parity.Arg(entry, 1); value != nil && value != s.Missing {
			plan = &DesignPlan{}
			if err := s.ToGo(value, plan); err != nil {
				t.Skip(err)
			}
		}
		var d m.Definition
		_ = s.ToGo(parity.Arg(entry, 2), &d)
		want, ok := parity.Output(entry)
		got, err := EvaluateUnitDesign(b, plan, d)
		if !ok {
			compareErr(t, err, entry)
			return
		}
		if err != nil {
			t.Fatalf("error: %v", err)
		}
		if !parity.Same(got, want) {
			t.Errorf("got %s %v\nwant %s", show(got), err, s.Stringify(want))
		}
	})
}

func TestRepairParity(t *testing.T) {
	each(t, "targetedTierRepair", func(t *testing.T, entry *s.Object) {
		if !prepared(parity.Arg(entry, 0)) {
			t.Skip("request was never prepared; its key order is JavaScript insertion order")
		}
		r := requestArg(t, entry, 0)
		var issues []string
		for _, item := range parity.Arg(entry, 2).([]any) {
			issues = append(issues, item.(string))
		}
		got, err := TargetedTierRepair(&r, parity.Arg(entry, 1), issues)
		if err != nil {
			t.Fatal(err)
		}
		want, _ := parity.Output(entry)
		if want == nil {
			if got != nil {
				t.Error("expected no targeted repair")
			}
			return
		}
		if got == nil {
			t.Fatal("expected a targeted repair")
		}
		sameRequest(t, got.Request, field(want.(*s.Object), "request"))
	})
	each(t, "capstoneRepairContext", func(t *testing.T, entry *s.Object) {
		b := blueprintArg(t, entry, 0)
		r := requestArg(t, entry, 1)
		want, _ := parity.Output(entry)
		if got := CapstoneRepairContext(b, &r); !parity.Same(got, want) {
			t.Errorf("got %s\nwant %s", show(got), s.Stringify(want))
		}
	})
	each(t, "wireRepairContext", func(t *testing.T, entry *s.Object) {
		r := requestArg(t, entry, 1)
		want, _ := parity.Output(entry)
		if got := WireRepairContext(parity.Arg(entry, 0), &r); !parity.Same(got, want) {
			t.Errorf("got %s\nwant %s", show(got), s.Stringify(want))
		}
	})
}

func TestReviewRequestParity(t *testing.T) {
	each(t, "blueprintReviewRequest", func(t *testing.T, entry *s.Object) {
		checked, err := ParseChecked(parity.Arg(entry, 0))
		if err != nil {
			t.Skip(err)
		}
		want, _ := parity.Output(entry)
		sameRequest(t, BlueprintReviewRequest(checked), want)
	})
}

// prepared reports whether a recorded request is in schema order, as every
// prepared request is. Unit tests sometimes passed hand-built requests.
func prepared(value any) bool {
	out, issues := s.Parse(RequestSchema, value)
	return len(issues) == 0 && s.Stringify(out) == s.Stringify(value)
}
