package unit

import (
	"errors"
	"fmt"
	"strings"

	m "github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

// ModelRequest is one structured model call.
type ModelRequest struct {
	System string
	Prompt string
	Schema *s.Object
}

var (
	milestoneSchema = UpgradeIntentSchema.Extend(s.F("change", s.String().Trim().Min(1).Max(800)))
	purchaseBranch  = purchaseBranchOf(milestoneSchema)
	// PurchasePlanSchema is the compact plan the model returns: one description
	// and one checkable promise per purchase.
	PurchasePlanSchema = purchasePlanOf(purchaseBranch)
	// purchasePlanSchemaV2 accepts any well-formed promise ID, so a version 2
	// Definition's status effects and detection traits survive expansion;
	// DecodeDesignPlan then holds them to the Definition's vocabulary.
	purchasePlanSchemaV2 = purchasePlanOf(purchaseBranchOf(upgradeIntentSchema(promiseID, promiseID).Extend(s.F("change", s.String().Trim().Min(1).Max(800)))))
	earlyIdentityUnlocks = map[string]bool{"none": true, "camo": true}
)

func purchaseBranchOf(milestone s.Schema) *s.ObjectSchema {
	return planBranch.Omit("crosspaths", "referenceExample").Extend(s.F("milestones", s.StrictObject(
		s.F("tier1", milestone), s.F("tier2", milestone), s.F("tier3", milestone), s.F("tier4", milestone), s.F("tier5", milestone),
	)))
}

func purchasePlanOf(branch s.Schema) *s.ObjectSchema {
	return DesignPlanSchema.Omit("upgradeIntents").Extend(
		s.F("contract", s.Literal("purchase-plan-v1")),
		s.F("paths", s.StrictObject(s.F("path1", branch), s.F("path2", branch), s.F("path3", branch))),
	)
}

// PurchasePlanOutputSchema narrows the compact plan to what the Definition supports.
func PurchasePlanOutputSchema(request *Request) *s.ObjectSchema {
	definition := request.MechanicsDefinition
	if definition == nil {
		return PurchasePlanSchema
	}
	rules, policy := definition.Rules, definition.Profile.DesignPolicy
	pathSchema := func(path string) s.Schema {
		maxPaths := 1
		if policy != nil {
			maxPaths = policy.MaxManualAbilityPaths
		}
		allowsBoost := (policy == nil || !policy.ManualAbilityPath.Null || !policy.ManualAbilityPath.Present) && maxPaths > 0 &&
			(policy == nil || !policy.ManualAbilityPath.Present || policy.ManualAbilityPath.Value == path)
		atTier := func(tier int) s.Schema {
			active := allowsBoost && tier >= rules.ManualBoostUnlockTier
			var unlocks []string
			for _, unlock := range UnlocksFor(definition) {
				ok := true
				switch {
				case unlock == "manual-boost":
					ok = allowsBoost && tier == rules.ManualBoostUnlockTier
				case unlock == "active-follow-up":
					ok = active && tier > rules.ManualBoostUnlockTier && rules.HasExtension("volley-follow-up")
				case tier <= 2 && policy != nil && policy.PreserveEarlyAttackIdentity != nil && *policy.PreserveEarlyAttackIdentity && !earlyIdentityAllowed(definition, unlock):
					ok = false
				case unlock == "distinct-volley":
					ok = rules.HasExtension("distinct-volley")
				case unlock == "follow-up":
					ok = rules.HasExtension("volley-follow-up")
				}
				if ok {
					unlocks = append(unlocks, unlock)
				}
			}
			var improvements []string
			for _, dimension := range ImprovementsFor(definition) {
				if (!strings.HasPrefix(dimension, "active-") || active) && (dimension != "follow-up" || rules.HasExtension("volley-follow-up")) {
					improvements = append(improvements, dimension)
				}
			}
			return milestoneSchema.Extend(s.F("improves", s.Array(s.Enum(improvements...)).Max(4)), s.F("unlock", s.Enum(unlocks...)))
		}
		return purchaseBranch.Extend(s.F("milestones", s.StrictObject(
			s.F("tier1", atTier(1)), s.F("tier2", atTier(2)), s.F("tier3", atTier(3)), s.F("tier4", atTier(4)), s.F("tier5", atTier(5)),
		)))
	}
	return PurchasePlanSchema.Extend(s.F("paths", s.StrictObject(
		s.F("path1", pathSchema("path1")), s.F("path2", pathSchema("path2")), s.F("path3", pathSchema("path3")),
	)))
}

func earlyPurchases(branch *s.Object) string {
	milestones := field(branch, "milestones").(*s.Object)
	change := func(tier string) string { return field(field(milestones, tier).(*s.Object), "change").(string) }
	summary := "Proposed early purchases: " + change("tier1") + " " + change("tier2")
	if s.UTF16Len(summary) <= 800 {
		return summary
	}
	return "Proposed contributions are the side path's first and second purchases. Consult resolved purchase evidence for their actual effects."
}

// ExpandPurchasePlan turns a compact plan into the retained plan shape.
// Other values pass through unchanged.
func ExpandPurchasePlan(output any) (any, error) {
	return expandPurchasePlan(output, PurchasePlanSchema)
}

// ExpandPurchasePlanFor expands a compact plan written under a Definition.
func ExpandPurchasePlanFor(output any, definition *m.Definition) (any, error) {
	if definition != nil && definition.IsV2() {
		return expandPurchasePlan(output, purchasePlanSchemaV2)
	}
	return expandPurchasePlan(output, PurchasePlanSchema)
}

func expandPurchasePlan(output any, schema s.Schema) (any, error) {
	obj, ok := output.(*s.Object)
	if !ok || !obj.Has("contract") || obj.Has("upgradeIntents") {
		return output, nil
	}
	wireValue, issues := s.Parse(schema, output)
	if len(issues) > 0 {
		return nil, &s.Error{Issues: issues}
	}
	wire := wireValue.(*s.Object)
	out := s.NewObject()
	for _, key := range wire.Keys() {
		if key != "contract" && key != "paths" {
			out.Set(key, field(wire, key))
		}
	}
	out.Set("contract", field(wire, "contract"))
	wirePaths := field(wire, "paths").(*s.Object)
	paths := s.NewObject()
	intents := s.NewObject()
	for _, path := range m.PathKeys {
		branch := field(wirePaths, path).(*s.Object)
		expanded := s.NewObject()
		for _, key := range branch.Keys() {
			if key != "milestones" {
				expanded.Set(key, field(branch, key))
			}
		}
		milestones := field(branch, "milestones").(*s.Object)
		texts := s.NewObject()
		pathIntents := s.NewObject()
		for _, tier := range m.TierKeys {
			milestone := field(milestones, tier).(*s.Object)
			texts.Set(tier, field(milestone, "change"))
			pathIntents.Set(tier, s.NewObject().Set("improves", field(milestone, "improves")).Set("unlock", field(milestone, "unlock")))
		}
		expanded.Set("milestones", texts)
		var crosspaths []any
		for _, other := range m.PathKeys {
			if other != path {
				crosspaths = append(crosspaths, s.NewObject().Set("path", other).Set("contribution", earlyPurchases(field(wirePaths, other).(*s.Object))))
			}
		}
		expanded.Set("crosspaths", crosspaths)
		expanded.Set("referenceExample", "The Profile's scale references inform this proposal; the supplied Definition alone authorizes mechanics.")
		paths.Set(path, expanded)
		intents.Set(path, pathIntents)
	}
	out.Set("paths", paths)
	out.Set("upgradeIntents", intents)
	return out, nil
}

// MechanicsPlan is the plan as the mechanics call sees it: decisions once,
// without compatibility bookkeeping.
func MechanicsPlan(plan DesignPlan) *s.Object {
	paths := s.NewObject()
	for index, path := range m.PathKeys {
		branch := plan.Paths.At(index)
		milestones := s.NewObject()
		for tier := 1; tier <= 5; tier++ {
			entry := s.NewObject().Set("change", branch.Milestones.At(tier))
			if plan.UpgradeIntents != nil {
				intent := plan.UpgradeIntents.At(index).At(tier)
				entry.Set("improves", s.FromGoValue(intent.Improves)).Set("unlock", intent.Unlock)
			}
			milestones.Set(m.TierKeys[tier-1], entry)
		}
		paths.Set(path, s.NewObject().
			Set("name", branch.Name).Set("sourceIds", s.FromGoValue(branch.SourceIDs)).Set("buyFor", branch.BuyFor).
			Set("weakness", branch.Weakness).Set("capstoneValue", branch.CapstoneValue).Set("milestones", milestones))
	}
	return s.NewObject().
		Set("concept", plan.Concept).
		Set("signature", s.FromGoValue(plan.Signature)).
		Set("repertoire", s.FromGoValue(plan.Repertoire)).
		Set("base", s.FromGoValue(plan.Base)).
		Set("paths", paths).
		Set("omittedTechniques", s.FromGoValue(plan.OmittedTechniques)).
		Set("scopeLimits", s.FromGoValue(plan.ScopeLimits))
}

func constrainCitations(value any, ids []any) {
	switch node := value.(type) {
	case []any:
		for _, item := range node {
			constrainCitations(item, ids)
		}
	case *s.Object:
		for _, key := range node.Keys() {
			child := field(node, key)
			if childObj, ok := child.(*s.Object); ok && key == "sourceIds" && childObj.Has("items") {
				childObj.Set("items", s.NewObject().Set("type", "string").Set("enum", append([]any(nil), ids...)))
			} else {
				constrainCitations(child, ids)
			}
		}
	}
}

// omitMissing adds key only when value is not a missing (undefined) value.
func setDefined(o *s.Object, key string, value any) {
	if value != nil {
		o.Set(key, value)
	}
}

// previousValue is request.previous?.draft.blueprint ?? request.previous?.draft ?? null.
func previousValue(request *Request) any {
	if request.Previous == nil {
		return nil
	}
	if request.Previous.Draft.Blueprint != nil {
		return s.FromGoValue(request.Previous.Draft.Blueprint)
	}
	return s.FromGoValue(request.Previous.Draft)
}

func previousFindings(request *Request) any {
	if request.Previous == nil {
		return []any{}
	}
	return s.FromGoValue(request.Previous.Findings)
}

func nullableString(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

// DesignPlanRequest is the planning call for a prepared request.
func DesignPlanRequest(prepared Prepared) (ModelRequest, error) {
	request := &prepared.Request
	evidence := AuthorEvidence(request)
	if len(evidence) == 0 {
		return ModelRequest{}, errors.New("Supply character source evidence before planning a Unit.")
	}
	schema := ProviderJSONSchema(PurchasePlanOutputSchema(request))
	ids := make([]any, len(evidence))
	for i, span := range evidence {
		ids[i] = span.ID
	}
	constrainCitations(schema, ids)
	mechanicsID := ""
	if request.MechanicsDefinition != nil {
		mechanicsID = "mechanics:" + request.MechanicsDefinition.ID
	} else {
		mechanicsID = "mechanics:undefined"
	}
	documents := []any{}
	origins := []any{}
	for _, d := range request.Documents {
		if d.Kind != "source" && d.ID != mechanicsID {
			documents = append(documents, s.NewObject().Set("id", d.ID).Set("kind", d.Kind).Set("text", d.Text).Set("origin", s.FromGoValue(d.Origin)))
		}
		if d.Kind == "source" {
			origins = append(origins, s.NewObject().Set("id", d.ID).Set("origin", s.FromGoValue(d.Origin)))
		}
	}
	context := s.NewObject().
		Set("character", s.FromGoValue(request.Character)).
		Set("task", request.Task).
		Set("constraints", s.FromGoValue(request.Constraints))
	if request.MechanicsDefinition != nil {
		context.Set("definition", s.FromGoValue(request.MechanicsDefinition))
	}
	context.
		Set("documents", documents).
		Set("evidenceSpans", s.FromGoValue(evidence)).
		Set("sourceOrigins", origins).
		Set("sourceScope", s.NewObject().
			Set("selectedPassages", float64(len(evidence))).
			Set("availablePassages", float64(len(EvidenceSpans(request)))).
			Set("note", "Selection is bounded. Do not claim exhaustive repertoire coverage.")).
		Set("previous", previousValue(request)).
		Set("previousFindings", previousFindings(request)).
		Set("feedback", nullableString(request.Feedback))
	parts := []string{
		fmt.Sprintf("Requested character: %s. The context below supplies %d selected evidence passages for this character. Read those passages before choosing powers; selection is bounded and does not establish complete source coverage.", s.Stringify(request.Character.Name), len(evidence)),
	}
	guidance := planGuidance
	if isV2(request) {
		guidance = append([]string{}, planGuidance...)
		for i, line := range guidance {
			guidance[i] = strings.Replace(line, "slow and burn each need two primitive changes", "a status effect with a magnitude needs two primitive changes", 1)
		}
		// The vocabulary summary goes before the closing guidance line.
		last := guidance[len(guidance)-1]
		guidance = append(append(guidance[:len(guidance)-1], VocabularyGuidance(request)...), last)
	}
	if d := request.MechanicsDefinition; d != nil && d.Profile.DesignPolicy != nil && d.Profile.DesignPolicy.RequireTier3BehaviorChange != nil && *d.Profile.DesignPolicy.RequireTier3BehaviorChange {
		// The requirement goes before the closing guidance line.
		last := guidance[len(guidance)-1]
		guidance = append(append(append([]string{}, guidance[:len(guidance)-1]...), planTier3Behavior), last)
	}
	parts = append(parts, guidance...)
	parts = append(parts, s.Stringify(context))
	return ModelRequest{System: planSystem, Prompt: strings.Join(parts, "\n\n"), Schema: schema}, nil
}

var earlyIdentityBlocked = map[string]bool{
	"follow-up": true, "distinct-volley": true, "splash": true, "slow": true, "burn": true, "stun": true,
	"delivery-change": true, "damage-type-change": true, "targeting-change": true,
}

// earlyIdentityAllowed reports an unlock that keeps a T1/T2 attack's
// identity: none, or personal detection of a hidden trait.
func earlyIdentityAllowed(d *m.Definition, unlock string) bool {
	if d == nil || !d.IsV2() {
		return earlyIdentityUnlocks[unlock]
	}
	return unlock == "none" || isDetection(d, unlock)
}

// earlyIdentityBreaking reports an unlock that changes a T1/T2 attack's
// identity: a new status, attack pattern, delivery, targeting or damage type.
func earlyIdentityBreaking(d *m.Definition, unlock string) bool {
	if d == nil || !d.IsV2() {
		return earlyIdentityBlocked[unlock]
	}
	if _, ok := d.Vocabulary.Effect(unlock); ok {
		return true
	}
	return earlyIdentityBlocked[unlock] && unlock != "slow" && unlock != "burn" && unlock != "stun"
}

func isDetection(d *m.Definition, id string) bool {
	for _, trait := range d.Vocabulary.Detection {
		if trait.ID == id {
			return true
		}
	}
	return false
}

// DecodeDesignPlan validates a plan's joins and structural choices.
// Source interpretation remains a review obligation.
func DecodeDesignPlan(output any, request *Request) (DesignPlan, error) {
	expanded, err := ExpandPurchasePlanFor(output, request.MechanicsDefinition)
	if err != nil {
		return DesignPlan{}, err
	}
	var plan DesignPlan
	if err := s.ParseInto(DesignPlanAuthoringSchemaFor(request.MechanicsDefinition), expanded, &plan); err != nil {
		return DesignPlan{}, err
	}
	evidence := map[string]EvidenceSpan{}
	for _, span := range AuthorEvidence(request) {
		evidence[span.ID] = span
	}
	var issues []s.Issue
	type selection struct {
		path []any
		ids  []string
	}
	selections := []selection{{[]any{"signature"}, plan.Signature.SourceIDs}, {[]any{"base"}, plan.Base.SourceIDs}}
	for i, entry := range plan.Repertoire {
		selections = append(selections, selection{[]any{"repertoire", i}, entry.SourceIDs})
	}
	for i, key := range m.PathKeys {
		selections = append(selections, selection{[]any{"paths", key}, plan.Paths.At(i).SourceIDs})
	}
	for _, sel := range selections {
		for index, id := range sel.ids {
			if _, ok := evidence[id]; !ok {
				issues = append(issues, s.Issue{Code: "custom", Path: append(append([]any(nil), sel.path...), "sourceIds", index), Message: "Unknown character evidence ID: " + id})
			}
		}
	}
	for i, key := range m.PathKeys {
		selected := map[string]bool{}
		includesSelf := false
		for _, entry := range plan.Paths.At(i).Crosspaths {
			selected[entry.Path] = true
			if entry.Path == key {
				includesSelf = true
			}
		}
		if len(selected) != 2 || includesSelf {
			issues = append(issues, s.Issue{Code: "custom", Path: []any{"paths", key, "crosspaths"}, Message: "Crosspaths must describe exactly the other two paths."})
		}
	}
	var rules *m.Rules
	var policy *m.DesignPolicy
	boostTier := 4
	if d := request.MechanicsDefinition; d != nil {
		rules, policy, boostTier = &d.Rules, d.Profile.DesignPolicy, d.Rules.ManualBoostUnlockTier
	}
	hasExtension := func(name string) bool { return rules != nil && rules.HasExtension(name) }
	activePaths := map[string]bool{}
	for pathIndex, path := range m.PathKeys {
		for number := 1; number <= 5; number++ {
			tier := m.TierKeys[number-1]
			intent := plan.UpgradeIntents.At(pathIndex).At(number)
			issue := func(message string) {
				issues = append(issues, s.Issue{Code: "custom", Path: []any{"upgradeIntents", path, tier}, Message: message})
			}
			needsActive := intent.Unlock == "manual-boost" || intent.Unlock == "active-follow-up"
			improvesFollowUp := false
			for _, d := range intent.Improves {
				if strings.HasPrefix(d, "active-") {
					needsActive = true
				}
				if d == "follow-up" {
					improvesFollowUp = true
				}
			}
			if needsActive {
				activePaths[path] = true
				if number < boostTier {
					issue(fmt.Sprintf("Active improvements require a purchased same-path boost at tier %d or later.", boostTier))
				}
				if policy != nil && policy.ManualAbilityPath.Present && (policy.ManualAbilityPath.Null || policy.ManualAbilityPath.Value != path) {
					if policy.ManualAbilityPath.Null {
						issue("The Definition does not permit manual boosts or active improvements on any path.")
					} else {
						issue(fmt.Sprintf("The Definition permits manual boosts and active improvements only on %s. This path must remain automatic.", policy.ManualAbilityPath.Value))
					}
				}
			}
			if number <= 2 && policy != nil && policy.PreserveEarlyAttackIdentity != nil && *policy.PreserveEarlyAttackIdentity && earlyIdentityBreaking(request.MechanicsDefinition, intent.Unlock) {
				detection := "personal Camo detection"
				if d := request.MechanicsDefinition; d != nil && d.IsV2() {
					detection = "personal detection"
				}
				issue(BuildCode(pathIndex, number) + " must preserve the existing attack identity: the first and second purchase of a path add no new status, attack pattern, delivery, targeting or damage-type access before the third; " + detection + " and improvements to existing effects remain allowed.")
			}
			if intent.Unlock == "manual-boost" && number != boostTier {
				issue(fmt.Sprintf("Manual boost unlocks are supported only at tier %d.", boostTier))
			}
			if intent.Unlock == "active-follow-up" && number < boostTier {
				issue(fmt.Sprintf("Active follow-ups require tier %d or later and a purchased same-path boost.", boostTier))
			}
			if intent.Unlock == "distinct-volley" && !hasExtension("distinct-volley") {
				issue("The Definition does not enable distinct-volley.")
			}
			if (intent.Unlock == "follow-up" || intent.Unlock == "active-follow-up" || improvesFollowUp) && !hasExtension("volley-follow-up") {
				issue("The Definition does not enable volley-follow-up.")
			}
		}
	}
	if policy != nil && len(activePaths) > policy.MaxManualAbilityPaths {
		issues = append(issues, s.Issue{Code: "custom", Path: []any{"upgradeIntents"}, Message: fmt.Sprintf("The plan requires active boosts on %d paths; the Definition permits at most %d.", len(activePaths), policy.MaxManualAbilityPaths)})
	}
	if request.MechanicsDefinition != nil {
		for _, issue := range PlanFeasibilityIssues(plan, *request.MechanicsDefinition) {
			var path []any
			for _, p := range strings.Split(issue.Path, ".") {
				path = append(path, p)
			}
			issues = append(issues, s.Issue{Code: "custom", Path: path, Message: issue.Message})
		}
	}
	if len(issues) > 0 {
		return DesignPlan{}, &s.Error{Issues: issues}
	}
	var historical []string
	historicalSeen := map[string]int{}
	for _, sel := range selections {
		for _, id := range sel.ids {
			context := HistoricalTechniqueContext(request, evidence[id].DocumentID)
			if context == nil {
				continue
			}
			text := fmt.Sprintf("%s: %s. Historical source context does not establish current availability; explicit requested period restrictions still apply.", context.Technique, context.Quote)
			if i, ok := historicalSeen[context.DocumentID]; ok {
				historical[i] = text
			} else {
				historicalSeen[context.DocumentID] = len(historical)
				historical = append(historical, text)
			}
		}
	}
	plan.ScopeLimits = uniqueStrings(append(append([]string{}, plan.ScopeLimits...), historical...))
	if plan.ScopeLimits == nil {
		plan.ScopeLimits = []string{}
	}
	var retained DesignPlan
	retainedSchema := DesignPlanSchema
	if d := request.MechanicsDefinition; d != nil && d.IsV2() {
		retainedSchema = DesignPlanSchemaV2
	}
	if err := s.ParseInto(retainedSchema, s.FromGoValue(plan), &retained); err != nil {
		return DesignPlan{}, err
	}
	return retained, nil
}

// BindDesignPlan binds the plan's labels and citations into mechanics output.
func BindDesignPlan(output any, plan DesignPlan) any {
	obj, ok := output.(*s.Object)
	if !ok {
		return output
	}
	bound := s.Clone(obj).(*s.Object)
	if base, ok := field(bound, "baseAttack").(*s.Object); ok {
		base.Set("name", plan.Base.Name)
	}
	bound.Set("baseSourceIds", s.FromGoValue(plan.Base.SourceIDs))
	if paths, ok := field(bound, "paths").(*s.Object); ok {
		for index, key := range m.PathKeys {
			path, ok := field(paths, key).(*s.Object)
			if !ok {
				continue
			}
			branch := plan.Paths.At(index)
			path.Set("name", branch.Name)
			path.Set("sourceIds", s.FromGoValue(branch.SourceIDs))
			path.Set("theme", branch.BuyFor)
			rationale := branch.Weakness + " " + branch.CapstoneValue
			if s.UTF16Len(rationale) > 300 {
				rationale = branch.BuyFor
			}
			path.Set("rationale", rationale)
		}
	}
	return bound
}
