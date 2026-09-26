package main

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mardwerk/unit-generator/src/cli/internal/parity"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

// cli runs one invocation in a scratch runs folder.
func cli(t *testing.T, args ...string) (string, string, error) {
	t.Helper()
	var stdout, stderr bytes.Buffer
	err := run(context.Background(), args, &stdout, &stderr)
	return stdout.String(), stderr.String(), err
}

func scratch(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("UNIT_RUNS_DIR", filepath.Join(dir, "runs"))
	t.Setenv("UNIT_DATA_DIR", filepath.Join("..", "..", "data"))
	t.Setenv("OPENROUTER_API_KEY", "")
	t.Setenv("OPENROUTER_MODEL", "not a valid model")
	return dir
}

// recordedFiles writes a recorded planned draft and its reviewed Result.
func recordedFiles(t *testing.T, dir string) (string, string) {
	t.Helper()
	entries, _ := parity.Entries("reviewDraft")
	for _, entry := range entries {
		result, ok := parity.Output(entry)
		draft := parity.Get(parity.Arg(entry, 0), "draft")
		if !ok || parity.Get(draft, "candidate", "blueprint") == nil {
			continue
		}
		draftFile, resultFile := filepath.Join(dir, "draft.json"), filepath.Join(dir, "result.json")
		_ = os.WriteFile(draftFile, []byte(s.Stringify(draft)), 0o600)
		_ = os.WriteFile(resultFile, []byte(s.Stringify(result)), 0o600)
		return draftFile, resultFile
	}
	t.Fatal("no recorded review")
	return "", ""
}

func TestOfflineCommandsIgnoreModelSettings(t *testing.T) {
	dir := scratch(t)
	help, _, err := cli(t, "--help")
	if err != nil || !strings.Contains(help, "research NAME") || !strings.Contains(help, "serve") {
		t.Fatalf("help %v", err)
	}
	definition, _, err := cli(t, "definition")
	if err != nil || !strings.Contains(definition, `"id": "btd6-combat-v1"`) {
		t.Fatalf("definition %v", err)
	}
	request := filepath.Join("..", "..", "data", "reference", "dart-monkey.request.json")
	prepared, notes, err := cli(t, "prepare", request, "--profile", "default")
	if err != nil || !strings.Contains(prepared, `"inputHash": "jcs-sha256:`) || strings.Contains(notes, "Note:") {
		t.Fatalf("prepare %v %s", err, notes)
	}
	var value map[string]any
	_ = json.Unmarshal([]byte(prepared), &value)
	if value["request"].(map[string]any)["mechanicsDefinition"] == nil {
		t.Error("the Profile's Definition is missing")
	}
	_, notes, err = cli(t, "prepare", request)
	if err != nil || !strings.Contains(notes, "--profile default") {
		t.Errorf("prepare without a Profile: %v %s", err, notes)
	}
	_ = dir
}

func TestStagesSerializeReloadAndRender(t *testing.T) {
	dir := scratch(t)
	draft, result := recordedFiles(t, dir)
	checked := filepath.Join(dir, "checked.json")
	if _, _, err := cli(t, "check", draft, "-o", checked); err != nil {
		t.Fatal(err)
	}
	inspected, _, err := cli(t, "inspect", checked)
	if err != nil || !strings.Contains(inspected, `"kind": "checked"`) {
		t.Fatalf("inspect %v", err)
	}
	rendered, _, err := cli(t, "render", result)
	if err != nil || !strings.HasPrefix(rendered, "# ") || !strings.Contains(rendered, "Structural checks and model review complete") {
		t.Fatalf("render %v", err)
	}
	detailed, _, err := cli(t, "render", result, "--details")
	if err != nil || !strings.Contains(detailed, "Deterministic checks:") || !strings.Contains(detailed, "## Evidence") {
		t.Fatalf("details %v", err)
	}
	build, _, err := cli(t, "build", result, "--tiers", "5,2,0")
	if err != nil || !strings.Contains(build, `"tierDeltas"`) {
		t.Fatalf("build %v", err)
	}
	if _, _, err := cli(t, "build", result, "--tiers", "5,5,0"); err == nil || !strings.Contains(err.Error(), "path") {
		t.Errorf("illegal build: %v", err)
	}
	saved, _, err := cli(t, "library", "save", result)
	if err != nil {
		t.Fatal(err)
	}
	var entry map[string]any
	_ = json.Unmarshal([]byte(saved), &entry)
	listing, _, _ := cli(t, "library")
	if !strings.Contains(listing, entry["id"].(string)) {
		t.Error("the saved Result is not listed")
	}
	if _, _, err := cli(t, "library", "delete", entry["id"].(string)); err != nil {
		t.Error(err)
	}
}

func TestFailuresLeaveOutputAloneAndNeverOverwrite(t *testing.T) {
	dir := scratch(t)
	draft, _ := recordedFiles(t, dir)
	existing := filepath.Join(dir, "existing.json")
	_ = os.WriteFile(existing, []byte("keep"), 0o600)
	stdout, _, err := cli(t, "check", draft, "-o", existing)
	if err == nil || !strings.Contains(err.Error(), "already exists") || stdout != "" {
		t.Errorf("overwrote: %v", err)
	}
	if content, _ := os.ReadFile(existing); string(content) != "keep" {
		t.Error("existing output changed")
	}
	target := filepath.Join(dir, "new.json")
	stdout, _, err = cli(t, "check", filepath.Join(dir, "missing.json"), "-o", target)
	if err == nil || stdout != "" {
		t.Errorf("missing input: %v", err)
	}
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Error("a failed command wrote its output")
	}
	for _, args := range [][]string{
		{"unknown"},
		{"check"},
		{"render", draft, "--tiers", "5,2,0"},
		{"check", draft, "--details"},
		{"edit", draft},
		{"draft", draft, "--repairs", "3"},
		{"research", "Luffy", "--choice", "0"},
		{"serve", "extra"},
		{"check", draft, "--bogus"},
	} {
		if _, _, err := cli(t, args...); err == nil {
			t.Errorf("%v was accepted", args)
		}
	}
}

func TestModelCommandsNeedAKeyAndReportIt(t *testing.T) {
	dir := scratch(t)
	t.Setenv("OPENROUTER_MODEL", "")
	request := filepath.Join("..", "..", "data", "reference", "dart-monkey.request.json")
	prepared := filepath.Join(dir, "prepared.json")
	if _, _, err := cli(t, "prepare", request, "--profile", "default", "-o", prepared); err != nil {
		t.Fatal(err)
	}
	evidence := filepath.Join(dir, "evidence")
	_, _, err := cli(t, "draft", prepared, "--evidence-dir", evidence)
	if err == nil || !strings.Contains(err.Error(), "needs an API key") {
		t.Fatalf("draft without a key: %v", err)
	}
	runs, _ := os.ReadDir(evidence)
	if len(runs) != 1 {
		t.Fatalf("evidence runs %d", len(runs))
	}
	outcome, _ := os.ReadFile(filepath.Join(evidence, runs[0].Name(), "outcome.json"))
	if !strings.Contains(string(outcome), `"status": "failed"`) {
		t.Errorf("outcome %s", outcome)
	}
	if _, _, err := cli(t, "draft", prepared, "--provider", "codex", "--codex", filepath.Join(dir, "no-codex"), "--timeout", "5"); err == nil || !strings.Contains(err.Error(), "could not start") {
		t.Errorf("codex: %v", err)
	}
}
