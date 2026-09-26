package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/mardwerk/unit-generator/src/cli/internal/evidence"
	"github.com/mardwerk/unit-generator/src/cli/internal/library"
	"github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	"github.com/mardwerk/unit-generator/src/cli/internal/provider"
	"github.com/mardwerk/unit-generator/src/cli/internal/render"
	"github.com/mardwerk/unit-generator/src/cli/internal/research"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/server"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
	"github.com/mardwerk/unit-generator/src/web"
)

// version is set at build time with -ldflags "-X main.version=...".
var version = "dev"

// invocation is one command with its explicit inputs.
type invocation struct {
	command string
	input   string
	extra   []string
	options
	env            provider.Environment
	research       *research.Researcher
	evidence       *evidence.Run
	stdout, stderr io.Writer
}

func run(ctx context.Context, args []string, stdout, stderr io.Writer) error {
	positionals, o, err := parse(args)
	if err != nil {
		return err
	}
	if o.help || len(positionals) == 0 {
		_, err := io.WriteString(stdout, usage)
		return err
	}
	command := positionals[0]
	if _, ok := allowed[command]; !ok {
		return errors.New("Unknown command " + command + ". Run mardwerk-unit --help.")
	}
	if err := o.check(command); err != nil {
		return err
	}
	inputs := positionals[1:]
	switch command {
	case "definition", "profiles", "serve":
		if len(inputs) != 0 {
			return errors.New(command + " takes no input. Run mardwerk-unit --help.")
		}
	case "library":
	default:
		if len(inputs) != 1 {
			return errors.New(command + " needs exactly one input. Run mardwerk-unit --help.")
		}
	}
	env, err := provider.LoadEnvironment(".env")
	if err != nil {
		return err
	}
	in := &invocation{command: command, options: o, env: env, research: research.New(nil), stdout: stdout, stderr: stderr}
	if len(inputs) > 0 {
		in.input, in.extra = inputs[0], inputs[1:]
	}
	if in.output != "" {
		if _, err := os.Lstat(in.output); err == nil {
			return errors.New("Output already exists: " + in.output + ". Choose a new revision filename.")
		}
	}
	artifact, err := in.execute(ctx)
	if in.evidence != nil {
		if err == nil {
			err = in.evidence.Finish(artifact)
		} else {
			_ = in.evidence.Fail(err)
		}
	}
	if err != nil || artifact == nil {
		return err
	}
	content, ok := artifact.(string)
	if !ok {
		content = s.Indent(artifact) + "\n"
	}
	if in.output == "" {
		_, err = io.WriteString(stdout, content)
		return err
	}
	if err := writeNew(in.output, content); err != nil {
		return err
	}
	fmt.Fprintf(stderr, "Wrote %s\n", in.output)
	return nil
}

// writeNew publishes a complete file without replacing an existing one.
func writeNew(path, content string) error {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(absolute), 0o755); err != nil {
		return err
	}
	temporary := filepath.Join(filepath.Dir(absolute), ".mardwerk-unit-"+unit.NewUUID()+".tmp")
	defer os.Remove(temporary)
	if err := os.WriteFile(temporary, []byte(content), 0o600); err != nil {
		return err
	}
	if err := os.Link(temporary, absolute); err != nil {
		if errors.Is(err, os.ErrExist) {
			return errors.New("Output already exists: " + path + ". Choose a new revision filename.")
		}
		return err
	}
	return nil
}

func dataDir() string {
	if dir := os.Getenv("UNIT_DATA_DIR"); dir != "" {
		return dir
	}
	return "data"
}

func runsDir() string {
	if dir := os.Getenv("UNIT_RUNS_DIR"); dir != "" {
		return dir
	}
	return filepath.Join(dataDir(), "runs")
}

func (in *invocation) profiles() (*library.Profiles, error) {
	directory := in.options.profiles
	if directory == "" {
		directory = filepath.Join(dataDir(), "profiles")
	}
	return library.OpenProfiles(directory)
}

func (in *invocation) library() (*library.Library, error) {
	settings := filepath.Join(runsDir(), "lab-settings.json")
	if in.options.library != "" {
		return library.OpenAt(in.options.library, settings)
	}
	return library.Open(settings, filepath.Join(runsDir(), "library"))
}

func (in *invocation) profile() (unit.Profile, error) {
	if in.options.profile == "" {
		return unit.DefaultProfile(), nil
	}
	profiles, err := in.profiles()
	if err != nil {
		return unit.Profile{}, err
	}
	return profiles.Get(in.options.profile)
}

func (in *invocation) repairs() unit.Options {
	return unit.Options{MaxRepairAttempts: in.options.repairs}
}

// model creates the connection and, with --evidence-dir, records it.
func (in *invocation) model(input any) (unit.Model, error) {
	name := in.options.provider
	if name == "" {
		name = "openrouter"
		if in.codex != "" {
			name = "codex"
		}
	}
	var model provider.Observable
	var err error
	switch name {
	case "openrouter":
		if in.codex != "" {
			return nil, errors.New("--codex requires --provider codex.")
		}
		key, _ := in.env.Get("OPENROUTER_API_KEY")
		modelName := in.options.model
		if modelName == "" {
			modelName = in.env.Value("OPENROUTER_MODEL")
		}
		reasoning := in.reasoning
		if reasoning == "" {
			reasoning = in.env.Value("OPENROUTER_REASONING")
		}
		model, err = provider.NewOpenRouter(provider.OpenRouterOptions{APIKey: key, Model: modelName, Reasoning: reasoning, Timeout: in.timeout})
	case "codex":
		if in.reasoning != "" && in.reasoning != "low" && in.reasoning != "medium" && in.reasoning != "high" {
			return nil, errors.New("--reasoning must be one of: low, medium, high.")
		}
		executable := in.codex
		if strings.ContainsAny(executable, `/\`) {
			executable, _ = filepath.Abs(executable)
		}
		model, err = provider.NewCodex(provider.CodexOptions{Executable: executable, Model: in.options.model, Reasoning: in.reasoning, Timeout: in.timeout})
	default:
		return nil, errors.New("--provider must be openrouter or codex.")
	}
	if err != nil {
		return nil, err
	}
	if in.evidenceDir == "" {
		return model, nil
	}
	in.evidence, err = evidence.Start(in.evidenceDir, input, model.Settings())
	if err != nil {
		return nil, err
	}
	fmt.Fprintf(in.stderr, "Evidence: %s\n", in.evidence.Directory)
	return in.evidence.Wrap(model), nil
}

func (in *invocation) execute(ctx context.Context) (any, error) {
	switch in.command {
	case "definition":
		return unit.DefaultAuthoringDefinition(), nil
	case "serve":
		return nil, in.serve(ctx)
	case "profiles":
		profiles, err := in.profiles()
		if err != nil {
			return nil, err
		}
		return profiles.List()
	case "research":
		return in.lookup(ctx, in.input)
	case "prepare":
		prepared, err := in.prepare(ctx, in.input)
		if err == nil && prepared.Request.MechanicsDefinition == nil {
			fmt.Fprintln(in.stderr, "Note: this request has no mechanics Definition, so it cannot be drafted. Prepare it with --profile (for example --profile default).")
		}
		return prepared, err
	case "generate":
		var sources *research.Sources
		if info, err := os.Stat(in.input); err == nil && info.Mode().IsRegular() {
			value, err := research.ReadJSONFile(in.input)
			if err != nil {
				return nil, err
			}
			parsed, err := research.ParseSources(value)
			if err != nil {
				return nil, err
			}
			sources = &parsed
		} else if sources, err = in.lookup(ctx, in.input); err != nil {
			return nil, err
		}
		profile, err := in.profile()
		if err != nil {
			return nil, err
		}
		prepared, err := sources.Prepare(profile)
		if err != nil {
			return nil, err
		}
		model, err := in.model(prepared)
		if err != nil {
			return nil, err
		}
		fmt.Fprintln(in.stderr, "Designing and checking the Unit...")
		draft, err := unit.DraftUnit(ctx, prepared, model, in.repairs())
		if err != nil {
			return nil, err
		}
		return unit.CheckDraft(draft)
	case "author":
		prepared, err := in.prepare(ctx, in.input)
		if err != nil {
			return nil, err
		}
		return in.author(ctx, prepared.Request)
	case "edit":
		value, err := research.ReadJSONFile(in.input)
		if err != nil {
			return nil, err
		}
		result, err := unit.ParseResult(value)
		if err != nil {
			return nil, err
		}
		if err := unit.VerifyPrepared(result.Prepared); err != nil {
			return nil, err
		}
		request := result.Prepared.Request
		request.Previous = &unit.Previous{ResultID: result.ID, Draft: result.Candidate, Findings: result.Findings}
		feedback := in.feedback
		request.Feedback = &feedback
		return in.author(ctx, request)
	}
	value, err := research.ReadJSONFile(in.input)
	if in.command == "library" {
		return in.manageLibrary()
	}
	if err != nil {
		return nil, err
	}
	switch in.command {
	case "draft":
		prepared, err := unit.ParsePrepared(value)
		if err != nil {
			return nil, err
		}
		model, err := in.model(value)
		if err != nil {
			return nil, err
		}
		fmt.Fprintln(in.stderr, "Drafting...")
		return unit.DraftUnit(ctx, prepared, model, in.repairs())
	case "check":
		draft, err := unit.ParseDraft(value)
		if err != nil {
			return nil, err
		}
		return unit.CheckDraft(draft)
	case "review":
		checked, err := unit.ParseChecked(value)
		if err != nil {
			return nil, err
		}
		model, err := in.model(value)
		if err != nil {
			return nil, err
		}
		fmt.Fprintln(in.stderr, "Reviewing...")
		return unit.ReviewDraft(ctx, checked, model, unit.Options{})
	case "render":
		return render.Markdown(value, in.details)
	case "build":
		view, err := render.ReadView(value)
		if err != nil {
			return nil, err
		}
		if err := unit.VerifyPrepared(view.Prepared); err != nil {
			return nil, err
		}
		if view.Candidate.Blueprint == nil || view.Prepared.Request.MechanicsDefinition == nil {
			return nil, errors.New("This Unit has no typed mechanics blueprint. Generate it under a Profile first.")
		}
		var selection mechanics.Selection
		for i, tier := range strings.Split(in.tiers, ",") {
			selection[i], _ = strconv.Atoi(tier)
		}
		return mechanics.ResolveBuild(view.Candidate.Blueprint, selection, *view.Prepared.Request.MechanicsDefinition)
	case "inspect":
		return inspect(value)
	}
	return nil, errors.New("Unknown command " + in.command + ".")
}

// lookup researches a name; an ambiguous name lists the choices.
func (in *invocation) lookup(ctx context.Context, name string) (*research.Sources, error) {
	fmt.Fprintln(in.stderr, "Finding character sources...")
	sources, choices, err := in.research.Character(ctx, name, in.choice)
	if err != nil {
		return nil, err
	}
	if sources == nil {
		var listed []string
		for _, choice := range choices {
			listed = append(listed, strconv.Itoa(choice.ID)+": "+choice.Name+" ("+choice.Description+")")
		}
		return nil, errors.New("Choose a character using --choice ID: " + strings.Join(listed, "; "))
	}
	return sources, nil
}

// prepare reads Sources (prepared under --profile) or a request file.
func (in *invocation) prepare(ctx context.Context, path string) (unit.Prepared, error) {
	value, err := research.ReadJSONFile(path)
	if err != nil {
		return unit.Prepared{}, err
	}
	if object, ok := value.(*s.Object); ok {
		if kind, _ := object.Get("kind"); kind == "sources" {
			if in.previous != "" || in.feedback != "" {
				return unit.Prepared{}, errors.New("--previous and --feedback apply to request files. Revise a Result with edit.")
			}
			sources, err := research.ParseSources(value)
			if err != nil {
				return unit.Prepared{}, err
			}
			profile, err := in.profile()
			if err != nil {
				return unit.Prepared{}, err
			}
			return sources.Prepare(profile)
		}
	}
	fmt.Fprintln(in.stderr, "Loading explicit inputs...")
	file, err := in.research.LoadRequestFile(ctx, path)
	if err != nil {
		return unit.Prepared{}, err
	}
	request := file.Request
	previousFile := file.PreviousResultFile
	if in.previous != "" {
		if previousFile, err = filepath.Abs(in.previous); err != nil {
			return unit.Prepared{}, err
		}
	}
	if previousFile != "" {
		if previous, _ := request.Get("previous"); previous != nil {
			return unit.Prepared{}, errors.New("Supply either previous context or a previous Result file, not both.")
		}
		saved, err := research.ReadJSONFile(previousFile)
		if err != nil {
			return unit.Prepared{}, err
		}
		view, err := render.ReadView(saved)
		if err != nil {
			return unit.Prepared{}, err
		}
		if err := unit.VerifyPrepared(view.Prepared); err != nil {
			return unit.Prepared{}, err
		}
		sum := sha256.Sum256([]byte(s.Stringify(saved)))
		resultID := "artifact:" + hex.EncodeToString(sum[:])
		if view.ResultID != nil {
			resultID = *view.ResultID
		}
		request.Set("previous", s.NewObject().Set("resultId", resultID).Set("draft", s.FromGoValue(view.Candidate)).Set("findings", s.FromGoValue(view.Findings)))
	}
	if in.set["feedback"] {
		request.Set("feedback", in.feedback)
	}
	if in.options.profile != "" {
		typed, err := unit.ParseRequest(request)
		if err != nil {
			return unit.Prepared{}, err
		}
		profile, err := in.profile()
		if err != nil {
			return unit.Prepared{}, err
		}
		return unit.Prepare(s.FromGoValue(unit.ApplyProfile(typed, profile)))
	}
	return unit.Prepare(request)
}

func (in *invocation) author(ctx context.Context, request unit.Request) (unit.Result, error) {
	model, err := in.model(request)
	if err != nil {
		return unit.Result{}, err
	}
	fmt.Fprintln(in.stderr, "Drafting and reviewing...")
	return unit.Author(ctx, s.FromGoValue(request), model, in.repairs())
}

// inspect identifies a file and validates it without printing it back.
func inspect(value any) (any, error) {
	if object, ok := value.(*s.Object); ok && object.Has("kind") {
		artifact, err := library.Inspect(value)
		if err != nil {
			return nil, err
		}
		return s.NewObject().Set("kind", artifact.Kind).Set("valid", true).
			Set("character", s.FromGoValue(artifact.Character())).Set("libraryId", artifact.ID()), nil
	}
	parsed, issues := s.Parse(research.RequestFileSchema, research.WithRequestDefaults(value))
	if len(issues) > 0 {
		return nil, &s.Error{Issues: issues}
	}
	character, _ := parsed.(*s.Object).Get("character")
	return s.NewObject().Set("kind", "request").Set("valid", true).Set("character", character), nil
}

func (in *invocation) manageLibrary() (any, error) {
	lib, err := in.library()
	if err != nil {
		return nil, err
	}
	action := in.input
	switch {
	case action == "" || action == "list":
		if len(in.extra) > 0 {
			return nil, errors.New("library list takes no further input.")
		}
		return lib.State()
	case action == "save" && len(in.extra) == 1:
		value, err := research.ReadJSONFile(in.extra[0])
		if err != nil {
			return nil, err
		}
		return lib.Save(value)
	case action == "load" && len(in.extra) == 1:
		return lib.Load(in.extra[0])
	case action == "delete" && len(in.extra) > 0:
		return lib.Delete(in.extra)
	case action == "migrate" && len(in.extra) == 0:
		return lib.Migrate()
	}
	return nil, errors.New("Use library list, library save FILE, library load ID, library delete ID... or library migrate")
}

// serve runs the web app until interrupted.
func (in *invocation) serve(ctx context.Context) error {
	lib, err := in.library()
	if err != nil {
		return err
	}
	profiles, err := in.profiles()
	if err != nil {
		return err
	}
	var example any
	if value, err := research.ReadJSONFile(filepath.Join(dataDir(), "reference", "dart-monkey.request.json")); err == nil {
		example = research.WithRequestDefaults(value)
	}
	srv, err := server.New(server.Config{
		Env: in.env, Provider: in.options.provider, Model: in.options.model,
		Library: lib, Profiles: profiles, Research: in.research,
		Example: example, Assets: web.Assets(), Version: version,
	})
	if err != nil {
		return err
	}
	url, err := srv.Listen(in.port)
	if err != nil {
		return err
	}
	fmt.Fprintf(in.stdout, "mardwerk-unit is ready: %s\n%s\nKeep this terminal open.\n", url, connectionLines(srv.Provider(), in.env.File()))
	<-ctx.Done()
	return srv.Close()
}

// connectionLines name the model and the OpenRouter key serve uses, the key
// masked as in Settings, so a missing .env or key shows before the page is
// opened. envFile is the .env that was read, or "" when there was none.
func connectionLines(state server.ProviderState, envFile string) string {
	model := state.Model
	if model == "" {
		model = "from the Codex configuration"
	}
	lines := "Model: " + model + " (" + map[string]string{"openrouter": "OpenRouter", "codex": "Local Codex"}[state.Provider] + ")\n"
	key := state.Key
	if !key.Configured {
		if envFile == "" {
			missing, _ := filepath.Abs(".env")
			return lines + "OpenRouter key: none. There is no " + missing + "; add OPENROUTER_API_KEY there, set it in the environment, or enter it in Settings."
		}
		return lines + "OpenRouter key: none. " + envFile + " has no OPENROUTER_API_KEY; add it there, set it in the environment, or enter it in Settings."
	}
	hint := "set (too short to show a fragment)"
	if key.Hint != nil {
		hint = *key.Hint
	}
	source := map[string]string{
		provider.SourceEnvFile: envFile,
		provider.SourceEnv:     "the OPENROUTER_API_KEY environment variable",
	}[key.Source]
	return lines + "OpenRouter key: " + hint + " (from " + source + ")"
}
