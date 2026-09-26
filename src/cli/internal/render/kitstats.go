package render

import (
	"github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// StatChange is one visible difference a purchase makes. Before is absent
// when the purchase adds the property; Improvement is set for numbers.
// Status effects and detection traits of a version 2 Definition come from
// its vocabulary, so their changes also carry a Label, the Unit of the
// number and the Kind of effect ("detection" for a trait).
type StatChange struct {
	Key         string `json:"key"`
	Label       string `json:"label,omitempty"`
	Unit        string `json:"unit,omitempty"`
	Kind        string `json:"kind,omitempty"`
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
// "path-N:T" (see TierKey). BaseEffects labels the version 2 base attack's
// status effects and detection traits.
type KitStats struct {
	Base        mechanics.Attack     `json:"base"`
	BaseEffects []StatChange         `json:"baseEffects,omitempty"`
	Tiers       map[string]TierStats `json:"tiers"`
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
	vocabulary := d.Terms()
	stats := &KitStats{Base: base.BaseAttack, Tiers: map[string]TierStats{}}
	if base.BaseAttack.IsV2() {
		stats.BaseEffects = append(statusChanges(mechanics.Attack{}, base.BaseAttack, &vocabulary), detectionChanges(nil, base.BaseAttack, &vocabulary)...)
	}
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
				Changes: tierChanges(before, after, &vocabulary),
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

func tierChanges(before, after mechanics.ResolvedBuild, vocabulary *mechanics.Vocabulary) []StatChange {
	changes := []StatChange{}
	priorAttack, nextAttack := before.BaseAttack, after.BaseAttack
	v2 := nextAttack.IsV2()
	keys := mechanics.StatKeys
	if v2 {
		keys = mechanics.CoreStatKeys
	}
	for _, key := range keys {
		prior, next := priorAttack.Stats.Get(key), nextAttack.Stats.Get(key)
		if prior != next {
			improvement := next > prior
			if key == "intervalSeconds" {
				improvement = next < prior
			}
			changes = append(changes, StatChange{Key: key, Before: prior, After: next, Improvement: &improvement})
		}
	}
	if v2 {
		changes = append(changes, statusChanges(priorAttack, nextAttack, vocabulary)...)
		changes = append(changes, detectionChanges(&priorAttack, nextAttack, vocabulary)...)
	} else if priorAttack.Camo != nextAttack.Camo {
		changes = append(changes, StatChange{Key: "camo", Before: yesNo(priorAttack.Camo), After: yesNo(nextAttack.Camo)})
	}
	damageTypes := [2]string{priorAttack.DamageType, nextAttack.DamageType}
	targeting := [2]string{priorAttack.Targeting, nextAttack.Targeting}
	if v2 {
		// Version 2 IDs are Profile-defined, so show their names.
		for i := range damageTypes {
			if t, ok := vocabulary.DamageType(damageTypes[i]); ok {
				damageTypes[i] = t.Name
			}
			targeting[i] = termName(targeting[i], vocabulary.Targeting)
		}
	}
	for _, property := range []struct{ key, prior, next string }{
		{"delivery", priorAttack.Delivery, nextAttack.Delivery},
		{"damageType", damageTypes[0], damageTypes[1]},
		{"targeting", targeting[0], targeting[1]},
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

// statusChanges compares the status effects of two version 2 attacks in
// effect ID order: magnitude, then duration.
func statusChanges(prior, next mechanics.Attack, vocabulary *mechanics.Vocabulary) []StatChange {
	var changes []StatChange
	for _, effect := range vocabulary.StatusEffects {
		before, had := prior.Status(effect.ID)
		after, has := next.Status(effect.ID)
		if !had && !has {
			continue
		}
		number := func(field string, label, unit string, before, after float64) {
			if had && before == after {
				return
			}
			change := StatChange{Key: "status." + effect.ID + "." + field, Label: label, Unit: unit, Kind: effect.Kind, After: after}
			if had {
				improvement := after > before
				change.Before, change.Improvement = before, &improvement
			}
			changes = append(changes, change)
		}
		if effect.Magnitude != nil {
			number("magnitude", effect.Name, effect.Magnitude.Unit, magnitude(before), magnitude(after))
		}
		number("seconds", effect.Name+" duration", "s", before.Seconds, after.Seconds)
	}
	return changes
}

func magnitude(status mechanics.StatusApplication) float64 {
	if status.Magnitude == nil {
		return 0
	}
	return *status.Magnitude
}

// detectionChanges lists the detection traits two version 2 attacks differ
// in. A nil prior lists the traits the base attack detects.
func detectionChanges(prior *mechanics.Attack, next mechanics.Attack, vocabulary *mechanics.Vocabulary) []StatChange {
	var changes []StatChange
	for _, trait := range vocabulary.Detection {
		before, after := prior != nil && prior.DetectsTrait(trait.ID), next.DetectsTrait(trait.ID)
		if before == after {
			continue
		}
		change := StatChange{Key: "detects." + trait.ID, Label: trait.Name + " detection", Kind: "detection", After: yesNo(after)}
		if prior != nil {
			change.Before = yesNo(before)
		}
		changes = append(changes, change)
	}
	return changes
}

func termName(id string, terms []mechanics.Term) string {
	for _, term := range terms {
		if term.ID == id && term.Name != "" {
			return term.Name
		}
	}
	return id
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
