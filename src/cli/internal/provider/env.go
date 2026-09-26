package provider

import (
	"bufio"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"golang.org/x/text/encoding/unicode"
	"golang.org/x/text/transform"
)

// Environment holds settings from the process environment and an optional
// .env file. Process variables take precedence over the file.
type Environment struct {
	file map[string]string
	path string
}

// variableName is what a .env line may assign. Anything else, such as a
// name read in the wrong encoding, is an error rather than a silent miss.
var variableName = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_.-]*$`)

// Where a setting came from.
const (
	SourceEnv     = "env"      // the process environment
	SourceEnvFile = "env-file" // the .env file
	SourceNone    = "none"
)

// LoadEnvironment reads path (usually .env in the working directory). A
// missing file is empty. The file is UTF-8, or UTF-16 with a byte-order
// mark as Windows PowerShell writes it. Errors name the line but never
// quote it, because it may hold a key.
func LoadEnvironment(path string) (Environment, error) {
	env := Environment{file: map[string]string{}}
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return env, nil
	}
	invalid := func(line string) error {
		return errors.New("Could not load the local .env file" + line + ". Check its format, encoding and permissions.")
	}
	if err != nil {
		return env, invalid("")
	}
	defer file.Close()
	if env.path, err = filepath.Abs(path); err != nil {
		env.path = path
	}
	scanner := bufio.NewScanner(transform.NewReader(file, unicode.BOMOverride(unicode.UTF8.NewDecoder())))
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for number := 1; scanner.Scan(); number++ {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		name, value, ok := strings.Cut(line, "=")
		name = strings.TrimSpace(name)
		if !ok || !variableName.MatchString(name) {
			return Environment{}, invalid(" (line " + strconv.Itoa(number) + ")")
		}
		env.file[name] = unquote(strings.TrimSpace(value))
	}
	if scanner.Err() != nil {
		return Environment{}, invalid("")
	}
	return env, nil
}

// File is the absolute path of the .env file that was read, or "" when
// there was none.
func (e Environment) File() string { return e.path }

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
