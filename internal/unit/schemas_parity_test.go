package unit

import (
	"fmt"
	"strings"
	"testing"

	"github.com/mardwerk/unit-generator/internal/mechanics"
	"github.com/mardwerk/unit-generator/internal/parity"
	s "github.com/mardwerk/unit-generator/internal/schema"
)

var staticSchemas = map[string]s.Schema{
	"attack":              mechanics.AttackSchema,
	"boost":               mechanics.BoostSchema,
	"blueprint":           mechanics.BlueprintSchema,
	"diagnosticBlueprint": mechanics.DiagnosticBlueprintSchema,
	"mechanicsDefinition": mechanics.MechanicsDefinitionSchema,
	"request":             RequestSchema,
	"prepared":            PreparedSchema,
	"candidate":           CandidateSchema,
	"draft":               DraftSchema,
	"checked":             CheckedSchema,
	"result":              ResultSchema,
	"finding":             FindingSchema,
	"modelUsage":          ModelUsageSchema,
	"semanticReview":      SemanticReviewSchema,
	"designPlan":          DesignPlanSchema,
	"designPlanAuthoring": DesignPlanAuthoringSchema,
	"unitProfile":         UnitProfileSchema,
}

// contextSchemas are built from a recorded request.
var contextSchemas = map[string]func(context any) (s.Schema, error){}

func TestSchemasMatchRecordedBehavior(t *testing.T) {
	entries, err := parity.Entries("schemas")
	if err != nil {
		t.Fatal(err)
	}
	for n, entry := range entries {
		name, _ := entry.Get("schema")
		schema := staticSchemas[name.(string)]
		context, _ := entry.Get("context")
		if schema == nil {
			build := contextSchemas[name.(string)]
			if build == nil {
				t.Logf("skip %s: not ported yet", name)
				continue
			}
			schema, err = build(context)
			if err != nil {
				t.Fatalf("%s: %v", name, err)
			}
		}
		t.Run(fmt.Sprintf("%d-%s", n, name), func(t *testing.T) {
			want, _ := entry.Get("jsonSchema")
			if got := s.JSONSchema(schema); parity.Canonical(got) != parity.Canonical(want) {
				t.Errorf("JSON Schema differs\n got %s\nwant %s", parity.Canonical(got), parity.Canonical(want))
			}
			base, _ := entry.Get("base")
			cases, _ := entry.Get("cases")
			failures := 0
			for _, item := range cases.([]any) {
				c := item.(*s.Object)
				path, _ := c.Get("path")
				op, _ := c.Get("op")
				input := Mutate(base, path.([]any), op.(string))
				out, issues := s.Parse(schema, input)
				got := describe(out, issues)
				want := recorded(c)
				if got != want {
					failures++
					if failures <= 8 {
						t.Errorf("%v %s:\n got %s\nwant %s", path, op, got, want)
					}
				}
			}
			if failures > 8 {
				t.Errorf("... %d failing cases in total", failures)
			}
		})
	}
}

func describe(out any, issues []s.Issue) string {
	if len(issues) == 0 {
		return "ok " + parity.Hash(out)
	}
	lines := make([]string, len(issues))
	for i, issue := range issues {
		lines[i] = fmt.Sprintf("%s %s: %s", issue.Code, pathText(issue.Path), issue.Message)
	}
	return strings.Join(lines, " | ")
}

func recorded(c *s.Object) string {
	if hash, ok := c.Get("outputHash"); ok {
		return "ok " + hash.(string)
	}
	issues, _ := c.Get("issues")
	lines := []string{}
	for _, item := range issues.([]any) {
		issue := item.(*s.Object)
		code, _ := issue.Get("code")
		path, _ := issue.Get("path")
		message, _ := issue.Get("message")
		lines = append(lines, fmt.Sprintf("%s %s: %s", code, pathText(path.([]any)), message))
	}
	return strings.Join(lines, " | ")
}

func pathText(path []any) string {
	parts := make([]string, len(path))
	for i, p := range path {
		switch v := p.(type) {
		case float64:
			parts[i] = s.FormatNumber(v)
		default:
			parts[i] = fmt.Sprint(v)
		}
	}
	return strings.Join(parts, ".")
}

// Mutate applies one recorded battery mutation to a copy of base.
func Mutate(base any, path []any, op string) any {
	root := s.Clone(base)
	if len(path) == 0 {
		return applyOp(root, op)
	}
	parent := parity.Get(root, path[:len(path)-1]...)
	switch key := path[len(path)-1].(type) {
	case string:
		obj := parent.(*s.Object)
		if op == "delete" {
			obj.Delete(key)
		} else {
			current, _ := obj.Get(key)
			obj.Set(key, applyOp(current, op))
		}
	case float64:
		list := parent.([]any)
		list[int(key)] = applyOp(list[int(key)], op)
	}
	return root
}

func applyOp(value any, op string) any {
	switch op {
	case "none":
		return value
	case "null":
		return nil
	case "num0":
		return 0.0
	case "numNeg":
		return -1.0
	case "numFrac":
		return 1.5
	case "numBig":
		return 10000000.0
	case "strX":
		return "x"
	case "strEmpty":
		return ""
	case "strSpace":
		return "   "
	case "strLong":
		return strings.Repeat("x", 2000)
	case "trimPad":
		return "  " + value.(string) + "  "
	case "obj":
		return s.NewObject()
	case "arrEmpty":
		return []any{}
	case "dupElem":
		list := value.([]any)
		var last any
		if len(list) > 0 {
			last = s.Clone(list[len(list)-1])
		}
		return append(append([]any(nil), list...), last)
	case "extraKey":
		obj := s.Clone(value).(*s.Object)
		obj.Set("zzExtra", 1.0)
		return obj
	}
	panic("unknown op " + op)
}
