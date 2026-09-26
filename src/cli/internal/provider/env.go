package provider

import (
	"bufio"
	"errors"
	"os"
	"strings"
)

// Environment holds settings from the process environment and an optional
// .env file. Process variables take precedence over the file.
type Environment struct {
	file map[string]string
}

// Where a setting came from.
const (
	SourceEnv     = "env"      // the process environment
	SourceEnvFile = "env-file" // the .env file
	SourceNone    = "none"
)

// LoadEnvironment reads path (usually .env in the working directory). A
// missing file is empty. Errors never quote a line, which may hold a key.
func LoadEnvironment(path string) (Environment, error) {
	env := Environment{file: map[string]string{}}
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return env, nil
	}
	if err != nil {
		return env, errors.New("Could not load the local .env file. Check its format and permissions.")
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		// Windows editors often start the file with a byte-order mark,
		// which would otherwise become part of the first name.
		line := strings.TrimSpace(strings.TrimPrefix(scanner.Text(), "\ufeff"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		name, value, ok := strings.Cut(line, "=")
		name = strings.TrimSpace(name)
		if !ok || name == "" || strings.ContainsAny(name, " \t") {
			return Environment{}, errors.New("Could not load the local .env file. Check its format and permissions.")
		}
		env.file[name] = unquote(strings.TrimSpace(value))
	}
	if scanner.Err() != nil {
		return Environment{}, errors.New("Could not load the local .env file. Check its format and permissions.")
	}
	return env, nil
}

func unquote(value string) string {
	if len(value) >= 2 && (value[0] == '"' || value[0] == '\'' || value[0] == '`') {
		if end := strings.IndexByte(value[1:], value[0]); end >= 0 {
			inner := value[1 : end+1]
			if value[0] == '"' {
				inner = strings.ReplaceAll(inner, `\n`, "\n")
			}
			return inner
		}
	}
	// An unquoted value ends at a comment.
	if index := strings.Index(value, " #"); index >= 0 {
		value = value[:index]
	}
	return strings.TrimSpace(value)
}

// Get returns a trimmed setting and its source.
func (e Environment) Get(name string) (string, string) {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value, SourceEnv
	}
	if value := strings.TrimSpace(e.file[name]); value != "" {
		return value, SourceEnvFile
	}
	return "", SourceNone
}

// Value returns a trimmed setting.
func (e Environment) Value(name string) string {
	value, _ := e.Get(name)
	return value
}

// KeyHint shows a recognizable fragment of a long key, as the OpenRouter
// dashboard does ("sk-or-v1-abc...xyz"). Short keys stay hidden.
func KeyHint(key string) *string {
	if len(key) < 32 {
		return nil
	}
	prefix := 3
	if strings.HasPrefix(key, "sk-or-v1-") {
		prefix = 12
	}
	hint := key[:prefix] + "..." + key[len(key)-3:]
	return &hint
}
