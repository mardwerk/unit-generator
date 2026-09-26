package research

import (
	"context"
	"errors"
	"os"
	"path/filepath"

	s "github.com/mardwerk/unit-generator/internal/schema"
	"github.com/mardwerk/unit-generator/internal/unit"
)

// RequestFileSchema is a request whose documents are explicit inputs.
var RequestFileSchema = unit.RequestSchema.Omit("documents").Extend(
	s.F("documents", s.Array(DocumentSpecSchema).Min(1)),
	s.F("previousResultFile", s.Optional(s.String().Min(1))),
)

// ReadJSONFile reads only the named regular JSON file, up to 32 MB.
func ReadJSONFile(path string) (any, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("Expected a regular JSON file: " + path)
	}
	if info.Size() > 32_000_000 {
		return nil, errors.New("JSON file exceeds 32 MB: " + path)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	value, err := s.Decode(content)
	if err != nil {
		return nil, errors.New("Invalid JSON in " + path + ".")
	}
	return value, nil
}

// WithRequestDefaults fills the optional request fields a request file may
// leave out.
func WithRequestDefaults(value any) any {
	object, ok := value.(*s.Object)
	if !ok {
		return value
	}
	out := s.Clone(object).(*s.Object)
	for key, fallback := range map[string]any{"constraints": []any{}, "progression": nil, "previous": nil, "feedback": nil} {
		if !out.Has(key) {
			out.Set(key, fallback)
		}
	}
	return out
}

// RequestFile is a loaded request file: the request with its documents
// resolved, and the previous Result file it names, if any.
type RequestFile struct {
	Request            *s.Object
	PreviousResultFile string
}

// LoadRequestFile reads a request file and resolves its documents relative
// to the file's folder. It reads no other file and discovers no history.
func (r *Researcher) LoadRequestFile(ctx context.Context, path string) (RequestFile, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return RequestFile{}, err
	}
	raw, err := ReadJSONFile(absolute)
	if err != nil {
		return RequestFile{}, err
	}
	parsed, issues := s.Parse(RequestFileSchema, WithRequestDefaults(raw))
	if len(issues) > 0 {
		return RequestFile{}, &s.Error{Issues: issues}
	}
	request := parsed.(*s.Object)
	var specs []DocumentSpec
	documentsValue, _ := request.Get("documents")
	if err := s.ToGo(documentsValue, &specs); err != nil {
		return RequestFile{}, err
	}
	base := filepath.Dir(absolute)
	documents := make([]any, len(specs))
	for i, spec := range specs {
		document, err := r.LoadDocument(ctx, spec, base)
		if err != nil {
			return RequestFile{}, err
		}
		documents[i] = s.FromGoValue(document)
	}
	out := RequestFile{Request: s.Clone(request).(*s.Object)}
	out.Request.Set("documents", documents)
	if previous, ok := out.Request.Get("previousResultFile"); ok {
		out.PreviousResultFile = filepath.Join(base, previous.(string))
		if filepath.IsAbs(previous.(string)) {
			out.PreviousResultFile = previous.(string)
		}
		out.Request.Delete("previousResultFile")
	}
	return out, nil
}
