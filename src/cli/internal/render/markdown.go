package render

import (
	"fmt"
	"strconv"
	"strings"

	m "github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// Markdown renders an artifact. The compact kit is a reading view; details
// add evidence, reference IDs, build examples and every open finding. The
// JSON artifact stays the complete record.
func Markdown(value any, details bool) (string, error) {
	view, err := ReadView(value)
	if err != nil {
		return "", err
	}
	if details {
		return Detailed(view), nil
	}
	return Compact(view), nil
}

// Compact renders the unit a reader needs first. A unit with typed
// mechanics reads as a unit sheet: the character name and 0-0-0, each
// purchase by build code with its exact numbers, every crosspath build and
// the unsupported mechanics. Checks, usage and open decisions follow in a
// separate section, apart from the unit description.
func Compact(view View) string {
	sh := newSheet(view.Candidate.Blueprint, view.Prepared.Request.MechanicsDefinition)
	if sh == nil {
		return compactProse(view)
	}
	var lines []string
	lines = append(lines, "# "+Escape(view.Candidate.Character.Name), "")
	lines = append(lines, sh.baseSection()...)
	lines = append(lines, sh.pathSections()...)
	lines = append(lines, sh.crosspathSection()...)
	lines = append(lines, sh.unsupportedSection()...)
	lines = append(lines, revisionSection(Revision(view))...)
	lines = append(lines, "---", "")
	lines = append(lines, artifactSection(view, sh)...)
	return strings.Join(lines, "\n")
}

// compactProse renders a unit without typed mechanics from its prose.
func compactProse(view View) string {
	var lines []string
	lines = append(lines, unitIntroduction(view)...)
	lines = append(lines, failedChecks(view.Findings)...)
	lines = append(lines, basicAttack(view.Candidate)...)
	lines = append(lines, upgradePaths(view.Candidate)...)
	lines = append(lines, otherAbilities(view.Candidate)...)
	lines = append(lines, sharedRules(view.Candidate)...)
	lines = append(lines, nextDecisions(view)...)
	lines = append(lines, "Use `render --details` for evidence, reference IDs, build examples and detailed findings.", "")
	return strings.Join(lines, "\n")
}

func (sh *sheet) baseSection() []string {
	base := sh.resolve(m.Selection{}).BaseAttack
	text := "Placement costs " + sh.money(base.Cost) + ". " + strings.Join(sh.attackSentences(base), " ")
	return []string{"## 0-0-0: " + Escape(base.Name), "", Escape(text), ""}
}

func (sh *sheet) pathSections() []string {
	var lines []string
	for _, path := range sh.purchases() {
		lines = append(lines, "## "+path.Position+" path: "+Escape(path.Name), "")
		for _, purchase := range path.Purchases {
			lines = append(lines, "**"+purchase.Code+" "+Escape(purchase.Name)+"** ("+sh.money(purchase.Cost)+"). "+Escape(strings.Join(purchase.Effects, " ")), "")
		}
	}
	return lines
}

func (sh *sheet) crosspathSection() []string {
	crosspaths := sh.crosspaths()
	early, advanced := len(crosspaths.Early), len(crosspaths.Advanced)
	lines := []string{
		"## Crosspaths", "",
		fmt.Sprintf("Code resolves every legal two-path build: %d early builds where both paths stay at their first or second purchase, and %d advanced builds where one path goes further. Each row shows what each path's purchases add to the other and the resulting attack.", early, advanced), "",
		fmt.Sprintf("### Early builds (%d)", early), "",
	}
	lines = append(lines, crosspathTable(crosspaths.Early, sh)...)
	lines = append(lines, fmt.Sprintf("### Advanced builds (%d)", advanced), "")
	return append(lines, crosspathTable(crosspaths.Advanced, sh)...)
}

func crosspathTable(rows []BuildRow, sh *sheet) []string {
	lines := []string{"| Build | Total | Added by the other path | Resulting attack |", "| --- | --- | --- | --- |"}
	for _, row := range rows {
		var added []string
		for _, contribution := range row.Contributions {
			added = append(added, contribution.From+": "+strings.Join(contribution.Changes, ", "))
		}
		result := row.Attack
		if row.Active != "" {
			result += ". Active: " + row.Active
		}
		lines = append(lines, "| "+row.Code+" | "+sh.money(row.Cost)+" | "+Escape(strings.Join(added, "; "))+" | "+Escape(result)+" |")
	}
	return append(lines, "")
}

func (sh *sheet) unsupportedSection() []string {
	var lines []string
	if proposals := sh.blueprint.Proposals; len(proposals) > 0 {
		lines = append(lines, "## Unsupported mechanics", "", "No build grants these; the Definition cannot express them.", "")
		for _, proposal := range proposals {
			lines = append(lines, "- "+Escape(proposal.Name)+": "+Escape(proposal.Reason))
		}
		lines = append(lines, "")
	}
	if reserved := sh.blueprint.ReservedTechniques; len(reserved) > 0 {
		lines = append(lines, "## Reserved techniques", "", "Source techniques left out of this unit.", "")
		for _, technique := range reserved {
			lines = append(lines, "- "+Escape(technique.Name)+": "+Escape(technique.Reason))
		}
		lines = append(lines, "")
	}
	return lines
}

func revisionSection(notes *RevisionNotes) []string {
	if notes == nil {
		return nil
	}
	lines := []string{"## Revision changes", "", "### Mechanics", ""}
	if len(notes.Mechanics) == 0 {
		lines = append(lines, "No purchase, price or unsupported mechanic changed.")
	}
	for _, change := range notes.Mechanics {
		lines = append(lines, "- "+Escape(change))
	}
	lines = append(lines, "", fmt.Sprintf("Resolved differently: %d legal builds", len(notes.ChangedBuilds)))
	if len(notes.ChangedBuilds) > 0 {
		lines[len(lines)-1] += " (" + strings.Join(notes.ChangedBuilds, ", ") + ")"
	}
	lines[len(lines)-1] += "."
	lines = append(lines, "", "### Wording", "")
	if len(notes.Wording) == 0 {
		lines = append(lines, "No names changed.")
	}
	for _, change := range notes.Wording {
		lines = append(lines, "- "+Escape(change))
	}
	return append(lines, "")
}

// artifactSection keeps provenance, checks and open decisions apart from
// the unit description.
func artifactSection(view View, sh *sheet) []string {
	request := view.Prepared.Request
	character := view.Candidate.Character
	rules := []string{}
	for _, document := range request.Documents {
		if document.Kind == "rules" && !strings.HasPrefix(document.ID, "mechanics:") {
			rules = append(rules, document.ID)
		}
	}
	definition := sh.definition
	lines := []string{
		"## About this artifact", "",
		Escape(character.Work) + ". Scope: " + Escape(character.Scope), "",
		Escape(fmt.Sprintf("Definition %s, %s, revision %s", definition.Label, definition.ID, definition.Revision)) + ". Rules: " + Escape(strings.Join(rules, ", ")) + ".", "",
		reviewStatus(view),
		UsageSummaryText(view.Usage),
		"Numbers and prices are proposals. Passing checks shows that the unit follows this Definition's rules, not that it is balanced.",
		"",
	}
	lines = append(lines, failedChecks(view.Findings)...)
	lines = append(lines, nextDecisions(view)...)
	return append(lines, "Use `render --details` for evidence, findings and purchase evidence.", "")
}

func unitIntroduction(view View) []string {
	character := view.Candidate.Character
	return []string{
		"# " + Escape(character.Name),
		"",
		"Proposed Unit design for " + Escape(character.Work) + ". Scope: " + Escape(character.Scope),
		"",
		Escape(view.Candidate.Role),
		"",
		reviewStatus(view),
		UsageSummaryText(view.Usage),
		"This design does not certify runtime behavior or balance. Entry statuses distinguish confirmed choices, proposals and open details.",
		"",
	}
}

func reviewStatus(view View) string {
	if view.Kind == "draft" {
		if view.Candidate.Blueprint != nil {
			return "Draft with checked upgrade mechanics. Independent model review has not run."
		}
		return "Draft only. Structural checks and model review have not run."
	}
	counts := map[string]int{}
	for _, finding := range view.Findings {
		counts[finding.Outcome]++
	}
	stage := "Structural checks complete. Model review has not run."
	if view.Kind == "result" {
		stage = "Structural checks and model review complete."
	}
	return fmt.Sprintf("%s %d failed, %d unresolved, %d not checked.", stage, counts["fail"], counts["unresolved"], counts["not_checked"])
}

func methodName(method string) string {
	if method == "model" {
		return "Model review"
	}
	return "Structural check"
}

func failedChecks(findings []unit.Finding) []string {
	var lines []string
	for _, finding := range findings {
		if needsImmediateAttention(finding) {
			lines = append(lines, "- "+methodName(finding.Method)+", "+Escape(finding.Subject)+": "+prose(&finding.Message, finding.Action))
		}
	}
	if len(lines) == 0 {
		return nil
	}
	return append(append([]string{"## Corrections needed", ""}, lines...), "")
}

func needsImmediateAttention(finding unit.Finding) bool {
	return finding.Outcome != "pass" &&
		(finding.Outcome == "fail" || finding.Severity == "error" || finding.Category == "conflict")
}

func basicAttack(candidate unit.Candidate) []string {
	attack := candidate.BasicAttack
	return []string{
		"## Basic attack",
		"",
		Escape(attack.Name) + " (" + attack.Status + "). " + prose(&attack.Behavior, &attack.Delivery, &attack.Targeting, &attack.Limitations),
		"",
	}
}

func abilityIndex(candidate unit.Candidate) map[string]*unit.Ability {
	index := map[string]*unit.Ability{}
	for i := range candidate.Abilities {
		index[candidate.Abilities[i].ID] = &candidate.Abilities[i]
	}
	return index
}

func upgradePaths(candidate unit.Candidate) []string {
	abilities := abilityIndex(candidate)
	var lines []string
	for _, path := range candidate.Paths {
		lines = append(lines,
			"## "+Escape(path.Name), "",
			Escape(path.Theme), "",
			"| Tier | Upgrade | Effect and restrictions |",
			"| --- | --- | --- |",
		)
		for _, tier := range path.Tiers {
			lines = append(lines, fmt.Sprintf("| %d | %s (%s) | %s |", tier.Tier, Escape(tier.Name), tier.Status, tierEffects(tier, abilities)))
		}
		lines = append(lines, "")
	}
	return lines
}

func tierEffects(tier unit.CandidateTier, abilities map[string]*unit.Ability) string {
	parts := []*string{&tier.Benefit}
	for _, id := range tier.AbilityIDs {
		ability, ok := abilities[id]
		if !ok {
			parts = append(parts, ptr("Assigned ability "+id+" is not declared."))
			continue
		}
		if ability.Name != tier.Name || ability.Status != tier.Status {
			parts = append(parts, ptr(ability.Name+" ("+ability.Status+")."))
		}
		parts = append(parts, abilityProse(*ability, abilities)...)
	}
	return prose(parts...)
}

func otherAbilities(candidate unit.Candidate) []string {
	assigned := map[string]bool{}
	for _, path := range candidate.Paths {
		for _, tier := range path.Tiers {
			for _, id := range tier.AbilityIDs {
				assigned[id] = true
			}
		}
	}
	abilities := abilityIndex(candidate)
	var lines, active, unused []string
	for _, ability := range candidate.Abilities {
		switch {
		case ability.Placement == "reserved" || ability.Placement == "omitted":
			unused = append(unused, "- "+Escape(ability.Name)+" ("+ability.Status+"; "+ability.Placement+"): "+prose(&ability.Description, &ability.Limitations))
		case ability.Placement != "upgrade" || !assigned[ability.ID]:
			placement := ability.Placement
			if placement == "upgrade" {
				placement = "unassigned upgrade"
			}
			active = append(active,
				"### "+Escape(ability.Name)+" ("+ability.Status+"; "+placement+")", "",
				prose(abilityProse(ability, abilities)...), "",
			)
		}
	}
	if len(active) > 0 {
		lines = append(append(lines, "## Forms and other abilities", ""), active...)
	}
	if len(unused) > 0 {
		lines = append(append(append(lines, "## Reserved or omitted choices", ""), unused...), "")
	}
	return lines
}

func abilityProse(ability unit.Ability, abilities map[string]*unit.Ability) []*string {
	parts := []*string{&ability.Description, &ability.Availability, &ability.Delivery, &ability.Targeting, &ability.Limitations}
	if len(ability.PrerequisiteAbilityIDs) > 0 {
		names := make([]string, len(ability.PrerequisiteAbilityIDs))
		for i, id := range ability.PrerequisiteAbilityIDs {
			if prerequisite, ok := abilities[id]; ok {
				names[i] = prerequisite.Name
			} else {
				names[i] = "undeclared ability " + id
			}
		}
		parts = append(parts, ptr("Requires: "+strings.Join(names, ", ")+"."))
	}
	return parts
}

var mechanicStatus = map[string]string{
	"specified":          "specified",
	"unspecified":        "details open",
	"proposed_extension": "proposed rule",
	"unsupported":        "unsupported",
}

func sharedRules(candidate unit.Candidate) []string {
	if len(candidate.Mechanics) == 0 {
		return nil
	}
	lines := []string{
		"## Shared gameplay rules",
		"",
		"These rules include restrictions shared by several upgrades or forms. Open and proposed rules still need decisions.",
		"",
	}
	for _, mechanic := range candidate.Mechanics {
		lines = append(lines, "- "+Escape(mechanic.Name)+" ("+mechanicStatus[mechanic.Status]+"): "+prose(&mechanic.Behavior))
	}
	return append(lines, "")
}

func nextDecisions(view View) []string {
	var decisions []string
	for _, question := range view.Candidate.UnresolvedQuestions {
		decisions = append(decisions, question.Question+" Affects: "+question.Affected)
	}
	for _, mechanic := range view.Candidate.Mechanics {
		if mechanic.RequiredDecision != nil && *mechanic.RequiredDecision != "" {
			decisions = append(decisions, mechanic.Name+": "+*mechanic.RequiredDecision)
		}
	}
	decisions = append(decisions, standaloneOpenFindings(view)...)
	if len(decisions) == 0 {
		return nil
	}
	lines := []string{"## Next decisions", ""}
	seen := map[string]bool{}
	for _, decision := range decisions {
		line := "- " + Escape(decision)
		if !seen[line] {
			seen[line] = true
			lines = append(lines, line)
		}
	}
	return append(lines, "")
}

type findingGroup struct {
	finding  unit.Finding
	subjects []string
}

func standaloneOpenFindings(view View) []string {
	var groups []*findingGroup
	byKey := map[string]*findingGroup{}
	for _, finding := range view.Findings {
		if finding.Outcome == "pass" || needsImmediateAttention(finding) {
			continue
		}
		if finding.Outcome != "unresolved" && finding.Category != "unsupported" {
			continue
		}
		if repeatsMechanicDecision(finding, view.Candidate) {
			continue
		}
		key := s.Stringify([]any{finding.Method, finding.Message, s.FromGoValue(finding.Action)})
		if group, ok := byKey[key]; ok {
			if !contains(group.subjects, finding.Subject) {
				group.subjects = append(group.subjects, finding.Subject)
			}
			continue
		}
		group := &findingGroup{finding: finding, subjects: []string{finding.Subject}}
		byKey[key] = group
		groups = append(groups, group)
	}
	out := make([]string, len(groups))
	for i, group := range groups {
		guidance := []string{}
		for _, part := range []*string{&group.finding.Message, group.finding.Action} {
			if part != nil && *part != "" {
				guidance = append(guidance, *part)
			}
		}
		out[i] = methodName(group.finding.Method) + ", " + strings.Join(group.subjects, "; ") + ": " + strings.Join(guidance, " ")
	}
	return out
}

func repeatsMechanicDecision(finding unit.Finding, candidate unit.Candidate) bool {
	if finding.Method != "deterministic" || (finding.Rule != "declared-mechanic-support" && finding.Rule != unit.UnsupportedMechanicRule) {
		return false
	}
	for _, mechanic := range candidate.Mechanics {
		if finding.Subject == "mechanic."+mechanic.ID &&
			mechanic.RequiredDecision != nil &&
			finding.Action != nil && *finding.Action == *mechanic.RequiredDecision {
			return true
		}
	}
	return false
}

// prose joins the present fields once each. Whole identical fields can
// repeat; action sequences inside a field stay intact.
func prose(parts ...*string) string {
	var fields []string
	for _, part := range parts {
		if part == nil {
			continue
		}
		field := s.Trim(*part)
		if !contains(fields, field) {
			fields = append(fields, field)
		}
	}
	return Escape(strings.Join(fields, " "))
}

func contains(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}

func ptr(value string) *string { return &value }

func itoa(n int) string { return strconv.Itoa(n) }
