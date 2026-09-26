package unit

import (
	"context"
	"testing"

	"github.com/mardwerk/unit-generator/src/cli/internal/parity"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

func maxRepairs(entry *s.Object) Options {
	options := parity.Arg(entry, 2)
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

func TestDraftUnitParity(t *testing.T) {
	each(t, "draftUnit", func(t *testing.T, entry *s.Object) {
		if legacyRoute(entry) {
			t.Skip("legacy prose route is retired")
		}
		if recordedCode(entry) == CodeCancelled || recordedName(entry) == "AbortError" {
			t.Skip("cancellation cannot be replayed")
		}
		prepared, err := ParsePrepared(parity.Arg(entry, 0))
		if err != nil {
			t.Skipf("prepared not decodable: %v", err)
		}
		model := newReplay(t, entry)
		got, err := DraftUnit(context.Background(), prepared, model, maxRepairs(entry))
		if model.mismatch != "" {
			t.Fatal(model.mismatch)
		}
		if want, ok := parity.Output(entry); ok {
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !sameArtifact(got, want) {
				t.Errorf("draft differs\n got %s\nwant %s", parity.Canonical(normalize(parity.Mark(s.FromGoValue(got)))), parity.Canonical(normalize(want)))
			}
			return
		}
		compareFailure(t, err, entry)
	})
}

func TestCheckDraftParity(t *testing.T) {
	each(t, "checkDraft", func(t *testing.T, entry *s.Object) {
		draft, err := ParseDraft(parity.Arg(entry, 0))
		want, ok := parity.Output(entry)
		if err != nil {
			if ok {
				t.Fatalf("draft not decodable: %v", err)
			}
			return
		}
		got, err := CheckDraft(draft)
		if !ok {
			if err == nil {
				t.Errorf("expected failure %s", s.Stringify(parity.ErrorOf(entry)))
			}
			return
		}
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !sameArtifact(got, want) {
			t.Errorf("checked differs\n got %s\nwant %s", parity.Canonical(normalize(s.FromGoValue(got.Findings))), parity.Canonical(normalize(field(want.(*s.Object), "findings"))))
		}
	})
}

func TestReviewDraftParity(t *testing.T) {
	each(t, "reviewDraft", func(t *testing.T, entry *s.Object) {
		checked, err := ParseChecked(parity.Arg(entry, 0))
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
		if want, ok := parity.Output(entry); ok {
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !sameArtifact(got, want) {
				t.Errorf("result differs\n got %s\nwant %s", parity.Canonical(normalize(parity.Mark(s.FromGoValue(got)))), parity.Canonical(normalize(want)))
			}
			return
		}
		compareFailure(t, err, entry)
	})
}
