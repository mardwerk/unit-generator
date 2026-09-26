package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"

	s "github.com/mardwerk/unit-generator/internal/schema"
	"github.com/mardwerk/unit-generator/internal/unit"
)

// TestMain lets the test binary stand in for the codex executable.
func TestMain(m *testing.M) {
	if mode := os.Getenv("FAKE_CODEX_MODE"); mode != "" {
		fakeCodex(mode)
		return
	}
	os.Exit(m.Run())
}

func fakeCodex(mode string) {
	args := os.Args[1:]
	value := func(flag string) string { return args[slices.Index(args, flag)+1] }
	output := value("--output-last-message")
	cwd, _ := os.Getwd()
	_ = os.WriteFile(filepath.Join(os.Getenv("FAKE_CODEX_DIR"), "cwd.txt"), []byte(cwd), 0o600)
	switch mode {
	case "echo":
		prompt, _ := io.ReadAll(os.Stdin)
		schema, _ := os.ReadFile(value("--output-schema"))
		entries, _ := os.ReadDir(cwd)
		files := []string{}
		for _, entry := range entries {
			files = append(files, entry.Name())
		}
		fmt.Println("not the JSON result")
		result, _ := json.Marshal(map[string]any{"args": args, "prompt": string(prompt), "schema": json.RawMessage(schema), "files": files})
		_ = os.WriteFile(output, result, 0o600)
	case "args":
		_, _ = io.ReadAll(os.Stdin)
		result, _ := json.Marshal(map[string]any{"args": args})
		_ = os.WriteFile(output, result, 0o600)
	case "exit7":
		fmt.Fprintln(os.Stderr, "SECRET_CREDENTIAL_TOKEN")
		os.Exit(7)
	case "broken":
		_ = os.WriteFile(output, []byte("{broken"), 0o600)
	case "stdout":
		fmt.Println(`{"looks":"valid"}`)
	case "hang":
		time.Sleep(time.Hour)
	case "flood":
		fmt.Print(strings.Repeat("x", 10000))
		time.Sleep(time.Hour)
	case "bigfile":
		_ = os.WriteFile(output, []byte(strings.Repeat("x", 10000)), 0o600)
	}
	os.Exit(0)
}

var codexRequest = unit.ModelRequest{System: "Use only evidence.", Prompt: "Produce the candidate.", Schema: s.NewObject().Set("type", "object")}

// codex returns a Codex client running the test binary in the given mode.
func codex(t *testing.T, mode string, o CodexOptions) (*Codex, string) {
	t.Helper()
	directory := t.TempDir()
	t.Setenv("FAKE_CODEX_MODE", mode)
	t.Setenv("FAKE_CODEX_DIR", directory)
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	o.Executable = executable
	if o.ConfigPath == "" {
		o.ConfigPath = filepath.Join(directory, "config.toml")
		_ = os.WriteFile(o.ConfigPath, nil, 0o600)
	}
	c, err := NewCodex(o)
	if err != nil {
		t.Fatal(err)
	}
	return c, directory
}

func assertClean(t *testing.T, directory string) {
	t.Helper()
	cwd, err := os.ReadFile(filepath.Join(directory, "cwd.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Dir(string(cwd))); !os.IsNotExist(err) {
		t.Errorf("temporary workspace remains: %v", err)
	}
}

func codexError(t *testing.T, err error, code, message string) {
	t.Helper()
	failure := modelError(t, err)
	if failure.Failure.Code != code || failure.Failure.Provider != "Codex" || failure.Failure.Message != failure.Message || failure.Usage != nil || !strings.Contains(failure.Message, message) {
		t.Errorf("got %s", s.Stringify(s.FromGoValue(failure.Failure)))
	}
	if strings.Contains(failure.Message, "SECRET") {
		t.Error("message leaks console output")
	}
}

func TestCodexRunsIsolatedWithStdinAndReadsOnlyTheFinalFile(t *testing.T) {
	c, directory := codex(t, "echo", CodexOptions{Model: "test-model", Timeout: 5 * time.Second})
	if c.ID() != "codex:test-model" {
		t.Errorf("id %s", c.ID())
	}
	for range 2 {
		response, err := c.Generate(context.Background(), codexRequest)
		if err != nil {
			t.Fatal(err)
		}
		if response.Usage != nil {
			t.Error("Codex reports no usage")
		}
		result := response.Output.(*s.Object)
		prompt, _ := result.Get("prompt")
		schema, _ := result.Get("schema")
		files, _ := result.Get("files")
		if prompt != "Use only evidence.\n\nProduce the candidate." || s.Stringify(schema) != `{"type":"object"}` || len(files.([]any)) != 0 {
			t.Errorf("result %s", s.Stringify(result))
		}
		raw, _ := result.Get("args")
		var args []string
		for _, arg := range raw.([]any) {
			args = append(args, arg.(string))
		}
		for _, arg := range []string{"--ephemeral", "--skip-git-repo-check", "read-only", `approval_policy="never"`, `web_search="disabled"`, "shell_tool", "unified_exec", "test-model"} {
			if !slices.Contains(args, arg) {
				t.Errorf("missing %s", arg)
			}
		}
		if slices.Contains(args, "--ignore-user-config") || args[len(args)-1] != "-" {
			t.Errorf("args %v", args)
		}
		assertClean(t, directory)
	}
}

func TestCodexFailuresHideConsoleOutputAndCleanUp(t *testing.T) {
	c, directory := codex(t, "exit7", CodexOptions{})
	_, err := c.Generate(context.Background(), codexRequest)
	codexError(t, err, unit.CodeFailed, "exit status 7")
	assertClean(t, directory)
	c, directory = codex(t, "broken", CodexOptions{})
	_, err = c.Generate(context.Background(), codexRequest)
	codexError(t, err, unit.CodeOutputInvalid, "invalid JSON")
	assertClean(t, directory)
	c, directory = codex(t, "stdout", CodexOptions{})
	_, err = c.Generate(context.Background(), codexRequest)
	codexError(t, err, unit.CodeOutputInvalid, "did not produce")
	assertClean(t, directory)
	missing, _ := NewCodex(CodexOptions{Executable: "/nonexistent/unit-generator-codex", ConfigPath: "/nonexistent/config.toml"})
	_, err = missing.Generate(context.Background(), codexRequest)
	codexError(t, err, unit.CodeFailed, "could not start")
}

func TestCodexTimeoutCancellationAndLimitsStopTheProcess(t *testing.T) {
	c, directory := codex(t, "hang", CodexOptions{Timeout: 500 * time.Millisecond})
	_, err := c.Generate(context.Background(), codexRequest)
	codexError(t, err, unit.CodeLocalTimeout, "app's 0.5-second limit")
	if f := modelError(t, err).Failure; f.TimeoutMs != 500 || f.HTTPStatus != 0 {
		t.Errorf("failure %v", f)
	}
	assertClean(t, directory)
	c, directory = codex(t, "hang", CodexOptions{Timeout: 5 * time.Second})
	ctx, cancel := context.WithCancel(context.Background())
	time.AfterFunc(300*time.Millisecond, cancel)
	_, err = c.Generate(ctx, codexRequest)
	codexError(t, err, unit.CodeCancelled, "cancelled")
	assertClean(t, directory)
	_, err = c.Generate(ctx, codexRequest)
	codexError(t, err, unit.CodeCancelled, "cancelled")
	c, directory = codex(t, "flood", CodexOptions{MaxOutputBytes: 1000})
	_, err = c.Generate(context.Background(), codexRequest)
	codexError(t, err, unit.CodeOutputLimit, "output limit")
	assertClean(t, directory)
	c, directory = codex(t, "bigfile", CodexOptions{MaxOutputBytes: 1000})
	_, err = c.Generate(context.Background(), codexRequest)
	codexError(t, err, unit.CodeOutputLimit, "output limit")
	assertClean(t, directory)
}

func TestCodexKeepsConfiguredProviderAndDisablesMCPServers(t *testing.T) {
	directory := t.TempDir()
	config := filepath.Join(directory, "config.toml")
	_ = os.WriteFile(config, []byte("model = \"configured-model\"\nmodel_provider = \"private-provider\"\nmodel_reasoning_effort = \"medium\"\n[model_providers.private-provider]\nbase_url = \"https://private.invalid/v1\"\nexperimental_bearer_token = \"SECRET_TOKEN_VALUE\"\n[mcp_servers.docs]\ncommand = \"SECRET_COMMAND_VALUE\"\n[mcp_servers.\"dotted.server\"]\nurl = \"https://private.invalid/mcp\"\n"), 0o600)
	argsOf := func(c *Codex) []string {
		response, err := c.Generate(context.Background(), codexRequest)
		if err != nil {
			t.Fatal(err)
		}
		if regexpPrivate.MatchString(s.Stringify(response.Output)) {
			t.Error("configuration secrets reached the arguments")
		}
		raw, _ := response.Output.(*s.Object).Get("args")
		var args []string
		for _, arg := range raw.([]any) {
			args = append(args, arg.(string))
		}
		return args
	}
	c, _ := codex(t, "args", CodexOptions{ConfigPath: config})
	args := argsOf(c)
	if c.ID() != "codex:configured-model:reasoning=medium" {
		t.Errorf("id %s", c.ID())
	}
	if slices.Contains(args, "--model") || !slices.Contains(args, `mcp_servers={"docs"={enabled=false},"dotted.server"={enabled=false}}`) {
		t.Errorf("args %v", args)
	}
	for _, arg := range args {
		if strings.HasPrefix(arg, "model_reasoning_effort=") {
			t.Errorf("configured effort passed as override: %s", arg)
		}
	}
	override, _ := codex(t, "args", CodexOptions{ConfigPath: config, Model: "override-model", Reasoning: "high"})
	args = argsOf(override)
	if override.ID() != "codex:override-model:reasoning=high" || !slices.Contains(args, "override-model") || !slices.Contains(args, `model_reasoning_effort="high"`) {
		t.Errorf("override %s %v", override.ID(), args)
	}
	_ = os.WriteFile(config, []byte(`token = "SECRET_TOKEN_VALUE" malformed`), 0o600)
	_, err := c.Generate(context.Background(), codexRequest)
	codexError(t, err, unit.CodeFailed, "configuration could not be inspected")
}

var regexpPrivate = regexp.MustCompile(`SECRET_TOKEN_VALUE|SECRET_COMMAND_VALUE|private-provider|private\.invalid`)
