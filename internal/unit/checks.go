package unit

import (
	"fmt"
	"math"
	"strings"

	s "github.com/mardwerk/unit-generator/internal/schema"
)

func checkEvidence(candidate Candidate, request Request, report reporter) {
	checkCandidateIDs(candidate, report)
	checkDocumentEvidence(candidate, request, report)
	if s.Stringify(s.FromGoValue(candidate.Character)) != s.Stringify(s.FromGoValue(request.Character)) {
		report(checkFinding{
			Category: "conflict", Outcome: "fail", Subject: "character", Rule: "requested-character-scope",
			Message: "Candidate character identity or source scope differs from the request.",
			Action:  act("Preserve the exact requested character identity and scope."),
		})
	}
	checkConstraintCoverage(candidate, request, report)
}

func checkCandidateIDs(c Candidate, report reporter) {
	ids := func(n int, f func(int) string) []string {
		out := make([]string, n)
		for i := range out {
			out[i] = f(i)
		}
		return out
	}
	checkUnique(report, ids(len(c.Paths), func(i int) string { return c.Paths[i].ID }), "paths")
	checkUnique(report, ids(len(c.Abilities), func(i int) string { return c.Abilities[i].ID }), "abilities")
	checkUnique(report, ids(len(c.Mechanics), func(i int) string { return c.Mechanics[i].ID }), "mechanics")
	checkUnique(report, ids(len(c.UnresolvedQuestions), func(i int) string { return c.UnresolvedQuestions[i].ID }), "unresolvedQuestions")
	checkUnique(report, ids(len(c.Sources), func(i int) string { return c.Sources[i].DocumentID }), "sources")
	checkUnique(report, ids(len(c.RepresentativeBuilds), func(i int) string { return c.RepresentativeBuilds[i].Name }), "representativeBuilds")
}

type evidenceContext struct {
	documents keyed[Document]
	decisions map[string]bool
	report    reporter
}

func checkDocumentEvidence(candidate Candidate, request Request, report reporter) {
	documents := index(request.Documents, func(d Document) string { return d.ID })
	decisions := map[string]bool{}
	for _, c := range request.Constraints {
		decisions[c.ID] = true
	}
	for _, d := range request.Documents {
		if d.Kind == "decisions" {
			decisions[d.ID] = true
		}
	}
	bad := checkReferences(s.FromGoValue(candidate), "candidate", evidenceContext{documents, decisions, report})
	if !bad {
		report(checkFinding{
			Category: "evidence", Outcome: "pass", Subject: "candidate", Rule: "known-document-reference",
			Message: "All declared evidence references resolve to supplied documents. This does not verify their claims.",
		})
	}
	cited := false
	for _, source := range candidate.Sources {
		if d, ok := documents.get(source.DocumentID); ok && d.Kind == "source" {
			cited = true
		}
	}
	if !cited {
		report(checkFinding{
			Category: "evidence", Outcome: "unresolved", Subject: "sources", Rule: "source-evidence-coverage",
			Message: "No supplied source document is represented in the candidate source claims.",
			Action:  act("Attach source claims and their limitations."),
		})
	}
}

func checkReferences(value any, subject string, c evidenceContext) bool {
	bad := false
	switch v := value.(type) {
	case []any:
		for i, child := range v {
			if checkReferences(child, fmt.Sprintf("%s[%d]", subject, i), c) {
				bad = true
			}
		}
		return bad
	case *s.Object:
		var references []string
		if evidence, ok := v.Get("evidence"); ok {
			if list, ok := evidence.([]any); ok {
				for _, id := range list {
					references = append(references, id.(string))
				}
			}
		}
		if id, ok := v.Get("documentId"); ok {
			if text, ok := id.(string); ok {
				references = append(references, text)
			}
		}
		for _, id := range references {
			if _, ok := c.documents.get(id); !ok {
				bad = true
				c.report(checkFinding{
					Category: "evidence", Outcome: "fail", Subject: subject, Rule: "known-document-reference",
					Message: "Unknown evidence document " + id + ".",
					Action:  act("Use a supplied document ID or expose the missing evidence."),
				})
			}
		}
		if refs, ok := v.Get("decisionRefs"); ok {
			list, _ := refs.([]any)
			for _, id := range list {
				if !c.decisions[id.(string)] {
					c.report(checkFinding{
						Category: "evidence", Outcome: "fail", Subject: subject, Rule: "known-decision-reference",
						Message: "Unknown binding constraint or decisions document " + id.(string) + ".",
						Action:  act("Reference an explicit supplied decision."),
					})
				}
			}
			if status, _ := v.Get("status"); status == "confirmed" && len(list) == 0 {
				c.report(checkFinding{
					Category: "evidence", Outcome: "fail", Subject: subject, Rule: "confirmed-decision-reference",
					Message: "Confirmed content has no reference to a supplied decision.",
					Action:  act("Supply decision references or mark the content proposed or open."),
				})
			}
		}
		for _, key := range v.Keys() {
			if key == "evidence" || key == "decisionRefs" {
				continue
			}
			child, _ := v.Get(key)
			if checkReferences(child, subject+"."+key, c) {
				bad = true
			}
		}
	}
	return bad
}

func checkConstraintCoverage(candidate Candidate, request Request, report reporter) {
	constraints := map[string]bool{}
	for _, c := range request.Constraints {
		constraints[c.ID] = true
	}
	var coverageIDs []string
	for _, entry := range candidate.ConstraintCoverage {
		coverageIDs = append(coverageIDs, entry.ConstraintID)
	}
	checkUnique(report, coverageIDs, "constraintCoverage")
	for _, entry := range candidate.ConstraintCoverage {
		if !constraints[entry.ConstraintID] {
			report(checkFinding{
				Category: "coverage", Outcome: "fail", Subject: "constraintCoverage", Rule: "declared-constraint-coverage",
				Message: "Coverage references unknown constraint " + entry.ConstraintID + ".",
				Action:  act("Use supplied constraint IDs."),
			})
		}
	}
	for _, constraint := range request.Constraints {
		found := false
		for _, entry := range candidate.ConstraintCoverage {
			if entry.ConstraintID == constraint.ID {
				found = true
			}
		}
		if !found {
			report(checkFinding{
				Category: "coverage", Outcome: "fail", Subject: "constraint." + constraint.ID, Rule: "declared-constraint-coverage",
				Message: "Binding constraint has no coverage entry.",
				Action:  act("Explain where the candidate preserves this constraint."),
			})
		}
	}
	allKnown := true
	distinct := map[string]bool{}
	for _, id := range coverageIDs {
		if !constraints[id] {
			allKnown = false
		}
		distinct[id] = true
	}
	if allKnown && len(coverageIDs) == len(constraints) && len(distinct) == len(constraints) {
		report(checkFinding{
			Category: "coverage", Outcome: "pass", Subject: "constraintCoverage", Rule: "declared-constraint-coverage",
			Message: "Every binding constraint is referenced exactly once. Textual or semantic preservation is not established by this check.",
		})
	}
}

// ---- dependencies ----

func checkDependencies(candidate Candidate, request Request, report reporter) {
	documents := index(request.Documents, func(d Document) string { return d.ID })
	abilities := index(candidate.Abilities, func(a Ability) string { return a.ID })
	mechanicsIndex := index(candidate.Mechanics, func(m Mechanic) string { return m.ID })
	paths := index(candidate.Paths, func(p CandidatePath) string { return p.ID })
	checkMechanicReferences(candidate.BasicAttack.MechanicIDs, "basicAttack", mechanicsIndex, report)
	for _, mechanic := range candidate.Mechanics {
		for _, dependency := range mechanic.Dependencies {
			if _, ok := mechanicsIndex.get(dependency); !ok {
				report(checkFinding{
					Category: "missing_specification", Outcome: "fail", Subject: "mechanic." + mechanic.ID, Rule: "mechanic-dependency",
					Message: "Required mechanic " + dependency + " is absent.", Action: act("Declare the required mechanic."),
				})
			}
		}
		if mechanic.Status != "specified" {
			category := "missing_specification"
			if mechanic.Status == "unsupported" {
				category = "unsupported"
			}
			action := "Resolve the mechanic definition or capability gap."
			if mechanic.RequiredDecision != nil {
				action = *mechanic.RequiredDecision
			}
			evidence := []string{}
			for _, id := range mechanic.Evidence {
				if _, ok := documents.get(id); ok {
					evidence = append(evidence, id)
				}
			}
			report(checkFinding{
				Category: category, Outcome: "unresolved", Subject: "mechanic." + mechanic.ID, Rule: "declared-mechanic-support",
				Message: "Mechanic is declared " + mechanic.Status + "; its behavior is not mechanically validated.",
				Action:  act(action), Evidence: evidence,
			})
		}
		if mechanic.Status == "specified" {
			hasRule := false
			for _, id := range mechanic.Evidence {
				if d, ok := documents.get(id); ok && d.Kind == "rules" {
					hasRule = true
				}
			}
			if !hasRule {
				report(checkFinding{
					Category: "evidence", Outcome: "unresolved", Subject: "mechanic." + mechanic.ID, Rule: "specified-mechanic-evidence",
					Message: "A mechanic marked specified has no supplied rules document reference.",
					Action:  act("Cite the rule or classify the behavior as unresolved."),
				})
			}
		}
	}
	for _, path := range candidate.Paths {
		var tierNumbers []int
		for _, tier := range path.Tiers {
			tierNumbers = append(tierNumbers, tier.Tier)
		}
		checkUnique(report, tierNumbers, "path."+path.ID+".tiers")
		for _, tier := range path.Tiers {
			checkUnique(report, tier.AbilityIDs, fmt.Sprintf("path.%s.tier.%d.abilityIds", path.ID, tier.Tier))
			for _, id := range tier.AbilityIDs {
				ability, ok := abilities.get(id)
				if !ok {
					report(checkFinding{
						Category: "coverage", Outcome: "fail", Subject: fmt.Sprintf("path.%s.tier.%d", path.ID, tier.Tier), Rule: "ability-assignment",
						Message: "Unknown ability " + id + ".", Action: act("Declare the assigned ability."),
					})
				} else if ability.Placement != "upgrade" || ability.PathID == nil || *ability.PathID != path.ID || ability.Tier == nil || *ability.Tier != tier.Tier {
					report(checkFinding{
						Category: "conflict", Outcome: "fail", Subject: "ability." + id, Rule: "ability-assignment",
						Message: "Tier assignment disagrees with the ability placement.",
						Action:  act("Use the same path and tier in both declarations."),
					})
				}
			}
		}
	}
	for _, ability := range candidate.Abilities {
		if ability.Placement != "reserved" && ability.Placement != "omitted" {
			checkMechanicReferences(ability.MechanicIDs, "ability."+ability.ID, mechanicsIndex, report)
		}
		if ability.Placement == "conditional" {
			report(checkFinding{
				Category: "scope", Outcome: "not_checked", Subject: "ability." + ability.ID, Rule: "conditional-ability-availability",
				Message: "This ability has a non-tier unlock described in text. Its availability and readiness were not executed.",
				Action:  act("Review the supplied unlock conditions and their effects on dependent abilities."),
			})
		}
		for _, id := range ability.PrerequisiteAbilityIDs {
			if _, ok := abilities.get(id); !ok {
				report(checkFinding{
					Category: "missing_specification", Outcome: "fail", Subject: "ability." + ability.ID, Rule: "ability-prerequisite",
					Message: "Required ability " + id + " is absent.", Action: act("Declare or remove this prerequisite."),
				})
			}
		}
		if ability.Placement == "upgrade" {
			pathID := ""
			if ability.PathID != nil {
				pathID = *ability.PathID
			}
			assigned := false
			if path, ok := paths.get(pathID); ok {
				for _, tier := range path.Tiers {
					if ability.Tier != nil && tier.Tier == *ability.Tier {
						for _, id := range tier.AbilityIDs {
							if id == ability.ID {
								assigned = true
							}
						}
						break
					}
				}
			}
			if !assigned {
				report(checkFinding{
					Category: "coverage", Outcome: "fail", Subject: "ability." + ability.ID, Rule: "ability-assignment",
					Message: "Upgrade ability has no matching path tier assignment.", Action: act("Assign the ability to a declared path tier."),
				})
			}
		} else if ability.PathID != nil || ability.Tier != nil {
			report(checkFinding{
				Category: "conflict", Outcome: "fail", Subject: "ability." + ability.ID, Rule: "ability-assignment",
				Message: "Only upgrade abilities may specify a path and tier.",
				Action:  act("Set pathId and tier to null for other placements."),
			})
		}
	}
	mechanicGraph := index(candidate.Mechanics, func(m Mechanic) string { return m.ID })
	checkCycles(mechanicGraph.keys, func(id string) []string {
		m, _ := mechanicGraph.get(id)
		return m.Dependencies
	}, "mechanic", report)
	checkCycles(abilities.keys, func(id string) []string {
		a, _ := abilities.get(id)
		return a.PrerequisiteAbilityIDs
	}, "ability", report)
}

func checkMechanicReferences(ids []string, subject string, mechanicsIndex keyed[Mechanic], report reporter) {
	checkUnique(report, ids, subject+".mechanicIds")
	for _, id := range ids {
		if _, ok := mechanicsIndex.get(id); !ok {
			report(checkFinding{
				Category: "missing_specification", Outcome: "fail", Subject: subject, Rule: "mechanic-dependency",
				Message: "Referenced mechanic " + id + " is not declared.", Action: act("Declare this mechanic and its support status."),
			})
		}
	}
	if len(ids) == 0 {
		report(checkFinding{
			Category: "missing_specification", Outcome: "unresolved", Subject: subject, Rule: "mechanic-dependency",
			Message: "No mechanic requirements are declared for this behavior.",
			Action:  act("Declare the behavior requirements or explain the unsupported scope."),
		})
	}
}

func checkCycles(keys []string, edges func(string) []string, subject string, report reporter) {
	known := map[string]bool{}
	for _, k := range keys {
		known[k] = true
	}
	visited, active := map[string]bool{}, map[string]bool{}
	var visit func(id string)
	visit = func(id string) {
		if active[id] {
			report(checkFinding{
				Category: "conflict", Outcome: "fail", Subject: subject + "." + id, Rule: "acyclic-dependencies",
				Message: "Declared dependencies form a cycle.", Action: act("Remove the circular requirement."),
			})
			return
		}
		if visited[id] {
			return
		}
		visited[id] = true
		active[id] = true
		if known[id] {
			for _, dependency := range edges(id) {
				visit(dependency)
			}
		}
		delete(active, id)
	}
	for _, id := range keys {
		visit(id)
	}
}

// ---- progression ----

func checkProgression(candidate Candidate, progression *Progression, report reporter) {
	if progression == nil {
		report(checkFinding{
			Category: "missing_specification", Outcome: "not_checked", Subject: "paths", Rule: "declared-progression",
			Message: "No progression configuration was supplied. Path coverage and build legality were not checked.",
			Action:  act("Supply explicit path IDs, tiers and combination limits."),
		})
		return
	}
	checkPathCoverage(candidate, *progression, report)
	if len(candidate.RepresentativeBuilds) == 0 {
		report(checkFinding{
			Category: "coverage", Outcome: "unresolved", Subject: "representativeBuilds", Rule: "representative-build-legality",
			Message: "No representative build was supplied for the progression checks.",
			Action:  act("Provide representative builds with explicit selections for every path."),
		})
	}
	for _, build := range candidate.RepresentativeBuilds {
		checkRepresentativeBuild(build, candidate.Abilities, *progression, report)
	}
}

func checkPathCoverage(candidate Candidate, progression Progression, report reporter) {
	paths := index(candidate.Paths, func(p CandidatePath) string { return p.ID })
	coverage := true
	for _, declared := range progression.Paths {
		actual, ok := paths.get(declared.ID)
		if !ok || !hasExactTiers(actual, declared.Tiers) {
			coverage = false
			tiers := make([]string, len(declared.Tiers))
			for i, t := range declared.Tiers {
				tiers[i] = fmt.Sprint(t)
			}
			report(checkFinding{
				Category: "coverage", Outcome: "fail", Subject: "path." + declared.ID, Rule: "declared-path-tier-coverage",
				Message: fmt.Sprintf("Expected exactly tiers %s for declared path %s.", strings.Join(tiers, ", "), declared.ID),
				Action:  act("Include every declared tier exactly once."),
			})
		}
	}
	for _, path := range candidate.Paths {
		declared := false
		for _, p := range progression.Paths {
			if p.ID == path.ID {
				declared = true
			}
		}
		if !declared {
			coverage = false
			report(checkFinding{
				Category: "coverage", Outcome: "fail", Subject: "path." + path.ID, Rule: "declared-path-tier-coverage",
				Message: "Candidate contains an undeclared path.", Action: act("Use the supplied progression paths."),
			})
		}
	}
	if coverage && len(candidate.Paths) == len(progression.Paths) {
		report(checkFinding{
			Category: "coverage", Outcome: "pass", Subject: "paths", Rule: "declared-path-tier-coverage",
			Message: "The candidate includes exactly the supplied paths and individual tiers.",
		})
	}
}

func hasExactTiers(path CandidatePath, expected []int) bool {
	if len(path.Tiers) != len(expected) {
		return false
	}
	seen := map[int]bool{}
	for _, tier := range path.Tiers {
		found := false
		for _, e := range expected {
			if e == tier.Tier {
				found = true
			}
		}
		if !found {
			return false
		}
		seen[tier.Tier] = true
	}
	return len(seen) == len(expected)
}

// orderedSelections is a JS Map of path ID to tier: first-seen order, last value wins.
type orderedSelections = keyed[BuildSelection]

// ProgressionBuildViolations lists why a representative build breaks the progression.
func ProgressionBuildViolations(build RepresentativeBuild, progression Progression) []string {
	selections := index(build.Selections, func(sel BuildSelection) string { return sel.PathID })
	tierOf := func(id string) int {
		if sel, ok := selections.get(id); ok {
			return sel.Tier
		}
		return 0
	}
	reasons := []string{}
	if len(selections.keys) != len(build.Selections) {
		reasons = append(reasons, "duplicate path selections")
	}
	declared := map[string]bool{}
	for _, p := range progression.Paths {
		declared[p.ID] = true
	}
	unknown := false
	for _, id := range selections.keys {
		if !declared[id] {
			unknown = true
		}
	}
	if len(selections.keys) != len(progression.Paths) || unknown {
		reasons = append(reasons, "selections must include exactly every declared path")
	}
	tiers := make([]int, len(progression.Paths))
	for i, p := range progression.Paths {
		tiers[i] = tierOf(p.ID)
	}
	for _, p := range progression.Paths {
		tier := tierOf(p.ID)
		if tier == 0 {
			continue
		}
		found := false
		for _, t := range p.Tiers {
			if t == tier {
				found = true
			}
		}
		if !found {
			reasons = append(reasons, "undeclared tier for "+p.ID)
		}
	}
	active, total := 0, 0
	for _, t := range tiers {
		if t > 0 {
			active++
		}
		total += t
	}
	if active > progression.MaxActivePaths {
		reasons = append(reasons, "too many active paths")
	}
	if th := progression.MaxPathsAboveTier; th != nil {
		above := 0
		for _, t := range tiers {
			if t > th.Tier {
				above++
			}
		}
		if above > th.Count {
			reasons = append(reasons, "too many paths above the supplied tier threshold")
		}
	}
	if progression.MaxTotalTiers != nil && total > *progression.MaxTotalTiers {
		reasons = append(reasons, "total tiers exceed the supplied limit")
	}
	if progression.AllowedTierCombinations != nil {
		matches := false
		for _, combination := range *progression.AllowedTierCombinations {
			ok := true
			for i, tier := range combination {
				if i >= len(tiers) || tier != tiers[i] {
					ok = false
					break
				}
			}
			if ok {
				matches = true
				break
			}
		}
		if !matches {
			reasons = append(reasons, "combination is not in the explicit allowed list")
		}
	}
	return reasons
}

func checkRepresentativeBuild(build RepresentativeBuild, definitions []Ability, progression Progression, report reporter) {
	reasons := ProgressionBuildViolations(build, progression)
	f := checkFinding{Subject: "build." + build.Name, Rule: "representative-build-legality"}
	if len(reasons) > 0 {
		f.Category, f.Outcome = "conflict", "fail"
		f.Message = "Illegal build: " + strings.Join(reasons, "; ") + "."
		f.Action = act("Revise the selections to satisfy the supplied progression configuration.")
	} else {
		f.Category, f.Outcome = "coverage", "pass"
		f.Message = "This representative selection obeys the supplied structural progression limits; its gameplay semantics are not validated."
	}
	report(f)
	if len(reasons) > 0 {
		return
	}
	selections := index(build.Selections, func(sel BuildSelection) string { return sel.PathID })
	abilities := index(definitions, func(a Ability) string { return a.ID })
	owned := func(a Ability, ok bool) bool {
		if !ok {
			return false
		}
		if a.Placement == "innate" {
			return true
		}
		if a.Placement != "upgrade" {
			return false
		}
		pathID := ""
		if a.PathID != nil {
			pathID = *a.PathID
		}
		purchased := 0.0
		if sel, ok := selections.get(pathID); ok {
			purchased = float64(sel.Tier)
		}
		required := math.Inf(1)
		if a.Tier != nil {
			required = float64(*a.Tier)
		}
		return purchased >= required
	}
	for _, ability := range definitions {
		if !owned(abilities.get(ability.ID)) {
			continue
		}
		for _, id := range ability.PrerequisiteAbilityIDs {
			prerequisite, ok := abilities.get(id)
			if !ok || owned(prerequisite, ok) {
				continue
			}
			message := "The build owns this ability without prerequisite " + prerequisite.ID + ". Conditional readiness requires review."
			if prerequisite.Placement == "conditional" {
				message = "The build owns this ability, but availability of conditional prerequisite " + prerequisite.ID + " cannot be determined by this structural check."
			}
			report(checkFinding{
				Category: "missing_specification", Outcome: "unresolved", Subject: "build." + build.Name + ".ability." + ability.ID, Rule: "build-ability-prerequisite",
				Message: message,
				Action:  act("Explain the immediate benefit, conditional availability, or a progression correction."),
			})
		}
	}
}
