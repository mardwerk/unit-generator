package unit

import (
	"fmt"
	"regexp"
	"strings"

	m "github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

var nullableEffects = []string{"slow", "burn", "camo", "delivery", "damageType", "targeting", "unlockBoost", "distribution", "followUp", "activeFollowUp"}

// nullableEffectsV2 are a version 2 wire tier's nullable effects; its
// statuses list is grouped per entry.
var nullableEffectsV2 = []string{"detect", "delivery", "damageType", "targeting", "unlockBoost", "distribution", "followUp", "activeFollowUp"}

type subset struct {
	id   string
	keep []string
	tier *s.Object
}

// budgetSubsets lists maximal effect subsets within the budget, or nil when
// the tier fits or the menu would exceed 64 choices.
func budgetSubsets(tier *s.Object, limit int) []subset {
	type group struct {
		id   string
		cost int
	}
	var groups []group
	for i := range field(tier, "statChanges").([]any) {
		groups = append(groups, group{fmt.Sprintf("statChanges.%d", i), 1})
	}
	for i := range field(tier, "boostChanges").([]any) {
		groups = append(groups, group{fmt.Sprintf("boostChanges.%d", i), 1})
	}
	v2 := tier.Has("statuses")
	nullable := nullableEffects
	if v2 {
		nullable = nullableEffectsV2
		for i, status := range field(tier, "statuses").([]any) {
			cost := 1
			if present(status.(*s.Object), "magnitude") {
				cost = 2
			}
			groups = append(groups, group{fmt.Sprintf("statuses.%d", i), cost})
		}
	}
	for _, key := range nullable {
		if present(tier, key) {
			cost := 1
			if key == "slow" || key == "burn" {
				cost = 2
			}
			groups = append(groups, group{key, cost})
		}
	}
	total := 0
	for _, g := range groups {
		total += g.cost
	}
	if total <= limit {
		return nil
	}
	var choices []subset
	for mask := 1; mask < 1<<len(groups); mask++ {
		cost := 0
		var ids []string
		for i, g := range groups {
			if mask&(1<<i) != 0 {
				cost += g.cost
				ids = append(ids, g.id)
			}
		}
		if cost > limit {
			continue
		}
		maximal := true
		for i, g := range groups {
			if mask&(1<<i) == 0 && cost+g.cost <= limit {
				maximal = false
				break
			}
		}
		if !maximal {
			continue
		}
		if len(choices) == 64 {
			return nil
		}
		kept := map[string]bool{}
		for _, id := range ids {
			kept[id] = true
		}
		selected := s.Clone(tier).(*s.Object)
		filter := func(key string) {
			var out []any
			for i, item := range field(selected, key).([]any) {
				if kept[fmt.Sprintf("%s.%d", key, i)] {
					out = append(out, item)
				}
			}
			if out == nil {
				out = []any{}
			}
			selected.Set(key, out)
		}
		filter("statChanges")
		filter("boostChanges")
		if v2 {
			filter("statuses")
		}
		for _, key := range nullable {
			if !kept[key] && (!v2 || selected.Has(key)) {
				selected.Set(key, nil)
			}
		}
		choices = append(choices, subset{fmt.Sprintf("option-%d", len(choices)+1), ids, selected})
	}
	return choices
}

var repairTarget = regexp.MustCompile(`^paths\.(path[1-3])\.tiers\.(tier[1-5])(?:\.|:)`)

// TierRepair is a targeted repair call and how to merge its answer.
type TierRepair struct {
	Request ModelRequest
	Apply   func(patch any) (*s.Object, error)
}

type orderedSet struct {
	keys []string
	has  map[string]bool
}

func (o *orderedSet) add(k string) {
	if o.has == nil {
		o.has = map[string]bool{}
	}
	if !o.has[k] {
		o.has[k] = true
		o.keys = append(o.keys, k)
	}
}

// TargetedTierRepair restricts a repair to effect-subset choices or complete
// replacements of the invalid tiers. It returns nil when a whole-output repair is needed.
func TargetedTierRepair(request *Request, previous any, issues []string) (*TierRepair, error) {
	if len(issues) == 0 {
		return nil, nil
	}
	var pathOrder []string
	targets := map[string]*orderedSet{}
	for _, issue := range issues {
		match := repairTarget.FindStringSubmatch(issue)
		if match == nil {
			return nil, nil
		}
		if targets[match[1]] == nil {
			targets[match[1]] = &orderedSet{}
			pathOrder = append(pathOrder, match[1])
		}
		targets[match[1]].add(match[2])
	}
	full, err := ModelOutputSchema(request)
	if err != nil {
		return nil, err
	}
	parsedValue, parseIssues := s.Parse(full, previous)
	if len(parseIssues) > 0 {
		return nil, nil
	}
	parsed := parsedValue.(*s.Object)
	wirePaths := field(parsed, "paths").(*s.Object)
	wireTier := func(path, tier string) *s.Object {
		return field(field(field(wirePaths, path).(*s.Object), "tiers").(*s.Object), tier).(*s.Object)
	}
	var policy *m.DesignPolicy
	if request.MechanicsDefinition != nil {
		policy = request.MechanicsDefinition.Profile.DesignPolicy
	}
	dependent := &orderedSet{}
	for _, path := range pathOrder {
		tiers := targets[path]
		changesCapstoneBasis := false
		if policy != nil && (policy.MinTier5SpecialtyMultiplier != nil || (policy.RequireTier5BehaviorChange != nil && *policy.RequireTier5BehaviorChange)) {
			for _, t := range tiers.keys {
				if t != "tier5" {
					changesCapstoneBasis = true
				}
			}
		}
		tier5 := wireTier(path, "tier5")
		changesBoostPrerequisite := tiers.has["tier4"] && (len(field(tier5, "boostChanges").([]any)) > 0 || present(tier5, "activeFollowUp"))
		if changesCapstoneBasis || changesBoostPrerequisite {
			tiers.add("tier5")
			dependent.add(path + ".tier5")
		}
	}
	fullPaths := full.Shape("paths").(*s.ObjectSchema)
	var pathFields []s.Field
	choiceOrder := []string{}
	choices := map[string][]subset{}
	for _, path := range m.PathKeys {
		selected := targets[path]
		if selected == nil {
			continue
		}
		var tierFields []s.Field
		for _, tier := range m.TierKeys {
			if !selected.has[tier] {
				continue
			}
			prefix := "paths." + path + ".tiers." + tier
			var tierIssues []string
			for _, issue := range issues {
				if strings.HasPrefix(issue, prefix+".") || strings.HasPrefix(issue, prefix+":") {
					tierIssues = append(tierIssues, issue)
				}
			}
			budgetOnly := !dependent.has[path+"."+tier] && len(tierIssues) > 0
			for _, issue := range tierIssues {
				if !strings.HasPrefix(issue, prefix+".statChanges: This tier contains ") {
					budgetOnly = false
				}
			}
			var subsets []subset
			if budgetOnly {
				subsets = budgetSubsets(wireTier(path, tier), TierEffectLimit(request, tier))
			}
			if subsets != nil {
				key := path + "." + tier
				choiceOrder = append(choiceOrder, key)
				choices[key] = subsets
				ids := make([]string, len(subsets))
				for i, sub := range subsets {
					ids[i] = sub.id
				}
				tierFields = append(tierFields, s.F(tier, s.StrictObject(s.F("choice", s.Enum(ids...)))))
			} else {
				tierSchema := fullPaths.Shape(path).(*s.ObjectSchema).Shape("tiers").(*s.ObjectSchema).Shape(tier)
				tierFields = append(tierFields, s.F(tier, tierSchema))
			}
		}
		pathFields = append(pathFields, s.F(path, s.StrictObject(s.F("tiers", s.StrictObject(tierFields...)))))
	}
	schema := s.StrictObject(s.F("paths", s.StrictObject(pathFields...)))
	subsetChoices := s.NewObject()
	for _, key := range choiceOrder {
		var list []any
		for _, sub := range choices[key] {
			keep := make([]any, len(sub.keep))
			for i, k := range sub.keep {
				keep[i] = k
			}
			list = append(list, s.NewObject().Set("id", sub.id).Set("keep", keep))
		}
		subsetChoices.Set(key, list)
	}
	dependentList := make([]any, len(dependent.keys))
	for i, k := range dependent.keys {
		dependentList[i] = k
	}
	context := s.NewObject().
		Set("character", s.FromGoValue(request.Character)).
		Set("task", request.Task).
		Set("constraints", s.FromGoValue(request.Constraints))
	if request.MechanicsDefinition != nil {
		context.Set("definition", s.FromGoValue(request.MechanicsDefinition))
	}
	context.
		Set("feedback", nullableString(request.Feedback)).
		Set("previousFindings", previousFindings(request)).
		Set("previous", parsed).
		Set("evidenceSpans", s.FromGoValue(AuthorEvidence(request))).
		Set("resolvedCapstoneChecks", WireRepairContext(parsed, request)).
		Set("dependentCapstones", dependentList).
		Set("effectSubsetChoices", subsetChoices)
	violations := make([]any, len(issues))
	for i, issue := range issues {
		violations[i] = issue
	}
	budget := repairBudget
	if isV2(request) {
		budget = repairBudgetV2
	}
	prompt := []string{repairScope, s.Stringify(context), budget, CountArithmeticGuidance, repairCapstone, draftPromises}
	prompt = append(prompt, VocabularyGuidance(request)...)
	prompt = append(prompt, DesignGuidance(request)...)
	prompt = append(prompt, s.Stringify(s.NewObject().Set("violations", violations)))
	return &TierRepair{
		Request: ModelRequest{System: repairSystem, Prompt: strings.Join(prompt, "\n\n"), Schema: ProviderJSONSchema(schema)},
		Apply: func(patch any) (*s.Object, error) {
			replacementValue, issues := s.Parse(schema, patch)
			if len(issues) > 0 {
				return nil, &s.Error{Issues: issues}
			}
			replacement := replacementValue.(*s.Object)
			merged := s.Clone(parsed).(*s.Object)
			mergedPaths := field(merged, "paths").(*s.Object)
			for _, path := range pathOrder {
				for _, tier := range targets[path].keys {
					value := field(field(field(field(replacement, "paths").(*s.Object), path).(*s.Object), "tiers").(*s.Object), tier)
					if subsets, ok := choices[path+"."+tier]; ok {
						choice := field(value.(*s.Object), "choice")
						for _, sub := range subsets {
							if sub.id == choice {
								value = sub.tier
							}
						}
					}
					field(field(mergedPaths, path).(*s.Object), "tiers").(*s.Object).Set(tier, s.Clone(value))
				}
			}
			return merged, nil
		},
	}, nil
}

// CapstoneRepairContext is arithmetic evidence for a repair, never an
// automatic change to authored values.
func CapstoneRepairContext(blueprint m.Blueprint, request *Request) []any {
	out := []any{}
	if request.MechanicsDefinition == nil || request.MechanicsDefinition.Profile.DesignPolicy == nil || request.MechanicsDefinition.Profile.DesignPolicy.MinTier5SpecialtyMultiplier == nil {
		return out
	}
	multiplier := *request.MechanicsDefinition.Profile.DesignPolicy.MinTier5SpecialtyMultiplier
	for index, path := range m.PathKeys {
		specialization := blueprint.Paths.At(index).Specialization
		if specialization == "" {
			continue
		}
		var sel m.Selection
		sel[index] = 4
		before := m.ResolveUnchecked(&blueprint, sel)
		sel[index] = 5
		after := m.ResolveUnchecked(&blueprint, sel)
		tier4 := m.SpecialtyMetrics(before, specialization)
		tier5 := m.SpecialtyMetrics(after, specialization)
		metrics := []any{}
		for _, metric := range tier4.Keys() {
			v, _ := tier4.Get(metric)
			value := v.(float64)
			n, ok := tier5.Get(metric)
			next := 0.0
			if ok {
				next = n.(float64)
			}
			target := value * multiplier
			if !(value > 0) || !finiteNumber(target) || !ok || !finiteNumber(next) {
				continue
			}
			metrics = append(metrics, s.NewObject().Set("metric", metric).Set("tier4", value).Set("tier5", next).Set("minimumTier5", target))
		}
		out = append(out, s.NewObject().
			Set("path", path).
			Set("specialization", specialization).
			Set("tier4HasManualBoost", len(before.Abilities) > 0).
			Set("tier4Attack", s.FromGoValue(before.BaseAttack.Stats)).
			Set("tier5Attack", s.FromGoValue(after.BaseAttack.Stats)).
			Set("metrics", metrics))
	}
	return out
}

func finiteNumber(x float64) bool { return x == x && x-x == 0 }

// WireRepairContext decodes wire output for CapstoneRepairContext; invalid output yields none.
func WireRepairContext(previous any, request *Request) []any {
	blueprint, err := DecodeBlueprintOutput(previous, request)
	if err != nil {
		return []any{}
	}
	return CapstoneRepairContext(blueprint, request)
}
