package render

import (
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// StageRun is the part of a model stage that usage reporting reads.
type StageRun struct {
	ModelID string      `json:"modelId"`
	Usage   *unit.Usage `json:"usage,omitempty"`
}

// StageUsage is one model stage of a revision. Run is nil when the stage has
// not completed. Status "unavailable" marks a stage that ran without a report.
type StageUsage struct {
	Stage  string    `json:"stage"`
	Run    *StageRun `json:"run"`
	Status string    `json:"status,omitempty"`
}

// UsageTotal sums the reported values. Partial means some completed stages
// reported nothing.
type UsageTotal struct {
	Value   *float64 `json:"value"`
	Partial bool     `json:"partial"`
}

// UsageSummary is the reported cost and tokens of one revision.
type UsageSummary struct {
	Stages []StageUsage `json:"stages"`
	Cost   UsageTotal   `json:"cost"`
	Tokens UsageTotal   `json:"tokens"`
}

// SummarizeUsage totals the draft and review stages of one revision. Only
// reported values count; estimates never enter these totals.
func SummarizeUsage(draft, review *unit.Run) UsageSummary {
	stages := []StageUsage{{Stage: "Draft", Run: stageRun(draft)}, {Stage: "Review", Run: stageRun(review)}}
	var costs, tokens []*float64
	for _, stage := range stages {
		if stage.Run == nil {
			continue
		}
		var cost, total *float64
		if stage.Run.Usage != nil {
			cost, total = stage.Run.Usage.CostUSD, stage.Run.Usage.TotalTokens
		}
		costs = append(costs, cost)
		tokens = append(tokens, total)
	}
	return UsageSummary{Stages: stages, Cost: sum(costs), Tokens: sum(tokens)}
}

func stageRun(run *unit.Run) *StageRun {
	if run == nil {
		return nil
	}
	return &StageRun{ModelID: run.ModelID, Usage: run.Usage}
}

func sum(values []*float64) UsageTotal {
	var total *float64
	reported := 0
	for _, value := range values {
		if value == nil {
			continue
		}
		reported++
		if total == nil {
			v := 0.0
			total = &v
		}
		*total += *value
	}
	return UsageTotal{Value: total, Partial: reported < len(values)}
}

// FormatCost formats a reported USD charge.
func FormatCost(value *float64) string {
	if value == nil {
		return "Unavailable"
	}
	if *value > 0 && *value < 0.00000001 {
		return "$" + toExponential(*value, 3) + " USD"
	}
	return "$" + localeNumber(*value, 2, 8) + " USD"
}

func formatTokens(value *float64) string {
	if value == nil {
		return "Unavailable"
	}
	return localeNumber(*value, 0, 3)
}

// UsageSummaryText is the one-line usage statement of a render.
func UsageSummaryText(summary UsageSummary) string {
	if summary.Cost.Value == nil && summary.Tokens.Value == nil {
		return "Cost and token usage unavailable."
	}
	cost := "unavailable"
	if summary.Cost.Value != nil {
		cost = FormatCost(summary.Cost.Value) + partial(summary.Cost.Partial)
	}
	tokens := "Token usage unavailable"
	if summary.Tokens.Value != nil {
		tokens = formatTokens(summary.Tokens.Value) + " tokens" + partial(summary.Tokens.Partial)
	}
	return "Reported cost for this revision: " + cost + "; " + tokens + "."
}

func partial(yes bool) string {
	if yes {
		return " (partial)"
	}
	return ""
}

// StageUsageRows are the labelled values of one stage's usage table.
func StageUsageRows(stage StageUsage) [][2]string {
	usage := &unit.Usage{}
	if stage.Run != nil && stage.Run.Usage != nil {
		usage = stage.Run.Usage
	}
	status := "No completed stage"
	switch {
	case stage.Status == "unavailable":
		status = "Unavailable"
	case stage.Run != nil:
		status = "Completed"
	}
	connection := "Unavailable"
	if stage.Run != nil {
		connection = stage.Run.ModelID
	}
	return [][2]string{
		{"Status", status},
		{"Reported cost", FormatCost(usage.CostUSD)},
		{"Total tokens", formatTokens(usage.TotalTokens)},
		{"Input tokens", formatTokens(usage.InputTokens)},
		{"Output tokens", formatTokens(usage.OutputTokens)},
		{"Reasoning tokens", formatTokens(usage.ReasoningTokens)},
		{"Cached input tokens", formatTokens(usage.CachedInputTokens)},
		{"Actual model", orUnavailable(usage.ActualModel)},
		{"Provider", orUnavailable(usage.Provider)},
		{"Connection", connection},
		{"Generation ID", orUnavailable(usage.GenerationID)},
	}
}

func orUnavailable(value *string) string {
	if value == nil || s.Trim(*value) == "" {
		return "Unavailable"
	}
	return s.Trim(*value)
}
