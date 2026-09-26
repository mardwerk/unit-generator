package render

import (
	"fmt"
	"strings"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

// Detailed renders the full reading view: purchases, usage, abilities,
// mechanics, review counts, open findings and evidence.
func Detailed(view View) string {
	var lines []string
	lines = append(lines, describeUnit(view)...)
	lines = append(lines, describePurchases(view)...)
	lines = append(lines, describeUsage(view)...)
	lines = append(lines, describeAbilities(view)...)
	lines = append(lines, describeMechanics(view)...)
	lines = append(lines, describeReview(view)...)
	lines = append(lines, describeEvidence(view)...)
	return strings.Join(lines, "\n") + "\n"
}

func describeUnit(view View) []string {
	candidate, prepared := view.Candidate, view.Prepared
	result := "Intermediate artifact."
	if view.ResultID != nil && *view.ResultID != "" {
		result = "Result: `" + *view.ResultID + "`."
	}
	lines := []string{
		"# " + Escape(candidate.Character.Name),
		"",
		"Authoring candidate for " + Escape(candidate.Character.Work) + ". Scope: " + Escape(candidate.Character.Scope),
		"",
		"Input: `" + prepared.InputHash + "`. " + result,
		"",
		Escape(candidate.Role),
		"",
	}
	if candidate.Blueprint != nil && candidate.Blueprint.ReferencePattern != nil {
		pattern := candidate.Blueprint.ReferencePattern
		lines = append(lines,
			"Recorded reference pattern: "+Escape(pattern.ID)+", version "+Escape(pattern.Version)+". Initial numerical mechanics and prices came from this fixed proposed pattern. This is authoring history, not proof that external edits preserved those mechanics or that the design is balanced.",
			"")
	}
	attack := candidate.BasicAttack
	lines = append(lines,
		"## Basic attack", "",
		Escape(attack.Name)+" ("+attack.Status+"). "+Escape(attack.Behavior), "",
		"Delivery: "+Escape(attack.Delivery), "",
		"Targeting: "+Escape(attack.Targeting), "",
		"Limits: "+Escape(attack.Limitations), "",
		"## Upgrade paths", "",
	)
	for _, path := range candidate.Paths {
		lines = append(lines,
			"### "+Escape(path.Name), "",
			Escape(path.Theme), "",
			"| Tier | Upgrade | Effect | Status |",
			"| --- | --- | --- | --- |",
		)
		for _, tier := range path.Tiers {
			lines = append(lines, fmt.Sprintf("| %d | %s | %s | %s |", tier.Tier, Escape(tier.Name), Escape(tier.Benefit), tier.Status))
		}
		lines = append(lines, "")
	}
	return lines
}

// field reads a key path from a JSON value; nil when absent.
func field(value any, path ...string) any {
	for _, key := range path {
		object, ok := value.(*s.Object)
		if !ok {
			return nil
		}
		value, _ = object.Get(key)
	}
	return value
}

func list(value any) []any {
	items, _ := value.([]any)
	return items
}

func text(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case float64:
		return s.FormatNumber(v)
	case bool:
		if v {
			return "true"
		}
		return "false"
	case nil:
		return "null"
	}
	return fmt.Sprint(value)
}

func joined(value any, separator string) string {
	items := list(value)
	parts := make([]string, len(items))
	for i, item := range items {
		if item != nil {
			parts[i] = text(item)
		}
	}
	return strings.Join(parts, separator)
}

func measured(value any) string {
	number, ok := value.(float64)
	if !ok {
		return "unavailable"
	}
	return Escape(s.FormatNumber(toPrecision(number, 4)))
}

func describePurchases(view View) []string {
	if view.DesignEvaluation == nil {
		return nil
	}
	evaluation := any(view.DesignEvaluation)
	currency := "currency"
	if definition := view.Prepared.Request.MechanicsDefinition; definition != nil {
		currency = definition.Profile.Currency
	}
	currency = Escape(currency)
	lines := []string{
		"## Purchase evidence",
		"",
		"Calculated from the resolved builds. Throughput assumes eligible targets continuously in reach; group values are capacity upper bounds. These comparisons do not prove balance, source fidelity or player preference.",
		"",
	}
	for _, path := range list(field(evaluation, "paths")) {
		lines = append(lines, "### "+Escape(text(field(path, "name"))), "")
		if claim := field(path, "purchaseClaim"); claim != nil {
			lines = append(lines,
				"Purchase intention: "+Escape(text(field(claim, "buyFor"))),
				"Retained weakness: "+Escape(text(field(claim, "weakness"))),
				"Capstone intention: "+Escape(text(field(claim, "capstoneValue"))),
				"",
			)
		}
		lines = append(lines, "| Purchase | Added "+currency+" | Changed capacities |", "| --- | --- | --- |")
		purchases := append(append([]any{}, list(field(path, "milestones"))...), list(field(path, "crosspaths"))...)
		for _, purchase := range purchases {
			var deltas []string
			if metrics, ok := field(purchase, "metricDeltas").(*s.Object); ok {
				for _, metric := range metrics.Keys() {
					delta, _ := metrics.Get(metric)
					if change, ok := field(delta, "change").(float64); ok && change == 0 {
						continue
					}
					deltas = append(deltas, Escape(metric)+": "+measured(field(delta, "before"))+" → "+measured(field(delta, "after")))
				}
			}
			changed := strings.Join(deltas, "; ")
			if len(deltas) == 0 {
				changed = joined(field(purchase, "capabilityChanges"), "; ")
				if changed == "" {
					changed = "No change in measured capacities."
				}
				changed = Escape(changed)
			}
			lines = append(lines, "| "+joined(field(purchase, "from"), "-")+" → "+joined(field(purchase, "to"), "-")+" | "+measured(field(purchase, "incrementalGold"))+" | "+changed+" |")
		}
		comparison := field(path, "capstoneComparison")
		copies := "an undefined number of"
		if value := field(comparison, "tier4CopiesAtTier5Budget"); value != nil {
			copies = text(value)
		}
		lines = append(lines,
			"",
			"T5 total: "+measured(field(comparison, "tier5", "totalGold"))+" "+currency+". The same budget buys "+copies+" pure T4 copies. Extra copies need extra placement space and target access. Range and active uptime do not add across copies.",
			"",
		)
	}
	return lines
}

func describeUsage(view View) []string {
	lines := []string{
		"",
		"## Generation usage",
		"",
		UsageSummaryText(view.Usage),
		"",
		"Costs are reported USD, not estimates. Partial totals include only reported stages of this revision. Failed or cancelled attempts are excluded; unavailable reports are not zero. Reasoning and cached input tokens are breakdowns, not additional totals.",
		"",
	}
	for _, stage := range view.Usage.Stages {
		lines = append(lines, "### "+stage.Stage, "", "| Metric | Reported value |", "| --- | --- |")
		for _, row := range StageUsageRows(stage) {
			lines = append(lines, "| "+row[0]+" | "+Escape(row[1])+" |")
		}
		lines = append(lines, "")
	}
	return lines
}

func describeAbilities(view View) []string {
	if len(view.Candidate.Abilities) == 0 {
		return nil
	}
	lines := []string{"## Abilities", ""}
	for _, ability := range view.Candidate.Abilities {
		assignment := "No single path assignment"
		if ability.PathID != nil {
			tier := "unspecified"
			if ability.Tier != nil {
				tier = itoa(*ability.Tier)
			}
			assignment = *ability.PathID + ", tier " + tier
		}
		prerequisites := strings.Join(ability.PrerequisiteAbilityIDs, ", ")
		if prerequisites == "" {
			prerequisites = "None declared"
		}
		lines = append(lines,
			"### "+Escape(ability.Name), "",
			ability.Status+"; "+ability.Placement+". "+Escape(ability.Description), "",
			"Assignment: "+Escape(assignment)+". Prerequisites: "+Escape(prerequisites)+".", "",
			"Availability: "+Escape(ability.Availability), "",
			"Delivery: "+Escape(ability.Delivery), "",
			"Targeting: "+Escape(ability.Targeting), "",
			"Limits: "+Escape(ability.Limitations), "",
		)
	}
	return lines
}

func describeMechanics(view View) []string {
	lines := []string{
		"## Mechanics",
		"",
		"| Mechanic | Status | Behavior | Required decision |",
		"| --- | --- | --- | --- |",
	}
	for _, mechanic := range view.Candidate.Mechanics {
		decision := ""
		if mechanic.RequiredDecision != nil {
			decision = *mechanic.RequiredDecision
		}
		lines = append(lines, "| "+Escape(mechanic.Name)+" | "+mechanic.Status+" | "+Escape(mechanic.Behavior)+" | "+Escape(decision)+" |")
	}
	lines = append(lines, "", "## Representative builds", "", "| Build | Selection | Reason |", "| --- | --- | --- |")
	for _, build := range view.Candidate.RepresentativeBuilds {
		selections := make([]string, len(build.Selections))
		for i, selection := range build.Selections {
			selections[i] = selection.PathID + ": " + itoa(selection.Tier)
		}
		lines = append(lines, "| "+Escape(build.Name)+" | "+Escape(strings.Join(selections, ", "))+" | "+Escape(build.Rationale)+" |")
	}
	return lines
}

func describeReview(view View) []string {
	lines := []string{"", "## Review", ""}
	if view.ReviewSummary != nil && *view.ReviewSummary != "" {
		lines = append(lines, Escape(*view.ReviewSummary), "")
	}
	for _, method := range []string{"deterministic", "model"} {
		counts := map[string]int{}
		for _, finding := range view.Findings {
			if finding.Method == method {
				counts[finding.Outcome]++
			}
		}
		name := "Deterministic checks"
		if method == "model" {
			name = "Model review"
		}
		lines = append(lines, fmt.Sprintf("%s: %d passed, %d failed, %d unresolved, %d not checked.", name, counts["pass"], counts["fail"], counts["unresolved"], counts["not_checked"]), "")
	}
	lines = append(lines,
		"Passing authoring checks does not certify runtime behavior or balance. The JSON artifact retains every finding, including successful checks and their evidence.",
		"",
	)
	var attention []string
	for _, finding := range view.Findings {
		if finding.Outcome == "pass" {
			continue
		}
		action := ""
		if finding.Action != nil {
			action = *finding.Action
		}
		attention = append(attention, "| "+finding.Outcome+" | "+finding.Method+" | "+Escape(finding.Subject)+" | "+Escape(finding.Message+" "+action)+" |")
	}
	if len(attention) > 0 {
		lines = append(lines, "| Outcome | Method | Subject | Finding and next action |", "| --- | --- | --- | --- |")
		lines = append(append(lines, attention...), "")
	}
	return lines
}

func describeEvidence(view View) []string {
	var lines []string
	if questions := view.Candidate.UnresolvedQuestions; len(questions) > 0 {
		lines = append(lines, "## Open questions", "")
		for _, question := range questions {
			lines = append(lines, "- "+Escape(question.Question)+" Affects: "+Escape(question.Affected)+".")
		}
		lines = append(lines, "")
	}
	lines = append(lines, "## Evidence", "", "| ID | Kind | Origin | Access |", "| --- | --- | --- | --- |")
	for _, document := range view.Prepared.Request.Documents {
		note := ""
		if document.Origin.Note != nil {
			note = *document.Origin.Note
		}
		lines = append(lines, "| "+Escape(document.ID)+" | "+document.Kind+" | "+Escape(document.Origin.Location)+" | "+Escape(document.Origin.Access+". "+note)+" |")
	}
	lines = append(lines, "")
	for _, source := range view.Candidate.Sources {
		lines = append(lines, "- "+Escape(source.DocumentID)+": "+Escape(strings.Join(source.Claims, "; "))+" Limits: "+Escape(source.Limitations))
	}
	return lines
}
