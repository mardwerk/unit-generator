package unit

import (
	"fmt"

	m "github.com/mardwerk/unit-generator/internal/mechanics"
	s "github.com/mardwerk/unit-generator/internal/schema"
)

// ParseDraft validates a draft artifact value.
func ParseDraft(value any) (Draft, error) {
	var d Draft
	return d, s.ParseInto(DraftSchema, value, &d)
}

// CheckDraft runs the deterministic checks. Findings keep their emitted order.
// Natural-language semantics require a separate review.
func CheckDraft(input Draft) (Checked, error) {
	draft, err := ParseDraft(s.FromGoValue(input))
	if err != nil {
		return Checked{}, err
	}
	if err := VerifyPrepared(draft.Prepared); err != nil {
		return Checked{}, err
	}
	candidate := draft.Candidate
	request := draft.Prepared.Request
	findings := []Finding{}
	report := func(f checkFinding) {
		evidence := f.Evidence
		if evidence == nil {
			evidence = []string{}
		}
		findings = append(findings, Finding{
			ID: fmt.Sprintf("deterministic.%d", len(findings)+1), Method: "deterministic",
			Category: f.Category, Severity: severity(f.Outcome), Outcome: f.Outcome, Subject: f.Subject,
			Rule: f.Rule, Message: f.Message, Evidence: evidence, Action: f.Action,
		})
	}
	if definition := request.MechanicsDefinition; definition != nil {
		var issues []m.Issue
		if candidate.Blueprint == nil {
			issues = []m.Issue{{Path: "blueprint", Message: "A typed blueprint is required by this mechanics definition."}}
		} else {
			issues = ValidateBlueprintRequest(*candidate.Blueprint, request)
		}
		if candidate.Blueprint != nil && len(issues) == 0 {
			compiled, err := CompileBlueprint(*candidate.Blueprint, request)
			if err != nil {
				return Checked{}, err
			}
			if s.Stringify(s.FromGoValue(compiled)) != s.Stringify(s.FromGoValue(candidate)) {
				issues = append(issues, m.Issue{Path: "candidate", Message: "The readable candidate differs from its compiled blueprint. Recompile it instead of editing derived fields."})
			}
		}
		if candidate.Blueprint != nil && len(issues) == 0 && draft.Run.DesignEvaluation != nil {
			evaluation, err := EvaluateUnitDesign(*candidate.Blueprint, draft.Run.DesignPlan, *definition)
			if err != nil {
				return Checked{}, err
			}
			if s.Canonical(draft.Run.DesignEvaluation) != s.Canonical(evaluation) {
				issues = append(issues, m.Issue{Path: "run.designEvaluation", Message: "The retained purchase evidence differs from the blueprint and plan. Recompute it instead of editing derived comparisons."})
			}
		}
		if len(issues) > 0 {
			for _, issue := range issues {
				report(checkFinding{Category: "conflict", Outcome: "fail", Subject: issue.Path, Rule: "typed-mechanics", Message: issue.Message, Action: act("Correct the blueprint and compile again.")})
			}
		} else {
			report(checkFinding{
				Category: "coverage", Outcome: "pass", Subject: "blueprint", Rule: "typed-mechanics",
				Message: fmt.Sprintf("All %d legal builds resolve with valid stats, purchase gates, scoped boosts and matching compiled output. This does not simulate combat or certify balance.", len(m.AllLegalBuilds(*definition))),
			})
		}
		if len(issues) == 0 && candidate.Blueprint != nil && draft.Run.DesignPlan != nil && draft.Run.DesignPlan.UpgradeIntents != nil {
			for _, issue := range PlanIntentIssues(*candidate.Blueprint, draft.Run.DesignPlan.UpgradeIntents, *definition) {
				report(checkFinding{
					Category: "conflict", Outcome: "fail", Subject: issue.Path, Rule: "planned-upgrade-intent", Message: issue.Message,
					Action: act("Implement the retained typed upgrade promise and compile again. This check does not assess prose, source interpretation or tactical value."),
				})
			}
		}
	}
	checkEvidence(candidate, request, report)
	checkDependencies(candidate, request, report)
	checkProgression(candidate, request.Progression, report)
	hasRules := false
	for _, d := range request.Documents {
		if d.Kind == "rules" {
			hasRules = true
		}
	}
	if !hasRules {
		report(checkFinding{
			Category: "missing_specification", Outcome: "unresolved", Subject: "request.documents", Rule: "supplied-game-rules",
			Message: "No game rules document was supplied.", Action: act("Supply governing rules before approving behavior."),
		})
	}
	scope := "Deterministic checks cover references, assignments, dependencies and supplied progression constraints. They do not execute gameplay, establish semantic decision preservation, determine combat balance or grant acceptance."
	if request.MechanicsDefinition != nil {
		scope = "Typed checks resolve every legal upgrade build and verify the compiled candidate. " + scope
	}
	report(checkFinding{Category: "scope", Outcome: "not_checked", Subject: "candidate", Rule: "validation-scope", Message: scope})
	return Checked{SchemaVersion: "1", Kind: "checked", Draft: draft, Findings: findings}, nil
}
