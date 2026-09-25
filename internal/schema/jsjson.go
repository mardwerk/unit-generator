package schema

import (
	"fmt"
	"math"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Stringify writes a value exactly as JavaScript's JSON.stringify would:
// object keys in order, numbers in ECMAScript format, non-finite numbers as
// null, and only the characters JSON requires escaped.
func Stringify(value any) string {
	var b strings.Builder
	writeJSON(&b, value)
	return b.String()
}

func writeJSON(b *strings.Builder, value any) {
	switch v := value.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		if v {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			b.WriteString("null")
		} else {
			b.WriteString(FormatNumber(v))
		}
	case string:
		writeString(b, v)
	case []any:
		b.WriteByte('[')
		for i, item := range v {
			if i > 0 {
				b.WriteByte(',')
			}
			if item == missing {
				b.WriteString("null")
			} else {
				writeJSON(b, item)
			}
		}
		b.WriteByte(']')
	case *Object:
		b.WriteByte('{')
		first := true
		for _, key := range v.keys {
			item := v.values[key]
			if item == missing {
				continue
			}
			if !first {
				b.WriteByte(',')
			}
			first = false
			writeString(b, key)
			b.WriteByte(':')
			writeJSON(b, item)
		}
		b.WriteByte('}')
	default:
		converted, err := FromGo(value)
		if err != nil {
			panic(fmt.Sprintf("schema: cannot stringify %T: %v", value, err))
		}
		writeJSON(b, converted)
	}
}

func writeString(b *strings.Builder, s string) {
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				fmt.Fprintf(b, `\u%04x`, r)
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
}

// FormatNumber renders a float64 as ECMAScript Number.prototype.toString does.
func FormatNumber(f float64) string {
	switch {
	case math.IsNaN(f):
		return "NaN"
	case math.IsInf(f, 1):
		return "Infinity"
	case math.IsInf(f, -1):
		return "-Infinity"
	case f == 0:
		return "0"
	}
	sign := ""
	if f < 0 {
		sign = "-"
		f = -f
	}
	// Shortest round-trip digits: "d.ddde±x".
	e := strconv.FormatFloat(f, 'e', -1, 64)
	mantissa, exponent, _ := strings.Cut(e, "e")
	digits := strings.Replace(mantissa, ".", "", 1)
	exp, _ := strconv.Atoi(exponent)
	k := len(digits)
	n := exp + 1
	var out string
	switch {
	case k <= n && n <= 21:
		out = digits + strings.Repeat("0", n-k)
	case 0 < n && n <= 21:
		out = digits[:n] + "." + digits[n:]
	case -6 < n && n <= 0:
		out = "0." + strings.Repeat("0", -n) + digits
	default:
		expSign := "+"
		if n-1 < 0 {
			expSign = "-"
		}
		abs := n - 1
		if abs < 0 {
			abs = -abs
		}
		if k == 1 {
			out = digits + "e" + expSign + strconv.Itoa(abs)
		} else {
			out = digits[:1] + "." + digits[1:] + "e" + expSign + strconv.Itoa(abs)
		}
	}
	return sign + out
}

// UTF16Len is JavaScript's String.prototype.length.
func UTF16Len(s string) int {
	n := 0
	for _, r := range s {
		if r >= 0x10000 {
			n += 2
		} else {
			n++
		}
	}
	return n
}

func isJSSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
		return true
	}
	return r >= 0x2000 && r <= 0x200A
}

// Trim is JavaScript's String.prototype.trim.
func Trim(s string) string { return strings.TrimFunc(s, isJSSpace) }

// TrimStart is JavaScript's String.prototype.trimStart.
func TrimStart(s string) string { return strings.TrimLeftFunc(s, isJSSpace) }

// TrimEnd is JavaScript's String.prototype.trimEnd.
func TrimEnd(s string) string { return strings.TrimRightFunc(s, isJSSpace) }

// SliceUTF16 is JavaScript's String.prototype.slice(start, end) for non-negative bounds.
func SliceUTF16(s string, start, end int) string {
	var b strings.Builder
	i := 0
	for _, r := range s {
		width := 1
		if r >= 0x10000 {
			width = 2
		}
		if i >= start && i+width <= end {
			b.WriteRune(r)
		}
		i += width
		if i >= end {
			break
		}
	}
	return b.String()
}

// ValueMarshaler lets a Go type choose its ordered JSON form.
type ValueMarshaler interface {
	JSONValue() any
}

// FromGoValue converts Go values to ordered values by reflection, keeping
// non-finite floats, struct field order and `json` tag names. Map keys sort.
func FromGoValue(value any) any {
	return fromReflect(reflect.ValueOf(value))
}

func fromReflect(v reflect.Value) any {
	if !v.IsValid() {
		return nil
	}
	if v.CanInterface() {
		if m, ok := v.Interface().(ValueMarshaler); ok {
			if v.Kind() != reflect.Pointer || !v.IsNil() {
				return m.JSONValue()
			}
		}
		switch x := v.Interface().(type) {
		case *Object:
			return x
		}
	}
	switch v.Kind() {
	case reflect.Pointer, reflect.Interface:
		if v.IsNil() {
			return nil
		}
		return fromReflect(v.Elem())
	case reflect.Bool:
		return v.Bool()
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return float64(v.Int())
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return float64(v.Uint())
	case reflect.Float32, reflect.Float64:
		return v.Float()
	case reflect.String:
		return v.String()
	case reflect.Slice:
		if v.IsNil() {
			return []any{}
		}
		fallthrough
	case reflect.Array:
		out := make([]any, v.Len())
		for i := range out {
			out[i] = fromReflect(v.Index(i))
		}
		return out
	case reflect.Map:
		if v.IsNil() {
			return nil
		}
		keys := v.MapKeys()
		names := make([]string, len(keys))
		for i, key := range keys {
			names[i] = fmt.Sprint(key.Interface())
		}
		sort.Strings(names)
		out := NewObject()
		for _, name := range names {
			out.Set(name, fromReflect(v.MapIndex(reflect.ValueOf(name).Convert(v.Type().Key()))))
		}
		return out
	case reflect.Struct:
		out := NewObject()
		t := v.Type()
		for i := 0; i < t.NumField(); i++ {
			field := t.Field(i)
			if !field.IsExported() {
				continue
			}
			tag := field.Tag.Get("json")
			if tag == "-" {
				continue
			}
			name, options, _ := strings.Cut(tag, ",")
			if name == "" {
				name = field.Name
			}
			fv := v.Field(i)
			if strings.Contains(options, "omitempty") && isEmpty(fv) {
				continue
			}
			out.Set(name, fromReflect(fv))
		}
		return out
	}
	panic(fmt.Sprintf("schema: unsupported value %s", v.Type()))
}

func isEmpty(v reflect.Value) bool {
	switch v.Kind() {
	case reflect.Pointer, reflect.Interface, reflect.Map, reflect.Slice:
		return v.IsNil()
	case reflect.String:
		return v.Len() == 0
	case reflect.Bool:
		return !v.Bool()
	}
	return false
}

// validUTF8 reports whether s is valid UTF-8 (JSON text must be).
func validUTF8(s string) bool { return utf8.ValidString(s) }
