// Package golden reads the recorded TypeScript behavior in contracts/v1/golden
// so tests can check the Go implementation against it.
package golden

import (
	"bufio"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	s "github.com/mardwerk/unit-generator/internal/schema"
)

// Dir is the corpus directory.
func Dir() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "contracts", "v1", "golden")
}

// Entries returns every recorded line of name.jsonl.gz as ordered values.
func Entries(name string) ([]*s.Object, error) {
	f, err := os.Open(filepath.Join(Dir(), name+".jsonl.gz"))
	if err != nil {
		return nil, err
	}
	defer f.Close()
	z, err := gzip.NewReader(f)
	if err != nil {
		return nil, err
	}
	scanner := bufio.NewScanner(z)
	scanner.Buffer(make([]byte, 1<<20), 1<<28)
	var out []*s.Object
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		value, err := s.Decode(line)
		if err != nil {
			return nil, err
		}
		out = append(out, value.(*s.Object))
	}
	return out, scanner.Err()
}

// Hash is the sha256 of JavaScript's JSON.stringify(value), as recorded.
func Hash(value any) string {
	sum := sha256.Sum256([]byte(s.Stringify(value)))
	return hex.EncodeToString(sum[:])
}

// Canonical renders a value with sorted keys, for order-insensitive comparison.
func Canonical(value any) string {
	var b strings.Builder
	canonical(&b, value)
	return b.String()
}

func canonical(b *strings.Builder, value any) {
	switch v := value.(type) {
	case *s.Object:
		keys := v.Keys()
		sort.Strings(keys)
		b.WriteByte('{')
		for i, key := range keys {
			if i > 0 {
				b.WriteByte(',')
			}
			item, _ := v.Get(key)
			b.WriteString(s.Stringify(key))
			b.WriteByte(':')
			canonical(b, item)
		}
		b.WriteByte('}')
	case []any:
		b.WriteByte('[')
		for i, item := range v {
			if i > 0 {
				b.WriteByte(',')
			}
			canonical(b, item)
		}
		b.WriteByte(']')
	default:
		b.WriteString(s.Stringify(v))
	}
}

// Get follows a path of keys and indices.
func Get(value any, path ...any) any {
	for _, p := range path {
		switch key := p.(type) {
		case string:
			value, _ = value.(*s.Object).Get(key)
		case int:
			value = value.([]any)[key]
		case float64:
			value = value.([]any)[int(key)]
		}
	}
	return value
}
