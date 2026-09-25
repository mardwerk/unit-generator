// Package schema validates JSON values against the Tool's contract the way the
// original TypeScript implementation did, produces the same issues and parse
// output, and derives provider JSON Schemas from the same definitions.
package schema

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
)

// Object is a JSON object that keeps its key order. Values are nil, bool,
// float64, string, []any or *Object.
type Object struct {
	keys   []string
	values map[string]any
}

// NewObject returns an empty ordered object.
func NewObject() *Object { return &Object{values: map[string]any{}} }

// Set adds or replaces a key; a new key goes last.
func (o *Object) Set(key string, value any) *Object {
	if _, ok := o.values[key]; !ok {
		o.keys = append(o.keys, key)
	}
	o.values[key] = value
	return o
}

// Get returns the value for key and whether it is present.
func (o *Object) Get(key string) (any, bool) {
	value, ok := o.values[key]
	return value, ok
}

// Has reports whether key is present.
func (o *Object) Has(key string) bool {
	_, ok := o.values[key]
	return ok
}

// Delete removes a key if present.
func (o *Object) Delete(key string) {
	if _, ok := o.values[key]; !ok {
		return
	}
	delete(o.values, key)
	for i, k := range o.keys {
		if k == key {
			o.keys = append(o.keys[:i:i], o.keys[i+1:]...)
			break
		}
	}
}

// Keys returns the keys in order.
func (o *Object) Keys() []string { return append([]string(nil), o.keys...) }

// Len returns the number of keys.
func (o *Object) Len() int { return len(o.keys) }

// Clone copies a value deeply.
func Clone(value any) any {
	switch v := value.(type) {
	case *Object:
		out := NewObject()
		for _, key := range v.keys {
			out.Set(key, Clone(v.values[key]))
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = Clone(item)
		}
		return out
	default:
		return v
	}
}

// ErrDuplicateKey reports a JSON object that names the same key twice.
var ErrDuplicateKey = errors.New("duplicate key")

// Decode parses JSON into ordered values. Duplicate keys are rejected; numbers
// become float64 exactly as JavaScript would read them.
func Decode(data []byte) (any, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	value, err := decodeValue(decoder)
	if err != nil {
		return nil, err
	}
	if _, err := decoder.Token(); err != io.EOF {
		return nil, errors.New("unexpected data after the JSON value")
	}
	return value, nil
}

func decodeValue(decoder *json.Decoder) (any, error) {
	token, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	return decodeToken(decoder, token)
}

func decodeToken(decoder *json.Decoder, token json.Token) (any, error) {
	switch t := token.(type) {
	case json.Delim:
		switch t {
		case '{':
			object := NewObject()
			for decoder.More() {
				keyToken, err := decoder.Token()
				if err != nil {
					return nil, err
				}
				key := keyToken.(string)
				if object.Has(key) {
					return nil, fmt.Errorf("%w %q", ErrDuplicateKey, key)
				}
				value, err := decodeValue(decoder)
				if err != nil {
					return nil, err
				}
				object.Set(key, value)
			}
			if _, err := decoder.Token(); err != nil {
				return nil, err
			}
			return object, nil
		case '[':
			list := []any{}
			for decoder.More() {
				value, err := decodeValue(decoder)
				if err != nil {
					return nil, err
				}
				list = append(list, value)
			}
			if _, err := decoder.Token(); err != nil {
				return nil, err
			}
			return list, nil
		}
		return nil, fmt.Errorf("unexpected delimiter %v", t)
	case json.Number:
		// ParseFloat rounds exactly like JSON.parse; overflow becomes ±Inf there too.
		f, err := strconv.ParseFloat(string(t), 64)
		if err != nil && !errors.Is(err, strconv.ErrRange) {
			return nil, err
		}
		return f, nil
	default:
		return t, nil // string, bool or nil
	}
}

// FromGo converts a Go value into ordered values (see FromGoValue).
func FromGo(value any) (any, error) { return FromGoValue(value), nil }

// MustFromGo is FromGoValue.
func MustFromGo(value any) any { return FromGoValue(value) }

// ToGo decodes ordered values into a Go value through JSON.
func ToGo(value any, target any) error {
	return json.Unmarshal([]byte(Stringify(value)), target)
}

// MarshalJSON writes the object in order.
func (o *Object) MarshalJSON() ([]byte, error) { return []byte(Stringify(o)), nil }

// UnmarshalJSON reads an object, keeping key order.
func (o *Object) UnmarshalJSON(data []byte) error {
	value, err := Decode(data)
	if err != nil {
		return err
	}
	obj, ok := value.(*Object)
	if !ok {
		return errors.New("expected a JSON object")
	}
	*o = *obj
	return nil
}
