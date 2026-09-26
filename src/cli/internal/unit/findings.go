package unit

import (
	"fmt"
	"strings"
)

// checkFinding is what a rule reports; the coordinator adds ID and severity.
type checkFinding struct {
	Category string
	Outcome  string
	Subject  string
	Rule     string
	Message  string
	Action   *string
	Evidence []string
}

type reporter func(checkFinding)

func severity(outcome string) string {
	switch outcome {
	case "fail":
		return "error"
	case "unresolved":
		return "warning"
	}
	return "info"
}

func act(text string) *string { return &text }

// checkUnique reports duplicate identifiers, listing each once in first-seen order.
func checkUnique[T comparable](report reporter, ids []T, subject string) {
	seen := map[T]int{}
	for _, id := range ids {
		seen[id]++
	}
	var duplicates []string
	listed := map[T]bool{}
	for i, id := range ids {
		first := true
		for _, earlier := range ids[:i] {
			if earlier == id {
				first = false
				break
			}
		}
		if !first && !listed[id] {
			listed[id] = true
			duplicates = append(duplicates, fmt.Sprint(id))
		}
	}
	if len(duplicates) > 0 {
		report(checkFinding{
			Category: "conflict", Outcome: "fail", Subject: subject, Rule: "unique-identifiers",
			Message: "Duplicate identifiers: " + strings.Join(duplicates, ", "),
			Action:  act("Assign unique identifiers."),
		})
	}
}

// keyed indexes values by ID: first-seen key order, last value wins, like a JS Map.
type keyed[T any] struct {
	keys   []string
	values map[string]T
}

func index[T any](items []T, id func(T) string) keyed[T] {
	k := keyed[T]{values: map[string]T{}}
	for _, item := range items {
		key := id(item)
		if _, ok := k.values[key]; !ok {
			k.keys = append(k.keys, key)
		}
		k.values[key] = item
	}
	return k
}

func (k keyed[T]) get(key string) (T, bool) {
	v, ok := k.values[key]
	return v, ok
}
