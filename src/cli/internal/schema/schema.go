package schema

import (
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// Issue is one validation problem, located by a path of keys and indices.
type Issue struct {
	Code    string `json:"code"`
	Path    []any  `json:"path"`
	Message string `json:"message"`
	abort   bool
}

// PathString joins the path with dots, as the TypeScript implementation did.
func (i Issue) PathString() string {
	parts := make([]string, len(i.Path))
	for n, p := range i.Path {
		switch v := p.(type) {
		case string:
			parts[n] = v
		case int:
			parts[n] = strconv.Itoa(v)
		}
	}
	return strings.Join(parts, ".")
}

// Error lists issues; it is returned by Parse helpers that fail.
type Error struct{ Issues []Issue }

func (e *Error) Error() string {
	lines := make([]string, len(e.Issues))
	for i, issue := range e.Issues {
		lines[i] = issue.PathString() + ": " + issue.Message
	}
	return strings.Join(lines, "\n")
}

type missingType struct{}

// missing stands for an absent object member (JavaScript undefined).
var missing = &missingType{}

// Missing is the sentinel for an absent value; Parse outputs never contain it.
var Missing any = missing

// Schema validates a value and produces its parse output.
type Schema interface {
	run(c *ctx, value any, path []any) any
	jsonSchema() *Object
}

type ctx struct{ issues []Issue }

func (c *ctx) add(code string, path []any, message string, abort bool) {
	c.issues = append(c.issues, Issue{Code: code, Path: append([]any(nil), path...), Message: message, abort: abort})
}

func (c *ctx) abortedSince(start int) bool {
	for _, issue := range c.issues[start:] {
		if issue.abort {
			return true
		}
	}
	return false
}

// Parse validates value. The output is meaningful only when issues is empty.
func Parse(s Schema, value any) (any, []Issue) {
	c := &ctx{}
	out := s.run(c, value, nil)
	if out == missing {
		out = nil
	}
	return out, c.issues
}

// ParseInto validates value and decodes the output into target.
func ParseInto(s Schema, value any, target any) error {
	out, issues := Parse(s, value)
	if len(issues) > 0 {
		return &Error{Issues: issues}
	}
	return ToGo(out, target)
}

func received(value any) string {
	switch v := value.(type) {
	case *missingType:
		return "undefined"
	case nil:
		return "null"
	case bool:
		return "boolean"
	case float64:
		if math.IsNaN(v) {
			return "NaN"
		}
		if math.IsInf(v, 0) {
			return "Infinity"
		}
		return "number"
	case string:
		return "string"
	case []any:
		return "array"
	case *Object:
		return "object"
	}
	return "unknown"
}

func invalidType(c *ctx, expected string, value any, path []any) {
	c.add("invalid_type", path, "Invalid input: expected "+expected+", received "+received(value), true)
}

// ---- length checks (run whenever the value has a length) ----

type lengthCheck struct {
	kind string // min, max, exact
	n    int
}

func runLengthChecks(c *ctx, checks []lengthCheck, value any, path []any) {
	var length int
	var unit, origin string
	switch v := value.(type) {
	case string:
		length, unit, origin = UTF16Len(v), "characters", "string"
	case []any:
		length, unit, origin = len(v), "items", "array"
	default:
		return
	}
	for _, check := range checks {
		n := strconv.Itoa(check.n)
		switch check.kind {
		case "min":
			if length < check.n {
				c.add("too_small", path, "Too small: expected "+origin+" to have >="+n+" "+unit, false)
			}
		case "max":
			if length > check.n {
				c.add("too_big", path, "Too big: expected "+origin+" to have <="+n+" "+unit, false)
			}
		case "exact":
			if length < check.n {
				c.add("too_small", path, "Too small: expected "+origin+" to have exactly "+n+" "+unit, false)
			} else if length > check.n {
				c.add("too_big", path, "Too big: expected "+origin+" to have exactly "+n+" "+unit, false)
			}
		}
	}
}

// ---- refinements ----

type refinement struct {
	fn      func(value any) bool
	message string
	super   func(value any, add func(path []any, message string))
}

func runRefinements(c *ctx, refs []refinement, value any, path []any, start int) {
	for _, r := range refs {
		if c.abortedSince(start) {
			return
		}
		if r.super != nil {
			r.super(value, func(rel []any, message string) {
				c.add("custom", append(append([]any(nil), path...), rel...), message, false)
			})
		} else if !r.fn(value) {
			c.add("custom", path, r.message, false)
		}
	}
}

// ---- string ----

// StringSchema is z.string() with its checks.
type StringSchema struct {
	trim    bool
	lengths []lengthCheck
	regexes []patternCheck
	url     bool
	refs    []refinement
	// order of min/max checks relative to each other is kept in lengths
}

type patternCheck struct {
	re      *regexp.Regexp
	source  string
	message string
}

// String returns z.string().
func String() *StringSchema { return &StringSchema{} }

// Text is z.string().trim().min(1), the contract's usual text field.
func Text() *StringSchema { return String().Trim().Min(1) }

func (s *StringSchema) clone() *StringSchema {
	out := *s
	out.lengths = append([]lengthCheck(nil), s.lengths...)
	out.regexes = append([]patternCheck(nil), s.regexes...)
	out.refs = append([]refinement(nil), s.refs...)
	return &out
}

// Trim trims JavaScript whitespace before later checks.
func (s *StringSchema) Trim() *StringSchema { o := s.clone(); o.trim = true; return o }

// Min requires at least n UTF-16 code units.
func (s *StringSchema) Min(n int) *StringSchema {
	o := s.clone()
	o.lengths = append(o.lengths, lengthCheck{"min", n})
	return o
}

// Max allows at most n UTF-16 code units.
func (s *StringSchema) Max(n int) *StringSchema {
	o := s.clone()
	o.lengths = append(o.lengths, lengthCheck{"max", n})
	return o
}

// Regex requires a match. source is the JavaScript pattern text.
func (s *StringSchema) Regex(source string, message string) *StringSchema {
	o := s.clone()
	o.regexes = append(o.regexes, patternCheck{regexp.MustCompile(source), source, message})
	return o
}

// URL requires a parseable absolute URL.
func (s *StringSchema) URL() *StringSchema { o := s.clone(); o.url = true; return o }

// Refine adds a custom check with a fixed message.
func (s *StringSchema) Refine(fn func(string) bool, message string) *StringSchema {
	o := s.clone()
	o.refs = append(o.refs, refinement{fn: func(v any) bool { return fn(v.(string)) }, message: message})
	return o
}

func (s *StringSchema) run(c *ctx, value any, path []any) any {
	start := len(c.issues)
	str, ok := value.(string)
	if !ok {
		invalidType(c, "string", value, path)
		runLengthChecks(c, s.lengths, value, path)
		return value
	}
	if s.trim {
		str = Trim(str)
	}
	runLengthChecks(c, s.lengths, str, path)
	for _, p := range s.regexes {
		if c.abortedSince(start) {
			break
		}
		if !p.re.MatchString(str) {
			message := p.message
			if message == "" {
				message = "Invalid string: must match pattern /" + p.source + "/"
			}
			c.add("invalid_format", path, message, false)
		}
	}
	if s.url && !c.abortedSince(start) && !validURL(str) {
		c.add("invalid_format", path, "Invalid URL", false)
	}
	runRefinements(c, s.refs, str, path, start)
	return str
}

func validURL(value string) bool {
	u, err := url.Parse(value)
	if err != nil || u.Scheme == "" {
		return false
	}
	if u.Opaque == "" && (u.Scheme == "http" || u.Scheme == "https") && u.Host == "" {
		return false
	}
	return true
}

// ---- number ----

// NumberSchema is z.number() with its checks.
type NumberSchema struct {
	integer bool
	checks  []numberCheck
	refs    []refinement
}

type numberCheck struct {
	op    string // gt, gte, lt, lte
	limit float64
}

// Number returns z.number().
func Number() *NumberSchema { return &NumberSchema{} }

// Int returns z.number().int().
func Int() *NumberSchema { return &NumberSchema{integer: true} }

func (s *NumberSchema) with(op string, limit float64) *NumberSchema {
	o := *s
	o.checks = append(append([]numberCheck(nil), s.checks...), numberCheck{op, limit})
	return &o
}

// Int requires a safe integer.
func (s *NumberSchema) Int() *NumberSchema { o := *s; o.integer = true; return &o }

// Positive is > 0.
func (s *NumberSchema) Positive() *NumberSchema { return s.with("gt", 0) }

// Nonnegative is >= 0.
func (s *NumberSchema) Nonnegative() *NumberSchema { return s.with("gte", 0) }

// Min is >= n.
func (s *NumberSchema) Min(n float64) *NumberSchema { return s.with("gte", n) }

// Max is <= n.
func (s *NumberSchema) Max(n float64) *NumberSchema { return s.with("lte", n) }

// Gt is > n.
func (s *NumberSchema) Gt(n float64) *NumberSchema { return s.with("gt", n) }

const maxSafeInteger = 9007199254740991

func (s *NumberSchema) run(c *ctx, value any, path []any) any {
	start := len(c.issues)
	f, ok := value.(float64)
	if !ok || math.IsNaN(f) || math.IsInf(f, 0) {
		invalidType(c, "number", value, path)
		return value
	}
	if s.integer {
		if f != math.Trunc(f) {
			c.add("invalid_type", path, "Invalid input: expected int, received number", true)
			return f
		}
		if f > maxSafeInteger {
			c.add("too_big", path, "Too big: expected int to be <="+FormatNumber(maxSafeInteger), false)
		} else if f < -maxSafeInteger {
			c.add("too_small", path, "Too small: expected int to be >="+FormatNumber(-maxSafeInteger), false)
		}
	}
	for _, check := range s.checks {
		if c.abortedSince(start) {
			break
		}
		limit := FormatNumber(check.limit)
		switch check.op {
		case "gt":
			if !(f > check.limit) {
				c.add("too_small", path, "Too small: expected number to be >"+limit, false)
			}
		case "gte":
			if !(f >= check.limit) {
				c.add("too_small", path, "Too small: expected number to be >="+limit, false)
			}
		case "lt":
			if !(f < check.limit) {
				c.add("too_big", path, "Too big: expected number to be <"+limit, false)
			}
		case "lte":
			if !(f <= check.limit) {
				c.add("too_big", path, "Too big: expected number to be <="+limit, false)
			}
		}
	}
	runRefinements(c, s.refs, f, path, start)
	return f
}

// ---- simple types ----

type boolSchema struct{}

// Bool returns z.boolean().
func Bool() Schema { return boolSchema{} }

func (boolSchema) run(c *ctx, value any, path []any) any {
	if _, ok := value.(bool); !ok {
		invalidType(c, "boolean", value, path)
	}
	return value
}

type nullSchema struct{}

// Null returns z.null().
func Null() Schema { return nullSchema{} }

func (nullSchema) run(c *ctx, value any, path []any) any {
	if value != nil {
		invalidType(c, "null", value, path)
	}
	return value
}

type unknownSchema struct{}

// Unknown returns z.unknown(): any value, including an absent one.
func Unknown() Schema { return unknownSchema{} }

func (unknownSchema) run(_ *ctx, value any, _ []any) any { return value }

// LiteralSchema is z.literal(value) for a string or number.
type LiteralSchema struct{ value any }

// Literal returns z.literal(value); value is a string or float64.
func Literal(value any) *LiteralSchema {
	if n, ok := value.(int); ok {
		value = float64(n)
	}
	return &LiteralSchema{value}
}

func (s *LiteralSchema) run(c *ctx, value any, path []any) any {
	if value != s.value {
		c.add("invalid_value", path, "Invalid input: expected "+Stringify(s.value), true)
	}
	return value
}

// EnumSchema is z.enum(values).
type EnumSchema struct{ Values []string }

// Enum returns z.enum(values).
func Enum(values ...string) *EnumSchema { return &EnumSchema{append([]string(nil), values...)} }

func (s *EnumSchema) run(c *ctx, value any, path []any) any {
	str, ok := value.(string)
	if ok {
		for _, v := range s.Values {
			if v == str {
				return value
			}
		}
	}
	if len(s.Values) == 1 {
		c.add("invalid_value", path, "Invalid input: expected "+Stringify(s.Values[0]), true)
		return value
	}
	quoted := make([]string, len(s.Values))
	for i, v := range s.Values {
		quoted[i] = Stringify(v)
	}
	c.add("invalid_value", path, "Invalid option: expected one of "+strings.Join(quoted, "|"), true)
	return value
}

// ---- wrappers ----

type nullableSchema struct{ inner Schema }

// Nullable returns inner.nullable().
func Nullable(inner Schema) Schema { return nullableSchema{inner} }

func (s nullableSchema) run(c *ctx, value any, path []any) any {
	if value == nil {
		return nil
	}
	return s.inner.run(c, value, path)
}

type optionalSchema struct{ inner Schema }

// Optional returns inner.optional(): an absent member is omitted from the output.
func Optional(inner Schema) Schema { return optionalSchema{inner} }

func (s optionalSchema) run(c *ctx, value any, path []any) any {
	if value == missing {
		return missing
	}
	return s.inner.run(c, value, path)
}

func isOptional(s Schema) bool {
	switch v := s.(type) {
	case optionalSchema:
		return true
	case unknownSchema:
		return true
	case nullableSchema:
		return isOptional(v.inner)
	case *refined:
		return isOptional(v.inner)
	}
	return false
}

type refined struct {
	inner Schema
	refs  []refinement
}

// Refine returns inner.refine(fn, message).
func Refine(inner Schema, fn func(value any) bool, message string) Schema {
	return &refined{inner, []refinement{{fn: fn, message: message}}}
}

// SuperRefine returns inner.superRefine(fn); fn adds issues at relative paths.
func SuperRefine(inner Schema, fn func(value any, add func(path []any, message string))) Schema {
	return &refined{inner, []refinement{{super: fn}}}
}

func (s *refined) run(c *ctx, value any, path []any) any {
	start := len(c.issues)
	out := s.inner.run(c, value, path)
	runRefinements(c, s.refs, out, path, start)
	return out
}

// ---- array and tuple ----

// ArraySchema is z.array(element) with length checks.
type ArraySchema struct {
	Element Schema
	lengths []lengthCheck
}

// Array returns z.array(element).
func Array(element Schema) *ArraySchema { return &ArraySchema{Element: element} }

func (s *ArraySchema) with(kind string, n int) *ArraySchema {
	o := *s
	o.lengths = append(append([]lengthCheck(nil), s.lengths...), lengthCheck{kind, n})
	return &o
}

// Min requires at least n items.
func (s *ArraySchema) Min(n int) *ArraySchema { return s.with("min", n) }

// Max allows at most n items.
func (s *ArraySchema) Max(n int) *ArraySchema { return s.with("max", n) }

// Length requires exactly n items.
func (s *ArraySchema) Length(n int) *ArraySchema { return s.with("exact", n) }

func (s *ArraySchema) run(c *ctx, value any, path []any) any {
	list, ok := value.([]any)
	if !ok {
		invalidType(c, "array", value, path)
		runLengthChecks(c, s.lengths, value, path)
		return value
	}
	out := make([]any, len(list))
	for i, item := range list {
		out[i] = s.Element.run(c, item, append(path, i))
		if out[i] == missing {
			out[i] = nil
		}
	}
	runLengthChecks(c, s.lengths, list, path)
	return out
}

type tupleSchema struct{ items []Schema }

// Tuple returns z.tuple(items).
func Tuple(items ...Schema) Schema { return tupleSchema{items} }

func (s tupleSchema) run(c *ctx, value any, path []any) any {
	list, ok := value.([]any)
	if !ok {
		invalidType(c, "tuple", value, path)
		return value
	}
	n := strconv.Itoa(len(s.items))
	if len(list) < len(s.items) {
		c.add("too_small", path, "Too small: expected array to have >="+n+" items", true)
		return value
	}
	if len(list) > len(s.items) {
		c.add("too_big", path, "Too big: expected array to have <="+n+" items", true)
		return value
	}
	out := make([]any, len(list))
	for i, item := range list {
		out[i] = s.items[i].run(c, item, append(path, i))
	}
	return out
}

// ---- objects ----

// Field is one named member of an object schema.
type Field struct {
	Name   string
	Schema Schema
}

// ObjectSchema is z.strictObject (strict) or z.object (strips unknown keys).
type ObjectSchema struct {
	Fields []Field
	strict bool
	refs   []refinement
}

// F builds a field.
func F(name string, s Schema) Field { return Field{name, s} }

// StrictObject returns z.strictObject(fields).
func StrictObject(fields ...Field) *ObjectSchema {
	return &ObjectSchema{Fields: fields, strict: true}
}

// LooseObject returns z.object(fields), which strips unknown keys.
func LooseObject(fields ...Field) *ObjectSchema {
	return &ObjectSchema{Fields: fields}
}

// Shape returns the schema of a field.
func (s *ObjectSchema) Shape(name string) Schema {
	for _, f := range s.Fields {
		if f.Name == name {
			return f.Schema
		}
	}
	panic("schema: no field " + name)
}

// Extend replaces fields in place and appends new ones, as Zod's extend does.
func (s *ObjectSchema) Extend(fields ...Field) *ObjectSchema {
	out := &ObjectSchema{Fields: append([]Field(nil), s.Fields...), strict: s.strict}
	for _, f := range fields {
		replaced := false
		for i := range out.Fields {
			if out.Fields[i].Name == f.Name {
				out.Fields[i] = f
				replaced = true
				break
			}
		}
		if !replaced {
			out.Fields = append(out.Fields, f)
		}
	}
	return out
}

// Omit drops fields.
func (s *ObjectSchema) Omit(names ...string) *ObjectSchema {
	out := &ObjectSchema{strict: s.strict}
	for _, f := range s.Fields {
		keep := true
		for _, name := range names {
			if f.Name == name {
				keep = false
			}
		}
		if keep {
			out.Fields = append(out.Fields, f)
		}
	}
	return out
}

// Refine adds an object-level check.
func (s *ObjectSchema) Refine(fn func(value *Object) bool, message string) *ObjectSchema {
	o := *s
	o.refs = append(append([]refinement(nil), s.refs...), refinement{fn: func(v any) bool { return fn(v.(*Object)) }, message: message})
	return &o
}

// SuperRefine adds an object-level check that reports its own issues.
func (s *ObjectSchema) SuperRefine(fn func(value *Object, add func(path []any, message string))) *ObjectSchema {
	o := *s
	o.refs = append(append([]refinement(nil), s.refs...), refinement{super: func(v any, add func([]any, string)) { fn(v.(*Object), add) }})
	return &o
}

func (s *ObjectSchema) run(c *ctx, value any, path []any) any {
	start := len(c.issues)
	obj, ok := value.(*Object)
	if !ok {
		invalidType(c, "object", value, path)
		return value
	}
	out := NewObject()
	for _, f := range s.Fields {
		item, present := obj.Get(f.Name)
		if !present {
			item = missing
		}
		result := f.Schema.run(c, item, append(path, f.Name))
		if result != missing {
			out.Set(f.Name, result)
		}
	}
	if s.strict {
		var unknown []string
		for _, key := range obj.keys {
			if !s.has(key) {
				unknown = append(unknown, key)
			}
		}
		if len(unknown) == 1 {
			c.add("unrecognized_keys", path, "Unrecognized key: "+Stringify(unknown[0]), false)
		} else if len(unknown) > 1 {
			quoted := make([]string, len(unknown))
			for i, k := range unknown {
				quoted[i] = Stringify(k)
			}
			c.add("unrecognized_keys", path, "Unrecognized keys: "+strings.Join(quoted, ", "), false)
		}
	}
	runRefinements(c, s.refs, out, path, start)
	return out
}

func (s *ObjectSchema) has(key string) bool {
	for _, f := range s.Fields {
		if f.Name == key {
			return true
		}
	}
	return false
}

type recordSchema struct{ value Schema }

// Record returns z.record(z.string(), value).
func Record(value Schema) Schema { return recordSchema{value} }

func (s recordSchema) run(c *ctx, value any, path []any) any {
	obj, ok := value.(*Object)
	if !ok {
		invalidType(c, "record", value, path)
		return value
	}
	out := NewObject()
	for _, key := range obj.keys {
		out.Set(key, s.value.run(c, obj.values[key], append(path, key)))
	}
	return out
}

// ---- unions ----

type discriminatedSchema struct {
	key     string
	options []*ObjectSchema
}

// DiscriminatedUnion returns z.discriminatedUnion(key, options).
func DiscriminatedUnion(key string, options ...*ObjectSchema) Schema {
	return discriminatedSchema{key, options}
}

func (s discriminatedSchema) literals() []string {
	values := make([]string, len(s.options))
	for i, option := range s.options {
		values[i] = option.Shape(s.key).(*LiteralSchema).value.(string)
	}
	return values
}

func (s discriminatedSchema) run(c *ctx, value any, path []any) any {
	obj, ok := value.(*Object)
	if !ok {
		invalidType(c, "object", value, path)
		return value
	}
	tag, _ := obj.Get(s.key)
	for i, literal := range s.literals() {
		if tag == literal {
			return s.options[i].run(c, value, path)
		}
	}
	quoted := make([]string, len(s.options))
	for i, literal := range s.literals() {
		quoted[i] = "'" + literal + "'"
	}
	c.add("invalid_union", append(path, s.key), "Invalid discriminator value. Expected "+strings.Join(quoted, " | "), true)
	return value
}

type unionSchema struct{ options []Schema }

// Union returns z.union(options): the first option that parses wins.
func Union(options ...Schema) Schema { return unionSchema{options} }

func (s unionSchema) run(c *ctx, value any, path []any) any {
	for _, option := range s.options {
		trial := &ctx{}
		out := option.run(trial, value, path)
		if len(trial.issues) == 0 {
			return out
		}
	}
	c.add("invalid_union", path, "Invalid input", true)
	return value
}
