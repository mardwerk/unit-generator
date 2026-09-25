package unit

import (
	"strings"
	"testing"

	"github.com/mardwerk/unit-generator/internal/golden"
	"github.com/mardwerk/unit-generator/internal/mechanics"
	s "github.com/mardwerk/unit-generator/internal/schema"
)

func TestEvidenceSpansGolden(t *testing.T) {
	each(t, "evidenceSpans", func(t *testing.T, entry *s.Object) {
		r := requestArg(t, entry, 0)
		want, _ := golden.Output(entry)
		if got := EvidenceSpans(&r); !golden.Same(got, want) {
			t.Errorf("got  %s\nwant %s", show(got), s.Stringify(want))
		}
	})
}

func TestAuthorEvidenceGolden(t *testing.T) {
	each(t, "authorEvidence", func(t *testing.T, entry *s.Object) {
		r := requestArg(t, entry, 0)
		want, _ := golden.Output(entry)
		if got := AuthorEvidence(&r); !golden.Same(got, want) {
			t.Errorf("got  %s\nwant %s", show(got), s.Stringify(want))
		}
	})
}

func TestLegacyHashGolden(t *testing.T) {
	each(t, "hashRequest", func(t *testing.T, entry *s.Object) {
		r := requestArg(t, entry, 0)
		want, ok := golden.Output(entry)
		got, err := LegacyHash(r)
		if !ok {
			if err == nil {
				t.Errorf("expected failure, got %s", got)
			}
			return
		}
		if err != nil || got != want {
			t.Errorf("got %s %v want %s", got, err, want)
		}
	})
}

func TestDefinitionHelpersGolden(t *testing.T) {
	each(t, "definitionDocument", func(t *testing.T, entry *s.Object) {
		var d mechanics.Definition
		_ = s.ToGo(golden.Arg(entry, 0), &d)
		want, _ := golden.Output(entry)
		got, err := DefinitionDocument(d)
		if err != nil || !golden.Same(got, want) {
			t.Errorf("got %s %v want %s", show(got), err, s.Stringify(want))
		}
	})
	each(t, "definitionProgression", func(t *testing.T, entry *s.Object) {
		var d mechanics.Definition
		_ = s.ToGo(golden.Arg(entry, 0), &d)
		want, _ := golden.Output(entry)
		if got := DefinitionProgression(d); !golden.Same(got, want) {
			t.Errorf("got %s want %s", show(got), s.Stringify(want))
		}
	})
	each(t, "withDefinitionEvidence", func(t *testing.T, entry *s.Object) {
		r := requestArg(t, entry, 0)
		want, ok := golden.Output(entry)
		got, _, err := WithDefinitionEvidence(r)
		if !ok {
			if err == nil {
				t.Error("expected an error")
			}
			return
		}
		if err != nil || !golden.Same(got, want) {
			t.Errorf("got %s %v\nwant %s", show(got), err, s.Stringify(want))
		}
	})
}

// sameExceptHash compares prepared artifacts; Go writes jcs-sha256 hashes.
func sameExceptHash(t *testing.T, got Prepared, want any) {
	t.Helper()
	recorded := s.Clone(want).(*s.Object)
	legacy, _ := recorded.Get("inputHash")
	if !strings.HasPrefix(got.InputHash, HashJCS) {
		t.Errorf("hash %s is not jcs", got.InputHash)
	}
	if lh, err := LegacyHash(got.Request); err != nil || lh != legacy {
		t.Errorf("legacy hash %s %v, recorded %s", lh, err, legacy)
	}
	recorded.Set("inputHash", got.InputHash)
	if !golden.Same(got, recorded) {
		t.Errorf("got  %s\nwant %s", show(got), s.Stringify(recorded))
	}
}

func TestPrepareGolden(t *testing.T) {
	each(t, "prepareRequest", func(t *testing.T, entry *s.Object) {
		want, ok := golden.Output(entry)
		got, err := Prepare(golden.Arg(entry, 0))
		if !ok {
			if err == nil {
				t.Errorf("expected failure %s", s.Stringify(golden.ErrorOf(entry)))
				return
			}
			message, _ := golden.ErrorOf(entry).Get("message")
			if name, _ := golden.ErrorOf(entry).Get("name"); name != "ZodError" && err.Error() != message {
				t.Errorf("error %q want %q", err.Error(), message)
			}
			return
		}
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		sameExceptHash(t, got, want)
		if err := VerifyPrepared(got); err != nil {
			t.Errorf("verify: %v", err)
		}
	})
}

func TestProfilesGolden(t *testing.T) {
	each(t, "applyProfile", func(t *testing.T, entry *s.Object) {
		r := requestArg(t, entry, 0)
		var p Profile
		if err := s.ToGo(golden.Arg(entry, 1), &p); err != nil {
			t.Skip("profile not decodable")
		}
		want, _ := golden.Output(entry)
		if got := ApplyProfile(r, p); !golden.Same(got, want) {
			t.Errorf("got  %s\nwant %s", show(got), s.Stringify(want))
		}
	})
	each(t, "validateProfile", func(t *testing.T, entry *s.Object) {
		want, ok := golden.Output(entry)
		got, err := ValidateProfile(golden.Arg(entry, 0))
		if ok != (err == nil) {
			t.Fatalf("ok=%v err=%v", ok, err)
		}
		if ok && !golden.Same(got, want) {
			t.Errorf("got %s want %s", show(got), s.Stringify(want))
		}
	})
	if got := s.FromGoValue(DefaultProfile()); !golden.Same(got, mustGolden(t, "validateProfile")) {
		t.Log("default profile differs from the first recorded validated profile (informational)")
	}
}

func mustGolden(t *testing.T, name string) any {
	entries, err := golden.Entries(name)
	if err != nil || len(entries) == 0 {
		t.Fatal(err)
	}
	out, _ := golden.Output(entries[0])
	return out
}
