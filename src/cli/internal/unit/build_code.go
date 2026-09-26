package unit

import (
	"strings"

	m "github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
)

// BuildCode names a purchase in top-middle-bottom notation: the second path
// at tier 4 is x-4-x.
func BuildCode(pathIndex, tier int) string {
	parts := []string{"x", "x", "x"}
	parts[pathIndex] = string(rune('0' + tier))
	return strings.Join(parts, "-")
}

// SelectionCode names a concrete build: {3, 1, 0} is 3-1-0.
func SelectionCode(selection m.Selection) string {
	parts := make([]string, len(selection))
	for i, tier := range selection {
		parts[i] = string(rune('0' + tier))
	}
	return strings.Join(parts, "-")
}
