package unit

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strings"
	"unicode/utf16"

	s "github.com/mardwerk/unit-generator/internal/schema"
)

// Hash prefixes. New artifacts use RFC 8785 canonical JSON; artifacts written
// by the TypeScript Tool hash JSON.stringify of the request in schema order.
const (
	HashJCS    = "jcs-sha256:"
	HashLegacy = "sha256:"
)

// requestValue is the request's parse output: schema order, trimmed text.
func requestValue(request Request) (any, error) {
	out, issues := s.Parse(RequestSchema, s.FromGoValue(request))
	if len(issues) > 0 {
		return nil, &s.Error{Issues: issues}
	}
	return out, nil
}

// HashRequest returns the jcs-sha256 hash of a request.
func HashRequest(request Request) (string, error) {
	value, err := requestValue(request)
	if err != nil {
		return "", err
	}
	return HashJCS + digest(JCS(value)), nil
}

// LegacyHash returns the sha256 hash the TypeScript Tool wrote.
func LegacyHash(request Request) (string, error) {
	value, err := requestValue(request)
	if err != nil {
		return "", err
	}
	return HashLegacy + digest(s.Stringify(value)), nil
}

// VerifyHash reports whether hash matches the request in either format.
func VerifyHash(request Request, hash string) (bool, error) {
	var computed string
	var err error
	switch {
	case strings.HasPrefix(hash, HashJCS):
		computed, err = HashRequest(request)
	case strings.HasPrefix(hash, HashLegacy):
		computed, err = LegacyHash(request)
	default:
		return false, nil
	}
	return err == nil && computed == hash, err
}

func digest(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

// JCS serializes a value as RFC 8785 canonical JSON: object keys sorted by
// UTF-16 code units, ECMAScript numbers and JSON.stringify string escaping.
func JCS(value any) string {
	var b strings.Builder
	writeJCS(&b, value)
	return b.String()
}

func writeJCS(b *strings.Builder, value any) {
	switch v := value.(type) {
	case *s.Object:
		keys := v.Keys()
		sort.Slice(keys, func(i, j int) bool { return lessUTF16(keys[i], keys[j]) })
		b.WriteByte('{')
		for i, key := range keys {
			if i > 0 {
				b.WriteByte(',')
			}
			item, _ := v.Get(key)
			b.WriteString(s.Stringify(key))
			b.WriteByte(':')
			writeJCS(b, item)
		}
		b.WriteByte('}')
	case []any:
		b.WriteByte('[')
		for i, item := range v {
			if i > 0 {
				b.WriteByte(',')
			}
			writeJCS(b, item)
		}
		b.WriteByte(']')
	default:
		b.WriteString(s.Stringify(v))
	}
}

func lessUTF16(a, b string) bool {
	x, y := utf16.Encode([]rune(a)), utf16.Encode([]rune(b))
	for i := 0; i < len(x) && i < len(y); i++ {
		if x[i] != y[i] {
			return x[i] < y[i]
		}
	}
	return len(x) < len(y)
}
