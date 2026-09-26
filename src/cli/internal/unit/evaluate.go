package unit

import (
	"fmt"
	"math"

	m "github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

func jsonOrNull(value any) string {
	if value == nil {
		return "null"
	}
	return s.Stringify(s.FromGoValue(value))
}

func attackCapability(a m.Attack, key string) any {
	switch key {
	case "delivery":
		return a.Delivery
	case "damageType":
		return a.DamageType
	case "targeting":
		return a.Targeting
	case "camo":
		return a.Camo
	case "distribution":
		if a.Distribution == "" {
			return nil
		}
		return a.Distribution
	case "followUp":
		if a.FollowUp == nil {
			return nil
		}
		return a.FollowUp
	}
	return nil
}

func selectionValue(sel m.Selection) []any {
	return []any{float64(sel[0]), float64(sel[1]), float64(sel[2])}
}

func compareBuilds(blueprint *m.Blueprint, from, to m.Selection, vocabulary *m.Vocabulary) *s.Object {
	before := m.ResolveUnchecked(blueprint, from)
	after := m.ResolveUnchecked(blueprint, to)
	a := m.PurchaseMetricsWith(before, vocabulary)
	b := m.PurchaseMetricsWith(after, vocabulary)
	deltas := s.NewObject()
	keys := a.Keys()
	for _, key := range b.Keys() {
		if !a.Has(key) {
			keys = append(keys, key)
		}
	}
	for _, key := range keys {
		prior, ok := a.Get(key)
		if !ok {
			prior = 0.0
		}
		next, ok := b.Get(key)
		if !ok {
			next = 0.0
		}
		var change any
		if prior != nil && next != nil {
			if delta := next.(float64) - prior.(float64); !math.IsNaN(delta) && !math.IsInf(delta, 0) {
				change = delta
			}
		}
		deltas.Set(key, s.NewObject().Set("before", prior).Set("after", next).Set("change", change))
	}
	changes := []any{}
	if after.BaseAttack.IsV2() {
		changes = append(changes, statusChanges(before.BaseAttack, after.BaseAttack)...)
	} else {
		for _, key := range []string{"delivery", "damageType", "targeting", "camo", "distribution", "followUp"} {
			x, y := attackCapability(before.BaseAttack, key), attackCapability(after.BaseAttack, key)
			if jsonOrNull(x) != jsonOrNull(y) {
				changes = append(changes, fmt.Sprintf("%s: %s → %s", key, jsonOrNull(x), jsonOrNull(y)))
			}
		}
		for _, key := range []string{"splashRadius", "slowPercent", "slowSeconds", "burnDamagePerSecond", "burnSeconds", "stunSeconds", "pierce", "projectiles", "damage"} {
			prior, next := before.BaseAttack.Stats.Get(key), after.BaseAttack.Stats.Get(key)
			if prior != next {
				changes = append(changes, fmt.Sprintf("%s: %s → %s", key, s.FormatNumber(prior), s.FormatNumber(next)))
			}
		}
	}
	for _, ability := range after.Abilities {
		var prior *m.ResolvedAbility
		for i := range before.Abilities {
			if before.Abilities[i].Path == ability.Path {
				prior = &before.Abilities[i]
				break
			}
		}
		if prior == nil {
			changes = append(changes, "manual boost unlocked on "+ability.Path)
		}
		for _, key := range m.BoostStatKeys {
			next := abilityValue(ability, key)
			if prior == nil || abilityValue(*prior, key) != next {
				old := "null"
				if prior != nil {
					old = s.FormatNumber(abilityValue(*prior, key))
				}
				changes = append(changes, fmt.Sprintf("%s boost %s: %s → %s", ability.Path, key, old, s.FormatNumber(next)))
			}
		}
		var oldFollow, newFollow any
		if prior != nil && prior.BoostedAttack.FollowUp != nil {
			oldFollow = prior.BoostedAttack.FollowUp
		}
		if ability.BoostedAttack.FollowUp != nil {
			newFollow = ability.BoostedAttack.FollowUp
		}
		if jsonOrNull(oldFollow) != jsonOrNull(newFollow) {
			changes = append(changes, fmt.Sprintf("%s active followUp: %s → %s", ability.Path, jsonOrNull(oldFollow), jsonOrNull(newFollow)))
		}
	}
	return s.NewObject().
		Set("from", selectionValue(from)).
		Set("to", selectionValue(to)).
		Set("incrementalGold", after.CumulativeCost-before.CumulativeCost).
		Set("metricDeltas", deltas).
		Set("capabilityChanges", changes)
}

// statusChanges lists a version 2 purchase's capability changes: attack
// properties, detection, core stats and each status effect's numbers.
func statusChanges(before, after m.Attack) []any {
	var changes []any
	for _, key := range []string{"delivery", "damageType", "targeting", "detects", "distribution", "followUp"} {
		var x, y any
		if key == "detects" {
			x, y = before.DetectionTraits(), after.DetectionTraits()
		} else {
			x, y = attackCapability(before, key), attackCapability(after, key)
		}
		if jsonOrNull(x) != jsonOrNull(y) {
			changes = append(changes, fmt.Sprintf("%s: %s → %s", key, jsonOrNull(x), jsonOrNull(y)))
		}
	}
	for _, key := range []string{"splashRadius", "pierce", "projectiles", "damage"} {
		prior, next := before.Stats.Get(key), after.Stats.Get(key)
		if prior != next {
			changes = append(changes, fmt.Sprintf("%s: %s → %s", key, s.FormatNumber(prior), s.FormatNumber(next)))
		}
	}
	effects := map[string]bool{}
	var order []string
	for _, status := range append(before.AppliedStatuses(), after.AppliedStatuses()...) {
		if !effects[status.Effect] {
			effects[status.Effect] = true
			order = append(order, status.Effect)
		}
	}
	for _, effect := range order {
		prior, _ := before.Status(effect)
		next, _ := after.Status(effect)
		if prior.Strength() != next.Strength() {
			changes = append(changes, fmt.Sprintf("%s magnitude: %s → %s", effect, s.FormatNumber(prior.Strength()), s.FormatNumber(next.Strength())))
		}
		if prior.Seconds != next.Seconds {
			changes = append(changes, fmt.Sprintf("%s seconds: %s → %s", effect, s.FormatNumber(prior.Seconds), s.FormatNumber(next.Seconds)))
		}
	}
	return changes
}

// EvaluateUnitDesign computes analytical purchase evidence for valid mechanics.
func EvaluateUnitDesign(input m.Blueprint, plan *DesignPlan, definition m.Definition) (*s.Object, error) {
	var blueprint m.Blueprint
	if err := s.ParseInto(m.BlueprintSchemaFor(definition), s.FromGoValue(input), &blueprint); err != nil {
		return nil, err
	}
	vocabulary := definition.Terms()
	legal := map[m.Selection]bool{}
	for _, sel := range m.AllLegalBuilds(definition) {
		legal[sel] = true
	}
	capstones := m.CompareCapstonePurchasesWith(&blueprint, &vocabulary)
	var sourceClaims any
	if plan != nil {
		sourceClaims = s.NewObject().
			Set("signature", s.FromGoValue(plan.Signature)).
			Set("scopeLimits", s.FromGoValue(plan.ScopeLimits)).
			Set("omittedTechniques", s.FromGoValue(plan.OmittedTechniques))
	}
	paths := []any{}
	for index, path := range m.PathKeys {
		milestones := []any{}
		for _, tier := range []int{3, 4, 5} {
			var from, to m.Selection
			from[index], to[index] = tier-1, tier
			if legal[from] && legal[to] {
				milestones = append(milestones, compareBuilds(&blueprint, from, to, &vocabulary))
			}
		}
		crosspaths := []any{}
		for secondary, secondaryPath := range m.PathKeys {
			if secondary == index {
				continue
			}
			for _, mainTier := range []int{3, 4, 5} {
				for _, tier := range []int{1, 2} {
					var from, to m.Selection
					from[index], to[index] = mainTier, mainTier
					from[secondary], to[secondary] = tier-1, tier
					if legal[from] && legal[to] {
						entry := s.NewObject().Set("secondaryPath", secondaryPath).Set("tier", float64(tier))
						compared := compareBuilds(&blueprint, from, to, &vocabulary)
						for _, key := range compared.Keys() {
							v, _ := compared.Get(key)
							entry.Set(key, v)
						}
						crosspaths = append(crosspaths, entry)
					}
				}
			}
		}
		var claim any
		if plan != nil {
			branch := plan.Paths.At(index)
			claim = s.NewObject().Set("buyFor", branch.BuyFor).Set("weakness", branch.Weakness).
				Set("capstoneValue", branch.CapstoneValue).Set("sourceIds", s.FromGoValue(branch.SourceIDs))
		}
		paths = append(paths, s.NewObject().
			Set("path", path).
			Set("name", blueprint.Paths.At(index).Name).
			Set("purchaseClaim", claim).
			Set("milestones", milestones).
			Set("capstoneComparison", capstones[index]).
			Set("crosspaths", crosspaths))
	}
	evaluation := s.NewObject().
		Set("scope", "analytical-not-simulation").
		Set("sourceClaims", sourceClaims).
		Set("paths", paths).
		Set("limitations", []any{
			"Source and purchase claims are retained author proposals, not independently verified conclusions.",
			"Deltas measure resolved capacities under ideal target access. They do not establish combat outcomes, player preference or balance.",
			"Null metrics and deltas are unavailable because their calculation has no finite numeric result.",
			"A missing active metric is zero before its unlock. Active peaks are not sustained output; range and duty fraction are not additive across copies.",
			"No text interpretation or automatic quality score is applied. Scope limits and omitted techniques remain explicit for independent review.",
		})
	out, issues := s.Parse(DesignEvaluationSchema, evaluation)
	if len(issues) > 0 {
		return nil, &s.Error{Issues: issues}
	}
	return out.(*s.Object), nil
}
