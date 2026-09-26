package provider

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
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
	_ = os.WriteFile(path, []byte("SECRET_VALUE without an equals sign\n"), 0o600)
	if _, err := LoadEnvironment(path); err == nil || strings.Contains(err.Error(), "SECRET") {
		t.Errorf("error %v", err)
	}
	if _, err := LoadEnvironment(filepath.Join(directory, "missing.env")); err != nil {
		t.Errorf("a missing file is empty: %v", err)
	}
}
