package unit

import (
	"testing"

	"github.com/mardwerk/unit-generator/internal/parity"
	s "github.com/mardwerk/unit-generator/internal/schema"
)

// each runs fn for every recorded call of name, stopping after a few failures.
func each(t *testing.T, name string, fn func(t *testing.T, entry *s.Object)) {
	t.Helper()
	entries, err := parity.Entries(name)
	if err != nil {
		t.Fatal(err)
	}
	failures := 0
	for _, entry := range entries {
		if args, _ := entry.Get("args"); parity.NonFinite(args) {
			continue
		}
		if !t.Run(name, func(t *testing.T) { fn(t, entry) }) {
			failures++
			if failures > 5 {
				t.Fatalf("stopping after %d failing %s cases", failures, name)
			}
		}
	}
}

// requestArg decodes a recorded request argument, skipping unparseable ones.
func requestArg(t *testing.T, entry *s.Object, i int) Request {
	t.Helper()
	var r Request
	if err := s.ToGo(parity.Arg(entry, i), &r); err != nil {
		t.Skipf("request not decodable: %v", err)
	}
	return r
}

func show(value any) string { return s.Stringify(parity.Mark(s.FromGoValue(value))) }
