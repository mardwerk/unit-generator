// Command mardwerk-unit researches characters and generates, checks,
// reviews and renders Tower Defense units, and serves the local web app.
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/mardwerk/unit-generator/src/cli/internal/render"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

const usage = `mardwerk-unit: Tower Defense units from character research

Usage: mardwerk-unit <command> [input] [options]

Research and generation:
  research NAME            Find a character's sources (Wikipedia, Wikidata,
                           Fandom). No model call. Writes a Sources artifact.
  prepare INPUT            Prepare Sources (with --profile) or a request file
  generate NAME|SOURCES    Research if needed, prepare, draft and check
  author INPUT             Prepare, draft, check and review Sources or a
                           request file
  edit RESULT              Revise a Result with --feedback: redraft, check
                           and review with the previous unit and findings
  draft PREPARED           Draft a unit from a prepared request
  check DRAFT              Run deterministic checks, without a model call
  review CHECKED           Review a checked draft with a fresh model call

Reading and storage:
  render ARTIFACT          Markdown of a draft, checked draft or Result
  build ARTIFACT           Resolve a unit's build at --tiers A,B,C
  inspect FILE             Identify and validate a saved file
  definition               Print the default mechanics Definition
  profiles                 List bundled and saved Profiles
  library [list|save FILE|load ID|delete ID...|migrate]
                           Manage the local library, arranged as
                           WORK/CHARACTER/CHARACTER.STAGE.ID.json; migrate
                           moves records saved before that layout
  serve                    Start the local web app

Options:
  -o, --output FILE        Write a new file; existing files are never replaced
  --profile ID             Profile to prepare under; Sources default to the
                           bundled one, a request file without a Definition
                           needs it to be drafted
  --profiles DIR           Saved Profiles (default: data/profiles)
  --library DIR            Library folder (default: data/runs/library)
  --previous FILE          Prior Result for prepare or author (request files)
  --feedback TEXT          Requested changes for prepare, author or edit
  --provider NAME          openrouter (default) or codex
  --model NAME             Model for the selected provider
  --reasoning LEVEL        low, medium or high; OpenRouter also accepts none
  --timeout SECONDS        Per call (OpenRouter: 120, Codex: 600)
  --codex FILE             Codex executable (default: codex on PATH)
  --evidence-dir DIR       Keep exact model inputs and raw outputs there
  --choice ID              Pick a character when a name is ambiguous
  --tiers A,B,C            Purchased tiers for build, e.g. 5,2,0
  --repairs COUNT          Design repair attempts: 0, 1 (default) or 2
  --details                Include evidence and technical details in render
  --port PORT              Port for serve (default 4317)
  -h, --help               Show this help

Without --output, the artifact goes to stdout and diagnostics to stderr.
Exit 0 means the operation completed, not that every finding passed.
OpenRouter reads OPENROUTER_API_KEY from the environment or ./.env and
defaults to openrouter/free; pass --model for a specific model.
`

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, os.Args[1:], os.Stdout, os.Stderr); err != nil {
		fmt.Fprintf(os.Stderr, "mardwerk-unit: %s\n", errorMessage(err))
		os.Exit(1)
	}
}

func errorMessage(err error) string {
	var model *unit.ModelError
	if errors.As(err, &model) && model.Usage != nil {
		tokens := "unavailable"
		if model.Usage.TotalTokens != nil {
			tokens = s.FormatNumber(*model.Usage.TotalTokens)
		}
		return model.Message + "\nFailed attempt: " + render.FormatCost(model.Usage.CostUSD) + "; tokens: " + tokens + "."
	}
	var invalid *s.Error
	if errors.As(err, &invalid) {
		var lines []string
		for i, issue := range invalid.Issues {
			if i == 12 {
				break
			}
			path := issue.PathString()
			if path == "" {
				path = "input"
			}
			lines = append(lines, path+": "+issue.Message)
		}
		return strings.Join(lines, "\n")
	}
	return err.Error()
}
