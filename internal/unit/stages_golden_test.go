package unit

import (
	"context"
	"testing"

	"github.com/mardwerk/unit-generator/internal/golden"
	s "github.com/mardwerk/unit-generator/internal/schema"
)

func maxRepairs(entry *s.Object) Options {
	options := golden.Arg(entry, 2)
	o := Options{}
	if obj, ok := options.(*s.Object); ok {
		if n, ok := obj.Get("maxRepairAttempts"); ok {
			if f, ok := n.(float64); ok {
				v := int(f)
				o.MaxRepairAttempts = &v
			}
		}
	}
	return o
}

func TestDraftUnitGolden(t *testing.T) {
	each(t, "draftUnit", func(t *testing.T, entry *s.Object) {
		if legacyRoute(entry) {
			t.Skip("legacy prose route is retired")
		}
		if recordedCode(entry) == CodeCancelled || recordedName(entry) == "AbortError" {
			t.Skip("cancellation cannot be replayed")
		}
		prepared, err := ParsePrepared(golden.Arg(entry, 0))
		if err != nil {
			t.Skipf("prepared not decodable: %v", err)
		}
		model := newReplay(t, entry)
		got, err := DraftUnit(context.Background(), prepared, model, maxRepairs(entry))
		if model.mismatch != "" {
			t.Fatal(model.mismatch)
		}
		if want, ok := golden.Output(entry); ok {
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !sameArtifact(got, want) {
				t.Errorf("draft differs\n got %s\nwant %s", golden.Canonical(normalize(golden.Mark(s.FromGoValue(got)))), golden.Canonical(normalize(want)))
			}
			return
		}
		compareFailure(t, err, entry)
	})
}

func TestCheckDraftGolden(t *testing.T) {
	each(t, "checkDraft", func(t *testing.T, entry *s.Object) {
		draft, err := ParseDraft(golden.Arg(entry, 0))
		want, ok := golden.Output(entry)
		if err != nil {
			if ok {
				t.Fatalf("draft not decodable: %v", err)
			}
			return
		}
		got, err := CheckDraft(draft)
		if !ok {
			if err == nil {
				t.Errorf("expected failure %s", s.Stringify(golden.ErrorOf(entry)))
			}
			return
		}
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !sameArtifact(got, want) {
			t.Errorf("checked differs\n got %s\nwant %s", golden.Canonical(normalize(s.FromGoValue(got.Findings))), golden.Canonical(normalize(field(want.(*s.Object), "findings"))))
		}
	})
}

func TestReviewDraftGolden(t *testing.T) {
	each(t, "reviewDraft", func(t *testing.T, entry *s.Object) {
		checked, err := ParseChecked(golden.Arg(entry, 0))
		if err != nil {
			t.Skipf("checked not decodable: %v", err)
		}
		if checked.Draft.Candidate.Blueprint == nil {
			t.Skip("legacy prose drafts are not reviewed")
		}
		model := newReplay(t, entry)
		got, err := ReviewDraft(context.Background(), checked, model, Options{})
		if model.mismatch != "" {
			t.Fatal(model.mismatch)
		}
		if want, ok := golden.Output(entry); ok {
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !sameArtifact(got, want) {
				t.Errorf("result differs\n got %s\nwant %s", golden.Canonical(normalize(golden.Mark(s.FromGoValue(got)))), golden.Canonical(normalize(want)))
			}
			return
		}
		compareFailure(t, err, entry)
	})
}
