package provider

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/BurntSushi/toml"

	s "github.com/mardwerk/unit-generator/internal/schema"
	"github.com/mardwerk/unit-generator/internal/unit"
)

// CodexOptions configure local Codex generation with the user's existing
// Codex login and configuration.
type CodexOptions struct {
	// Executable defaults to codex on PATH.
	Executable string
	// Model and Reasoning override the Codex configuration when set.
	Model, Reasoning string
	// Timeout per call; default 600 s.
	Timeout time.Duration
	// MaxOutputBytes bounds console output and the answer file; default 2,000,000.
	MaxOutputBytes int64
	// ConfigPath is the config.toml Codex loads, inspected to disable its MCP
	// servers. Default: $CODEX_HOME/config.toml or ~/.codex/config.toml.
	ConfigPath string
}

// Codex runs one fresh `codex exec` per call in an empty temporary
// workspace, with a read-only sandbox and every tool disabled.
type Codex struct {
	options       CodexOptions
	mu            sync.Mutex
	model, effort string
}

var _ Observable = (*Codex)(nil)

// NewCodex validates the settings.
func NewCodex(o CodexOptions) (*Codex, error) {
	if o.Executable == "" {
		o.Executable = "codex"
	}
	if o.Timeout == 0 {
		o.Timeout = 600 * time.Second
	}
	if o.MaxOutputBytes == 0 {
		o.MaxOutputBytes = 2_000_000
	}
	if o.ConfigPath == "" {
		home := os.Getenv("CODEX_HOME")
		if home == "" {
			user, _ := os.UserHomeDir()
			home = filepath.Join(user, ".codex")
		}
		o.ConfigPath = filepath.Join(home, "config.toml")
	}
	if o.Timeout <= 0 || o.Timeout.Milliseconds() > 2_147_483_647 || o.MaxOutputBytes <= 0 {
		return nil, codexFailure(&unit.Failure{Code: unit.CodeFailed, Message: "Codex timeout and output limit must be positive bounded integers."})
	}
	return &Codex{options: o, model: o.Model, effort: o.Reasoning}, nil
}

// ID names the model Codex used, once known from its configuration.
func (c *Codex) ID() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	model := c.model
	if model == "" {
		model = "configured-default"
	}
	if c.effort != "" {
		return "codex:" + model + ":reasoning=" + c.effort
	}
	return "codex:" + model
}

// Settings are the evidence settings.
func (c *Codex) Settings() Settings {
	c.mu.Lock()
	defer c.mu.Unlock()
	return Settings{Model: c.model, ReasoningEffort: c.effort, TimeoutMs: c.options.Timeout.Milliseconds(), MaxOutputBytes: c.options.MaxOutputBytes}
}

// Generate runs Codex once and parses its final answer file.
func (c *Codex) Generate(ctx context.Context, request unit.ModelRequest) (unit.ModelResponse, error) {
	return c.GenerateObserved(ctx, request, nil)
}

func codexFailure(f *unit.Failure) *unit.ModelError {
	f.Provider = "Codex"
	return failed(f, nil)
}

// GenerateObserved also passes the bounded answer file to observe, even
// when the process fails.
func (c *Codex) GenerateObserved(ctx context.Context, request unit.ModelRequest, observe Observer) (unit.ModelResponse, error) {
	if ctx.Err() != nil {
		return unit.ModelResponse{}, codexFailure(&unit.Failure{Code: unit.CodeCancelled, Message: "Codex generation was cancelled."})
	}
	config, err := inspectCodexConfig(c.options.ConfigPath)
	if err != nil {
		return unit.ModelResponse{}, err
	}
	c.mu.Lock()
	c.model, c.effort = first(c.options.Model, config.model), first(c.options.Reasoning, config.effort)
	c.mu.Unlock()
	// Filesystem and process errors may quote private paths or source text.
	workspaceFailure := codexFailure(&unit.Failure{Code: unit.CodeFailed, Message: "Codex generation could not use its temporary workspace safely. Check local disk access and retry this stage."})
	directory, err := os.MkdirTemp("", "unit-generator-codex-")
	if err != nil {
		return unit.ModelResponse{}, workspaceFailure
	}
	defer os.RemoveAll(directory)
	workspace := filepath.Join(directory, "workspace")
	schemaFile := filepath.Join(directory, "schema.json")
	output := filepath.Join(directory, "result.json")
	schema := any(request.Schema)
	if request.Schema == nil {
		schema = s.NewObject()
	}
	if os.Mkdir(workspace, 0o700) != nil || os.WriteFile(schemaFile, []byte(s.Stringify(schema)), 0o600) != nil {
		return unit.ModelResponse{}, workspaceFailure
	}
	runErr := c.run(ctx, c.arguments(config.servers, schemaFile, output), workspace, output, request.System+"\n\n"+request.Prompt)
	if observe != nil {
		// Record the bounded final file even when the process failed.
		if content, truncated, ok := readBounded(output, c.options.MaxOutputBytes); ok {
			if err := observe(RawOutput{Content: &content, Truncated: truncated}); err != nil {
				return unit.ModelResponse{}, err
			}
		}
	}
	if runErr != nil {
		return unit.ModelResponse{}, runErr
	}
	result, err := c.readAnswer(output)
	if err != nil {
		return unit.ModelResponse{}, err
	}
	return unit.ModelResponse{Output: result}, nil
}

func first(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

type codexConfig struct {
	servers       []string
	model, effort string
}

func inspectCodexConfig(path string) (codexConfig, error) {
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return codexConfig{}, nil
	}
	// TOML errors can quote lines holding credentials. Never expose them.
	unsafe := codexFailure(&unit.Failure{Code: unit.CodeFailed, Message: "Codex configuration could not be inspected safely. Check that config.toml is valid TOML and under 1 MB."})
	if err != nil || !info.Mode().IsRegular() || info.Size() > 1_000_000 {
		return codexConfig{}, unsafe
	}
	var raw struct {
		Model      any                       `toml:"model"`
		Effort     any                       `toml:"model_reasoning_effort"`
		MCPServers map[string]toml.Primitive `toml:"mcp_servers"`
	}
	metadata, err := toml.DecodeFile(path, &raw)
	if err != nil {
		return codexConfig{}, unsafe
	}
	config := codexConfig{}
	config.model, _ = raw.Model.(string)
	config.effort, _ = raw.Effort.(string)
	// Keys in file order, as Codex reads them.
	seen := map[string]bool{}
	for _, key := range metadata.Keys() {
		if len(key) >= 2 && key[0] == "mcp_servers" && !seen[key[1]] {
			seen[key[1]] = true
			config.servers = append(config.servers, key[1])
		}
	}
	return config, nil
}

var disabledFeatures = []string{
	"shell_tool", "unified_exec", "apps", "plugins", "hooks", "browser_use", "browser_use_external",
	"computer_use", "image_generation", "multi_agent", "multi_agent_v2", "memories", "skill_search", "shell_snapshot",
}

func (c *Codex) arguments(servers []string, schema, output string) []string {
	args := []string{
		"exec", "--ephemeral", "--ignore-rules", "--skip-git-repo-check",
		"--sandbox", "read-only", "--color", "never",
		"--output-schema", schema, "--output-last-message", output,
		"-c", `approval_policy="never"`,
		"-c", `web_search="disabled"`,
		"-c", "project_doc_max_bytes=0",
		"-c", "notify=[]",
		"-c", `developer_instructions="Produce only the requested structured answer from the supplied input. Do not use tools, inspect files, execute commands, browse, or access any external context."`,
		"--enable", "skip_host_skill_discovery",
	}
	for _, feature := range disabledFeatures {
		args = append(args, "--disable", feature)
	}
	// Codex splits override paths on dots without unquoting keys. Quoted
	// names in the TOML value target dotted server names correctly.
	if len(servers) > 0 {
		value := "mcp_servers={"
		for i, server := range servers {
			if i > 0 {
				value += ","
			}
			value += s.Stringify(server) + "={enabled=false}"
		}
		args = append(args, "-c", value+"}")
	}
	if c.options.Reasoning != "" {
		args = append(args, "-c", "model_reasoning_effort="+s.Stringify(c.options.Reasoning))
	}
	if c.options.Model != "" {
		args = append(args, "--model", c.options.Model)
	}
	return append(args, "-")
}

// limitWriter counts console output and discards it; provider output can
// hold secrets.
type limitWriter struct {
	written, limit int64
	exceeded       chan struct{}
	once           sync.Once
}

func (w *limitWriter) Write(p []byte) (int, error) {
	if atomic.AddInt64(&w.written, int64(len(p))) > w.limit {
		w.once.Do(func() { close(w.exceeded) })
	}
	return len(p), nil
}

// run owns the process lifetime, cancellation and output bounds.
func (c *Codex) run(ctx context.Context, args []string, dir, output, prompt string) error {
	command := exec.Command(c.options.Executable, args...)
	command.Dir = dir
	command.Stdin = strings.NewReader(prompt)
	console := &limitWriter{limit: c.options.MaxOutputBytes, exceeded: make(chan struct{})}
	command.Stdout, command.Stderr = console, console
	command.WaitDelay = time.Second
	isolate(command)
	if err := command.Start(); err != nil {
		return codexFailure(&unit.Failure{Code: unit.CodeFailed, Message: "Codex could not start. Install Codex and run codex login before generating."})
	}
	done := make(chan error, 1)
	go func() { done <- command.Wait() }()
	timer := time.NewTimer(c.options.Timeout)
	defer timer.Stop()
	monitor := time.NewTicker(100 * time.Millisecond)
	defer monitor.Stop()
	var failure error
	stop := func(reason error) {
		if failure == nil {
			failure = reason
			terminate(command)
		}
	}
	for {
		select {
		case <-done:
			if failure != nil {
				return failure
			}
			if code := command.ProcessState.ExitCode(); code != 0 {
				status := "unknown"
				if code > 0 {
					status = strconv.Itoa(code)
				}
				return codexFailure(&unit.Failure{Code: unit.CodeFailed, Message: "Codex failed with exit status " + status + ". Check codex login status and the configured model. Provider output was omitted to protect secrets."})
			}
			return nil
		case <-ctx.Done():
			stop(codexFailure(&unit.Failure{Code: unit.CodeCancelled, Message: "Codex generation was cancelled."}))
		case <-timer.C:
			ms := c.options.Timeout.Milliseconds()
			stop(codexFailure(&unit.Failure{Code: unit.CodeLocalTimeout, TimeoutMs: int(ms), Message: "Codex generation timed out at the app's " + seconds(ms) + "-second limit. Retry this stage or choose a faster model."}))
		case <-console.exceeded:
			stop(codexFailure(&unit.Failure{Code: unit.CodeOutputLimit, Message: "Codex process exceeded the configured output limit."}))
		case <-monitor.C:
			if info, err := os.Stat(output); err == nil && info.Size() > c.options.MaxOutputBytes {
				stop(codexFailure(&unit.Failure{Code: unit.CodeOutputLimit, Message: "Codex structured response exceeded the configured output limit."}))
			}
		}
	}
}

func (c *Codex) readAnswer(output string) (any, error) {
	missing := codexFailure(&unit.Failure{Code: unit.CodeOutputInvalid, Message: "Codex did not produce a structured final response. Check the local Codex login and model configuration."})
	info, err := os.Stat(output)
	if err != nil {
		return nil, missing
	}
	if info.Size() > c.options.MaxOutputBytes {
		return nil, codexFailure(&unit.Failure{Code: unit.CodeOutputLimit, Message: "Codex structured response exceeded the configured output limit."})
	}
	content, err := os.ReadFile(output)
	if err != nil {
		return nil, missing
	}
	value, err := s.Decode(content)
	if err != nil {
		return nil, codexFailure(&unit.Failure{Code: unit.CodeOutputInvalid, Message: "Codex returned invalid JSON in its structured final response."})
	}
	return value, nil
}

// readBounded reads at most limit bytes of a file that may not exist.
func readBounded(path string, limit int64) (string, bool, bool) {
	file, err := os.Open(path)
	if err != nil {
		return "", false, false
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return "", false, false
	}
	content, err := io.ReadAll(io.LimitReader(file, limit))
	if err != nil {
		return "", false, false
	}
	return string(content), info.Size() > limit, true
}
