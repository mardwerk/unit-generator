package schema

import (
	"math"
	"strings"
	"testing"
)

func issueText(issues []Issue) string {
	var parts []string
	for _, issue := range issues {
		parts = append(parts, issue.PathString()+": "+issue.Message)
	}
	return strings.Join(parts, "\n")
}

func TestStrictObjectsRejectUnknownKeysAndTrimText(t *testing.T) {
	schema := StrictObject(
		F("name", Text().Max(10)),
		F("count", Int().Positive()),
		F("kind", Enum("a", "b")),
		F("note", Optional(Nullable(String()))),
	)
	value, _ := Decode([]byte(`{"name":"  Mira  ","count":2,"kind":"a"}`))
	out, issues := Parse(schema, value)
	if len(issues) > 0 {
		t.Fatal(issueText(issues))
	}
	if name, _ := out.(*Object).Get("name"); name != "Mira" {
		t.Errorf("name %q was not trimmed", name)
	}
	for input, want := range map[string]string{
		`{"name":"Mira","count":2,"kind":"a","extra":1}`: "Unrecognized key",
		`{"name":"   ","count":2,"kind":"a"}`:            "name:",
		`{"name":"Mira","count":1.5,"kind":"a"}`:         "count:",
		`{"name":"Mira","count":0,"kind":"a"}`:           "count:",
		`{"name":"Mira","count":2,"kind":"c"}`:           "kind: Invalid option",
		`{"count":2,"kind":"a"}`:                         "name: Invalid input",
	} {
		value, err := Decode([]byte(input))
		if err != nil {
			t.Fatal(err)
		}
		if _, issues := Parse(schema, value); !strings.Contains(issueText(issues), want) {
			t.Errorf("%s: want %q in %q", input, want, issueText(issues))
		}
	}
}

func TestDiscriminatedUnionsAndJSONSchema(t *testing.T) {
	change := DiscriminatedUnion("kind",
		StrictObject(F("kind", Literal("stat")), F("value", Number())),
		StrictObject(F("kind", Literal("camo")), F("value", Bool())),
	)
	good, _ := Decode([]byte(`[{"kind":"stat","value":2},{"kind":"camo","value":true}]`))
	if _, issues := Parse(Array(change).Max(2), good); len(issues) > 0 {
		t.Fatal(issueText(issues))
	}
	bad, _ := Decode([]byte(`[{"kind":"camo","value":2}]`))
	if _, issues := Parse(Array(change), bad); len(issues) == 0 {
		t.Error("a mismatched union member passed")
	}
	jsonSchema := Stringify(JSONSchema(StrictObject(F("n", Int().Positive()), F("s", Optional(String())))))
	for _, want := range []string{`"additionalProperties":false`, `"type":"integer"`, `"exclusiveMinimum":0`, `"required":["n"]`} {
		if !strings.Contains(jsonSchema, want) {
			t.Errorf("JSON Schema lacks %s: %s", want, jsonSchema)
		}
	}
}

func TestJavaScriptCompatibleJSON(t *testing.T) {
	tenth, fifth := 0.1, 0.2
	for value, want := range map[float64]string{1: "1", tenth + fifth: "0.30000000000000004", 1e21: "1e+21", 1.5e-7: "1.5e-7", math.Copysign(0, -1): "0"} {
		if got := FormatNumber(value); got != want {
			t.Errorf("FormatNumber(%v) = %s, want %s", value, got, want)
		}
	}
	object := NewObject().Set("b", 1.0).Set("a", "x")
	if got := Stringify(object); got != `{"b":1,"a":"x"}` {
		t.Errorf("Stringify keeps insertion order: %s", got)
	}
	if got := Canonical(object); !strings.HasPrefix(got, `{"a":`) {
		t.Errorf("Canonical sorts keys: %s", got)
	}
	if UTF16Len("a😀") != 3 {
		t.Error("UTF-16 length counts surrogate pairs")
	}
}
