package render

import (
	"github.com/mardwerk/unit-generator/internal/mechanics"
	s "github.com/mardwerk/unit-generator/internal/schema"
	"github.com/mardwerk/unit-generator/internal/unit"
)

// StatChange is one visible difference a purchase makes. Before is absent
// when the purchase adds the property; Improvement is set for numbers.
type StatChange struct {
	Key         string `json:"key"`
	Before      any    `json:"before,omitempty"`
	After       any    `json:"after"`
	Improvement *bool  `json:"improvement,omitempty"`
}

// TierStats is a tier's price and what it changes over the tier below it.
type TierStats struct {
	Cost    float64      `json:"cost"`
	Changes []StatChange `json:"changes"`
}

// KitStats are the resolved base attack and each tier's changes, keyed
// "path-N:T" (see TierKey).
type KitStats struct {
	Base  mechanics.Attack     `json:"base"`
	Tiers map[string]TierStats `json:"tiers"`
}

// TierKey names a tier in KitStats.Tiers.
func TierKey(pathID string, tier int) string { return pathID + ":" + itoa(tier) }

// Stats resolves each single-path build of the candidate's blueprint. Only
// resolved mechanics supply numbers: it returns nil for candidates without a
// valid blueprint, whose authored prose stays the only description. A nil
// definition means the default one.
func Stats(candidate unit.Candidate, definition *mechanics.Definition) *KitStats {
	blueprint := candidate.Blueprint
	if blueprint == nil {
		return nil
	}
	d := mechanics.DefaultDefinition()
	if definition != nil {
		d = *definition
	}
	resolve := func(selection mechanics.Selection) (mechanics.ResolvedBuild, bool) {
		build, err := mechanics.ResolveBuild(blueprint, selection, d)
		return build, err == nil
	}
	base, ok := resolve(mechanics.Selection{})
	if !ok {
		return nil
	}
	stats := &KitStats{Base: base.BaseAttack, Tiers: map[string]TierStats{}}
	for index := range mechanics.PathKeys {
		pathID := "path-" + itoa(index+1)
		if !hasPath(candidate, pathID) {
			continue
		}
		before := base
		for tier := 1; tier <= len(mechanics.TierKeys); tier++ {
			selection := mechanics.Selection{}
			selection[index] = tier
			after, ok := resolve(selection)
			if !ok {
				return nil
			}
			stats.Tiers[TierKey(pathID, tier)] = TierStats{
				Cost:    blueprint.Paths.At(index).Tiers.At(tier).Cost,
				Changes: tierChanges(before, after),
			}
			before = after
		}
	}
	return stats
}

func hasPath(candidate unit.Candidate, id string) bool {
	for _, path := range candidate.Paths {
		if path.ID == id {
			return true
		}
	}
	return false
}

func tierChanges(before, after mechanics.ResolvedBuild) []StatChange {
	changes := []StatChange{}
	priorAttack, nextAttack := before.BaseAttack, after.BaseAttack
	for _, key := range mechanics.StatKeys {
		prior, next := priorAttack.Stats.Get(key), nextAttack.Stats.Get(key)
		if prior != next {
			improvement := next > prior
			if key == "intervalSeconds" {
				improvement = next < prior
			}
			changes = append(changes, StatChange{Key: key, Before: prior, After: next, Improvement: &improvement})
		}
	}
	if priorAttack.Camo != nextAttack.Camo {
		changes = append(changes, StatChange{Key: "camo", Before: yesNo(priorAttack.Camo), After: yesNo(nextAttack.Camo)})
	}
	for _, property := range []struct{ key, prior, next string }{
		{"delivery", priorAttack.Delivery, nextAttack.Delivery},
		{"damageType", priorAttack.DamageType, nextAttack.DamageType},
		{"targeting", priorAttack.Targeting, nextAttack.Targeting},
	} {
		if property.prior != property.next {
			changes = append(changes, StatChange{Key: property.key, Before: property.prior, After: property.next})
		}
	}
	var priorBoost, nextBoost *mechanics.ResolvedAbility
	if len(before.Abilities) > 0 {
		priorBoost = &before.Abilities[0]
	}
	if len(after.Abilities) > 0 {
		nextBoost = &after.Abilities[0]
	}
	if priorAttack.Distribution != nextAttack.Distribution {
		changes = append(changes, StatChange{Key: "distribution", Before: targets(priorAttack.Distribution), After: targets(nextAttack.Distribution)})
	}
	var priorActive, nextActive *mechanics.FollowUp
	if priorBoost != nil {
		priorActive = priorBoost.BoostedAttack.FollowUp
	}
	if nextBoost != nil {
		nextActive = nextBoost.BoostedAttack.FollowUp
	}
	for _, followUp := range []struct {
		key         string
		prior, next *mechanics.FollowUp
	}{
		{"followUp", priorAttack.FollowUp, nextAttack.FollowUp},
		{"activeFollowUp", priorActive, nextActive},
	} {
		next := followUp.next
		if next == nil || sameFollowUp(followUp.prior, next) ||
			(followUp.key == "activeFollowUp" && sameFollowUp(next, nextAttack.FollowUp)) {
			continue
		}
		change := StatChange{Key: followUp.key}
		if prior := followUp.prior; prior != nil {
			change.Before = s.FormatNumber(prior.Count) + " nearby hits ×" + s.FormatNumber(prior.DamageMultiplier)
		}
		after := s.FormatNumber(next.Count) + " nearby hits ×" + s.FormatNumber(next.DamageMultiplier) + "; " + s.FormatNumber(next.Radius) + " range"
		if next.InheritStatuses {
			after += "; carries status effects"
		}
		change.After = after
		changes = append(changes, change)
	}
	if nextBoost == nil {
		return changes
	}
	if priorBoost == nil {
		changes = append(changes, StatChange{Key: "ability", After: nextBoost.Name})
	}
	for _, key := range mechanics.BoostStatKeys {
		next := boostStat(nextBoost, key)
		if priorBoost == nil {
			changes = append(changes, StatChange{Key: key, After: next})
			continue
		}
		prior := boostStat(priorBoost, key)
		if prior == next {
			continue
		}
		improvement := next > prior
		if key == "intervalMultiplier" || key == "cooldownSeconds" {
			improvement = next < prior
		}
		changes = append(changes, StatChange{Key: key, Before: prior, After: next, Improvement: &improvement})
	}
	return changes
}

func sameFollowUp(a, b *mechanics.FollowUp) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

func boostStat(ability *mechanics.ResolvedAbility, key string) float64 {
	switch key {
	case "durationSeconds":
		return ability.DurationSeconds
	case "cooldownSeconds":
		return ability.CooldownSeconds
	case "damageMultiplier":
		return ability.DamageMultiplier
	case "intervalMultiplier":
		return ability.IntervalMultiplier
	}
	return ability.RangeBonus
}

func yesNo(value bool) string {
	if value {
		return "Yes"
	}
	return "No"
}

func targets(distribution string) string {
	if distribution == "distinct-targets" {
		return "Distinct enemies"
	}
	return "Same enemy"
}
