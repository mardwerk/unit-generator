package parity

import (
	"math"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

// Restore turns recorded {"$number": "Infinity"} markers back into floats.
func Restore(value any) any {
	switch v := value.(type) {
	case *s.Object:
		if v.Len() == 1 {
			if n, ok := v.Get("$number"); ok {
				switch n {
				case "Infinity":
					return math.Inf(1)
				case "-Infinity":
					return math.Inf(-1)
				default:
					return math.NaN()
				}
			}
		}
		out := s.NewObject()
		for _, key := range v.Keys() {
			item, _ := v.Get(key)
			out.Set(key, Restore(item))
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = Restore(item)
		}
		return out
	}
	return value
}

// Same reports whether got (any Go value) and want (recorded) are equal as
// JSON, ignoring key order. Non-finite numbers compare as recorded markers.
func Same(got, want any) bool {
	return Canonical(Mark(s.FromGoValue(got))) == Canonical(want)
}

// Mark replaces non-finite floats with the recorder's markers.
func Mark(value any) any {
	switch v := value.(type) {
	case float64:
		if math.IsInf(v, 1) {
			return s.NewObject().Set("$number", "Infinity")
		}
		if math.IsInf(v, -1) {
			return s.NewObject().Set("$number", "-Infinity")
		}
		if math.IsNaN(v) {
			return s.NewObject().Set("$number", "NaN")
		}
	case *s.Object:
		out := s.NewObject()
		for _, key := range v.Keys() {
			item, _ := v.Get(key)
			out.Set(key, Mark(item))
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = Mark(item)
		}
		return out
	}
	return value
}

// Arg returns argument i of a recorded call, or nil when absent.
func Arg(entry *s.Object, i int) any {
	args, _ := entry.Get("args")
	list := args.([]any)
	if i >= len(list) {
		return s.Missing
	}
	return list[i]
}

// Output returns the recorded output and whether the call succeeded.
func Output(entry *s.Object) (any, bool) {
	out, ok := entry.Get("output")
	return out, ok
}

// ErrorOf returns the recorded error object.
func ErrorOf(entry *s.Object) *s.Object {
	e, _ := entry.Get("error")
	obj, _ := e.(*s.Object)
	return obj
}
