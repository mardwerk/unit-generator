package unit

import (
	"fmt"
	"strings"

	m "github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

// Prompt lines for version 2 Definitions. They replace the version 1 lines
// that name slow, burn, stun and Camo; the vocabulary supplies the rest.
const (
	draftStatusBudgetV2 = "Each tier has statChanges and statuses plus nullable detect/delivery/damageType/targeting fields. Null or an empty list means unchanged; do not repeat current values. %s Count each statChanges or boostChanges entry and every nonnull enum/unlockBoost field as one. Each statuses entry counts as TWO changes when it has a magnitude and one otherwise, but one new capability. Tier1 and Tier2 may add only one new capability."
	draftStatusFormV2   = "Use statuses:[] when no status effect changes. A statuses entry {effect, magnitude, seconds} introduces or replaces one of the Definition's status effects: a positive magnitude in the effect's unit and within its bounds, or null for an effect without magnitude, and a positive duration within its limit. Never put status fields in statChanges. detect names a hidden trait the attack starts detecting. Zero disables splash; multiplying zero cannot enable an effect."
	draftExampleV2      = "Example Tier1: {\"name\":\"Focused Strike\",\"cost\":100,\"statChanges\":[{\"stat\":\"damage\",\"operation\":\"add\",\"value\":1}],\"statuses\":[],\"detect\":null,\"delivery\":null,\"damageType\":null,\"targeting\":null,\"unlockBoost\":null,\"boostChanges\":[]}. A Tier4 boost could use damageMultiplier:2, intervalMultiplier:0.8, durationSeconds:8, cooldownSeconds:30, rangeBonus:0."
	repairBudgetV2      = "Correct the violations below with the smallest coherent tier changes. Preserve the established role, path themes and valid benefits. Count every statChanges item, boostChanges item and nonnull detect/delivery/damageType/targeting/unlockBoost field toward the tier effect budget. Each statuses entry also counts as two primitive changes when it has a magnitude, otherwise one, and must keep positive values. Removing an effect must preserve at least one meaningful benefit. Choose subsets that preserve the tactical purpose of each path and valid inherited mechanics. A subset menu guarantees the effect count only; avoid ineffective or harmful combinations. Output only the requested repair fields."
	reviewStatusesV2    = "Inspect meaningful early upgrades and crosspaths. Repeated-primary volleys can hit the same target; explicitly distinct-target volleys assign one initial shot per eligible target. Bounded follow-ups happen once after primary hits and exclude those targets, with declared status inheritance and no recursion; each status effect's kind, bounds, duration limit, stacking and immunities are defined in the Definition's vocabulary. Boosts modify the already purchased attack. Distinguish a numerical power concern from a proven contradiction. Numerical values are on an experimental starter scale; do not claim playtested balance."
)

// isV2 reports a request under a version 2 Definition.
func isV2(request *Request) bool {
	return request.MechanicsDefinition != nil && request.MechanicsDefinition.IsV2()
}

// VocabularyGuidance summarizes a version 2 Definition's vocabulary for the
// model, so source wording maps to IDs through names and aliases. It is
// empty for version 1 Definitions, whose vocabulary is fixed in the prompts.
func VocabularyGuidance(request *Request) []string {
	if !isV2(request) {
		return nil
	}
	v := request.MechanicsDefinition.Vocabulary
	name := func(id string, terms []m.Term) string { return termName(id, terms) }
	var effects []string
	for _, effect := range v.StatusEffects {
		text := effect.ID + " (" + effect.Name
		if len(effect.Aliases) > 0 {
			text += "; also " + strings.Join(effect.Aliases, ", ")
		}
		text += "): " + effect.Kind
		if mag := effect.Magnitude; mag != nil {
			text += fmt.Sprintf(", magnitude %s to %s %s", s.FormatNumber(mag.Min), s.FormatNumber(mag.Max), mag.Unit)
		} else {
			text += ", no magnitude"
		}
		text += ", at most " + s.FormatNumber(effect.MaxSeconds) + " s"
		if effect.Stacking.MaxStacks > 1 {
			text += fmt.Sprintf(", stacks to %d (%s)", effect.Stacking.MaxStacks, effect.Stacking.Refresh)
		}
		if limit := effect.Stacking.MaxMagnitude; limit != nil {
			text += ", combined at most " + s.FormatNumber(*limit)
		}
		if len(effect.Immune) > 0 {
			var immune []string
			for _, id := range effect.Immune {
				immune = append(immune, name(id, v.EnemyProperties))
			}
			text += "; immune: " + strings.Join(immune, ", ")
		}
		if effect.Description != "" {
			text += ". " + effect.Description
		}
		effects = append(effects, text)
	}
	var damageTypes []string
	for _, t := range v.DamageTypes {
		text := t.ID + " (" + t.Name + ")"
		if len(t.IneffectiveAgainst) > 0 {
			var against []string
			for _, id := range t.IneffectiveAgainst {
				against = append(against, name(id, v.EnemyProperties))
			}
			text += " cannot damage " + strings.Join(against, ", ")
		}
		damageTypes = append(damageTypes, text)
	}
	terms := func(list []m.Term) string {
		var out []string
		for _, t := range list {
			text := t.ID
			if t.Description != "" {
				text += " (" + t.Description + ")"
			}
			out = append(out, text)
		}
		if len(out) == 0 {
			return "none"
		}
		return strings.Join(out, "; ")
	}
	status := "This Definition defines no status effects; express none."
	if len(effects) > 0 {
		status = "Status effects of this Definition, by ID. Map source wording to an effect through its name and aliases; describe anything else in unsupportedMechanics: " + strings.Join(effects, " | ") + "."
	}
	return []string{
		status,
		"Damage types: " + strings.Join(damageTypes, "; ") + ". Targeting: " + terms(v.Targeting) + ". Detection traits (hidden enemies need the matching detection to be targeted): " + terms(v.Detection) + ".",
	}
}
