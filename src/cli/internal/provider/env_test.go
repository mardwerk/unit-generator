package provider

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	utf16pkg "unicode/utf16"
)

func TestEnvironmentPrefersProcessVariablesAndNeverQuotesLines(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, ".env")
	key := "sk-or-v1-" + strings.Repeat("a", 61) + "xyz"
	_ = os.WriteFile(path, []byte("# comment\nOPENROUTER_API_KEY=\""+key+"\"\nexport OPENROUTER_MODEL=provider/model # note\nUNIT_TEST_EXPLICIT=file\n"), 0o600)
	t.Setenv("UNIT_TEST_EXPLICIT", "process")
	t.Setenv("OPENROUTER_API_KEY", "")
	env, err := LoadEnvironment(path)
	if err != nil {
		t.Fatal(err)
	}
	if value, source := env.Get("OPENROUTER_API_KEY"); value != key || source != SourceEnvFile {
		t.Errorf("key from %s", source)
	}
	if env.Value("OPENROUTER_MODEL") != "provider/model" {
		t.Errorf("model %q", env.Value("OPENROUTER_MODEL"))
	}
	if value, source := env.Get("UNIT_TEST_EXPLICIT"); value != "process" || source != SourceEnv {
		t.Errorf("explicit %q from %s", value, source)
	}
	if _, source := env.Get("UNIT_TEST_MISSING"); source != SourceNone {
		t.Errorf("missing from %s", source)
	}
	if hint := KeyHint(key); hint == nil || *hint != "sk-or-v1-aaa...xyz" {
		t.Errorf("hint %v", hint)
	}
	if KeyHint("short-secret") != nil {
		t.Error("short keys stay hidden")
	}
	if env.File() != path {
		t.Errorf("file %q", env.File())
	}
	// Windows editors add a byte-order mark; Windows PowerShell writes UTF-16.
	windows := "OPENROUTER_API_KEY=" + key + "\r\nOPENROUTER_MODEL=provider/model\r\n"
	for name, content := range map[string][]byte{
		"UTF-8 with a byte-order mark": append([]byte("\ufeff"), windows...),
		"UTF-16LE":                     utf16(windows, false),
		"UTF-16BE":                     utf16(windows, true),
	} {
		_ = os.WriteFile(path, content, 0o600)
		env, err := LoadEnvironment(path)
		if err != nil || env.Value("OPENROUTER_API_KEY") != key || env.Value("OPENROUTER_MODEL") != "provider/model" {
			t.Errorf("%s: %v", name, err)
		}
	}
	// Without a byte-order mark, UTF-16 cannot be told apart; it fails loudly
	// instead of silently losing every setting.
	_ = os.WriteFile(path, utf16(windows, false)[2:], 0o600)
	if _, err := LoadEnvironment(path); err == nil || !strings.Contains(err.Error(), "line 1") {
		t.Errorf("UTF-16 without a byte-order mark: %v", err)
	}
	_ = os.WriteFile(path, []byte("# SECRET_VALUE\nSECRET_VALUE without an equals sign\n"), 0o600)
	if _, err := LoadEnvironment(path); err == nil || strings.Contains(err.Error(), "SECRET") || !strings.Contains(err.Error(), "line 2") {
		t.Errorf("error %v", err)
	}
	env, err = LoadEnvironment(filepath.Join(directory, "missing.env"))
	if err != nil || env.File() != "" {
		t.Errorf("a missing file is empty: %v", err)
	}
}

// utf16 encodes text with a byte-order mark, as Windows PowerShell does.
func utf16(text string, bigEndian bool) []byte {
	out := []byte{0xff, 0xfe}
	if bigEndian {
		out = []byte{0xfe, 0xff}
	}
	for _, unit := range utf16pkg.Encode([]rune(text)) {
		if bigEndian {
			out = append(out, byte(unit>>8), byte(unit))
		} else {
			out = append(out, byte(unit), byte(unit>>8))
		}
	}
	return out
}
