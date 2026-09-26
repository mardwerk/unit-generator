package parity

import (
	"testing"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

// Each runs fn as a subtest for every recorded call of name whose arguments
// JSON can carry, and stops after five failing cases.
func Each(t *testing.T, name string, fn func(t *testing.T, entry *s.Object)) {
	t.Helper()
	entries, err := Entries(name)
	if err != nil {
		t.Fatal(err)
	}
	failures := 0
	for _, entry := range entries {
		if args, _ := entry.Get("args"); NonFinite(args) {
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
