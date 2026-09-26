// Package render turns unit artifacts into reading views: Markdown for the
// CLI and the Lab, usage summaries, and per-tier stat changes.
package render

import (
	"regexp"
	"strings"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// View is the readable content of a draft, checked artifact or Result.
type View struct {
	Kind             string         `json:"kind"`
	Candidate        unit.Candidate `json:"candidate"`
	Prepared         unit.Prepared  `json:"prepared"`
	Findings         []unit.Finding `json:"findings"`
	ResultID         *string        `json:"resultId"`
	ReviewSummary    *string        `json:"reviewSummary"`
	Usage            UsageSummary   `json:"usage"`
	DesignEvaluation *s.Object      `json:"designEvaluation,omitempty"`
}

// ReadView reads a Result, checked artifact or draft, in that order. The
// error is the draft contract's when the value is none of them.
func ReadView(value any) (View, error) {
	if result, err := unit.ParseResult(value); err == nil {
		return View{
			Kind:             "result",
			Candidate:        result.Candidate,
			Prepared:         result.Prepared,
			Findings:         result.Findings,
			ResultID:         &result.ID,
			ReviewSummary:    &result.ReviewSummary,
			Usage:            SummarizeUsage(&result.Run.Draft, &result.Run.Review),
			DesignEvaluation: result.Run.Draft.DesignEvaluation,
		}, nil
	}
	if checked, err := unit.ParseChecked(value); err == nil {
		return View{
			Kind:             "checked",
			Candidate:        checked.Draft.Candidate,
			Prepared:         checked.Draft.Prepared,
			Findings:         checked.Findings,
			Usage:            SummarizeUsage(&checked.Draft.Run, nil),
			DesignEvaluation: checked.Draft.Run.DesignEvaluation,
		}, nil
	}
	draft, err := unit.ParseDraft(value)
	if err != nil {
		return View{}, err
	}
	return View{
		Kind:             "draft",
		Candidate:        draft.Candidate,
		Prepared:         draft.Prepared,
		Findings:         []unit.Finding{},
		Usage:            SummarizeUsage(&draft.Run, nil),
		DesignEvaluation: draft.Run.DesignEvaluation,
	}, nil
}

var (
	markdownSyntax = regexp.MustCompile("[\\\\`*_\\[\\]{}|#!]")
	lineBreaks     = regexp.MustCompile(`[\r\n]+`)
	htmlEscapes    = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;")
)

// Escape keeps candidate prose as text: never HTML, links or Markdown
// instructions, and never more than one line.
func Escape(value string) string {
	value = htmlEscapes.Replace(value)
	value = markdownSyntax.ReplaceAllString(value, `\$0`)
	return lineBreaks.ReplaceAllString(value, " ")
}
