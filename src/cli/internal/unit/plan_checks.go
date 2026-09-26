package unit

import (
	"fmt"
	"sort"
	"strings"

	m "github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"golang.org/x/text/unicode/norm"
)

// normalizeQuote is text.normalize('NFKC').replace(/\s+/g, ' ').trim().
func normalizeQuote(text string) string {
	text = norm.NFKC.String(text)
	var b strings.Builder
	space := false
	for _, r := range text {
		if isJSWhitespace(r) {
			if !space {
				b.WriteByte(' ')
			}
			space = true
			continue
		}
		space = false
		b.WriteRune(r)
	}
	return s.Trim(b.String())
}

func isJSWhitespace(r rune) bool { return s.Trim(string(r)) == "" }

// ValidateBlueprintRequest checks a blueprint against its request: mechanics,
// the character name, verbatim source quotes and constraint coverage.
func ValidateBlueprintRequest(blueprint m.Blueprint, request Request) []m.Issue {
	if request.MechanicsDefinition == nil {
		return []m.Issue{{Path: "request", Message: "Supply a mechanics definition."}}
	}
	issues := m.ValidateTyped(&blueprint, *request.MechanicsDefinition)
	if blueprint.Name != request.Character.Name {
		issues = append(issues, m.Issue{Path: "name", Message: "Preserve the exact requested character name."})
	}
	for index, fact := range blueprint.SourceFacts {
		var source *Document
		for i := range request.Documents {
			if request.Documents[i].Kind == "source" && request.Documents[i].ID == fact.DocumentID {
				source = &request.Documents[i]
				break
			}
		}
		quote := normalizeQuote(fact.Quote)
		if source == nil || s.UTF16Len(quote) < 15 || !strings.Contains(normalizeQuote(source.Text), quote) {
			issues = append(issues, m.Issue{Path: fmt.Sprintf("sourceFacts.%d", index), Message: "Use a verbatim quote of at least 15 characters from the named source document. Do not paraphrase or cite game rules as character canon."})
		}
	}
	var expected, actual []string
	for _, c := range request.Constraints {
		expected = append(expected, c.ID)
	}
	for _, c := range blueprint.ConstraintCoverage {
		actual = append(actual, c.ConstraintID)
	}
	sortUTF16(expected)
	sortUTF16(actual)
	if strings.Join(expected, "\x00") != strings.Join(actual, "\x00") || len(expected) != len(actual) {
		issues = append(issues, m.Issue{Path: "constraintCoverage", Message: "Describe preservation of every supplied constraint exactly once; do not add other constraint IDs."})
	}
	return issues
}

// sortUTF16 sorts like Array.prototype.sort on strings.
func sortUTF16(values []string) {
	sort.SliceStable(values, func(i, j int) bool { return lessUTF16(values[i], values[j]) })
}

// ---- plan feasibility ----

var unlockCapabilities = map[string]bool{
	"manual-boost": true, "follow-up": true, "active-follow-up": true, "camo": true,
	"distinct-volley": true, "splash": true, "slow": true, "burn": true, "stun": true,
}

// coreUnlocks and corePromises are the promises every Definition shares; a
// version 2 Definition adds its status effects and detection traits.
var (
	coreUnlocks = map[string]bool{
		"none": true, "manual-boost": true, "follow-up": true, "active-follow-up": true, "distinct-volley": true,
		"splash": true, "delivery-change": true, "damage-type-change": true, "targeting-change": true,
	}
	corePromises = map[string]bool{
		"damage": true, "attack-rate": true, "range": true, "pierce": true, "projectiles": true, "splash": true,
		"follow-up": true, "active-damage": true, "active-attack-rate": true, "active-duration": true, "active-frequency": true,
	}
)

// isCapabilityUnlock reports an unlock that adds a capability, which a path
// can unlock only once. Changing delivery, damage type or targeting is not one.
func isCapabilityUnlock(d m.Definition, unlock string) bool {
	if !d.IsV2() {
		return unlockCapabilities[unlock]
	}
	switch unlock {
	case "none", "delivery-change", "damage-type-change", "targeting-change":
		return false
	}
	return true
}

func minimumEffects(intent UpgradeIntent, d m.Definition) int {
	effects := map[string]int{}
	add := func(key string) {
		switch {
		case !d.IsV2() && (key == "slow" || key == "burn"):
			effects[key] = 2
		case d.IsV2() && !corePromises[key] && !coreUnlocks[key]:
			// A status with a magnitude needs a magnitude and a duration change.
			if effect, ok := d.Vocabulary.Effect(key); ok && effect.Magnitude != nil {
				effects[key] = 2
			} else {
				effects[key] = 1
			}
		default:
			effects[key] = 1
		}
	}
	improves := map[string]bool{}
	for _, d := range intent.Improves {
		improves[d] = true
	}
	if intent.Unlock != "none" {
		add(intent.Unlock)
	}
	seen := map[string]bool{}
	for _, dimension := range intent.Improves {
		if seen[dimension] {
			continue
		}
		seen[dimension] = true
		switch {
		case strings.HasPrefix(dimension, "active-") && intent.Unlock == "manual-boost":
		case dimension == "active-damage":
			add("damage")
		case dimension == "active-attack-rate":
			add("attack-rate")
		case dimension == "follow-up" && (improves["damage"] || improves["active-damage"]):
		default:
			add(dimension)
		}
	}
	total := 0
	for _, n := range effects {
		total += n
	}
	return total
}

// promiseGroups joins promises that one change can satisfy together: a
// damage change also raises active and follow-up damage, and an interval
// change also speeds the active window.
var promiseGroups = map[string]string{
	"active-damage": "damage", "follow-up": "damage", "active-attack-rate": "attack-rate",
}

// independentPromises counts a milestone's promises that need separate
// changes, with its unlock as one more.
func independentPromises(intent UpgradeIntent) int {
	groups := map[string]bool{}
	for _, dimension := range intent.Improves {
		if group, ok := promiseGroups[dimension]; ok {
			dimension = group
		}
		groups[dimension] = true
	}
	if intent.Unlock != "none" {
		groups["unlock:"+intent.Unlock] = true
	}
	return len(groups)
}

// developingTiers are the purchases that must develop a path, not repeat a
// single stat: the fourth and fifth.
var developingTiers = []int{4, 5}

// addsBehavior reports a third-purchase promise that adds behavior or access
// rather than larger numbers: an unlock other than a targeting change, or
// more projectiles. The mechanics check confirms it in the resolved builds.
func addsBehavior(intent UpgradeIntent) bool {
	if intent.Unlock != "none" && intent.Unlock != "targeting-change" {
		return true
	}
	for _, dimension := range intent.Improves {
		if dimension == "projectiles" {
			return true
		}
	}
	return false
}

// PlanFeasibilityIssues rejects contradictions in a plan's explicit promises.
// Under a design policy it also rejects a fourth or fifth purchase that
// promises a single dimension, such as a token damage step. Plans are checked
// when they are authored; saved drafts keep the promises they were made with.
func PlanFeasibilityIssues(plan DesignPlan, definition m.Definition) []m.Issue {
	if plan.UpgradeIntents == nil {
		return nil
	}
	var issues []m.Issue
	if policy := definition.Profile.DesignPolicy; policy != nil && policy.RequireTier3BehaviorChange != nil && *policy.RequireTier3BehaviorChange {
		for pathIndex, path := range m.PathKeys {
			if !addsBehavior(*plan.UpgradeIntents.At(pathIndex).At(3)) {
				issues = append(issues, m.Issue{
					Path:    "upgradeIntents." + path + ".tier3",
					Message: fmt.Sprintf("%s must add a supported behavior or access, not only larger numbers: promise an unlock other than targeting-change, such as a new delivery, distinct-volley with more than one projectile, splash, a status effect, follow-up, damage-type-change or a detection trait, or promise projectiles while the path fires one projectile.", BuildCode(pathIndex, 3)),
				})
			}
		}
	}
	if definition.Profile.DesignPolicy != nil {
		for pathIndex, path := range m.PathKeys {
			for _, tier := range developingTiers {
				if independentPromises(*plan.UpgradeIntents.At(pathIndex).At(tier)) < 2 {
					issues = append(issues, m.Issue{
						Path:    "upgradeIntents." + path + "." + m.TierKeys[tier-1],
						Message: fmt.Sprintf("%s must promise at least two independent dimensions or an unlock. Damage, active damage and follow-up damage count once, as do attack rate and active attack rate; a purchase that only raises ordinary damage is a token step. Develop, add or replace behavior, access, capacity or uptime.", BuildCode(pathIndex, tier)),
					})
				}
			}
		}
	}
	boostTier := definition.Rules.ManualBoostUnlockTier
	boostKey := m.TierKeys[boostTier-1]
	for pathIndex, path := range m.PathKeys {
		intents := plan.UpgradeIntents.At(pathIndex)
		unlocked := map[string]string{}
		for index, tier := range m.TierKeys {
			intent := intents.At(index + 1)
			report := func(message string) {
				issues = append(issues, m.Issue{Path: "upgradeIntents." + path + "." + tier, Message: message})
			}
			needsBoost := intent.Unlock == "active-follow-up"
			for _, d := range intent.Improves {
				if strings.HasPrefix(d, "active-") {
					needsBoost = true
				}
			}
			if needsBoost && (index+1 < boostTier || intents.At(boostTier).Unlock != "manual-boost") {
				report(fmt.Sprintf("Active improvements and active-follow-up require an explicitly planned same-path manual-boost at %s. The base attack and another path's boost cannot supply it.", boostKey))
			}
			if isCapabilityUnlock(definition, intent.Unlock) {
				if previous, ok := unlocked[intent.Unlock]; ok {
					report(fmt.Sprintf("Cannot unlock %s again after %s on the same path without a disable intent. Describe development of the existing capability as an improvement.", intent.Unlock, previous))
				} else {
					unlocked[intent.Unlock] = tier
				}
			}
			profile := definition.Profile
			limit := profile.MaxChangesPerTier
			if index+1 <= profile.EarlyThrough() {
				limit = min(profile.EarlyTierMaxChanges, profile.MaxChangesPerTier)
			}
			if minimum := minimumEffects(*intent, definition); minimum > limit {
				pairs := "Slow and burn each require two wire stat changes"
				if definition.IsV2() {
					pairs = "A status effect with a magnitude requires two changes, magnitude and duration"
				}
				report(fmt.Sprintf("These promises require at least %d primitive effects, exceeding the Definition's %d-effect budget. %s; overlapping improvements and unlocks are counted once. Reduce the promised dimensions or move a purchase to another tier.", minimum, limit, pairs))
			}
		}
	}
	return issues
}

// ---- plan intent ----

func measures(build m.Build, path string, dimension string) []float64 {
	attack := build.BaseAttack
	st := attack.Stats
	if attack.IsV2() && !corePromises[dimension] {
		status, _ := attack.Status(dimension)
		return []float64{status.Strength(), status.Seconds}
	}
	var active *m.ResolvedAbility
	for i := range build.Abilities {
		if build.Abilities[i].Path == path {
			active = &build.Abilities[i]
			break
		}
	}
	switch dimension {
	case "damage":
		return []float64{st.Damage}
	case "attack-rate":
		return []float64{1 / st.IntervalSeconds}
	case "range":
		return []float64{st.Range}
	case "pierce":
		return []float64{st.Pierce}
	case "projectiles":
		return []float64{st.Projectiles}
	case "splash":
		return []float64{st.SplashRadius}
	case "slow":
		return []float64{st.SlowPercent, st.SlowSeconds}
	case "burn":
		return []float64{st.BurnDamagePerSecond, st.BurnSeconds}
	case "stun":
		return []float64{st.StunSeconds}
	case "follow-up":
		if f := attack.FollowUp; f != nil {
			inherit := 0.0
			if f.InheritStatuses {
				inherit = 1
			}
			return []float64{f.Count, f.DamageMultiplier * st.Damage, f.Radius, inherit}
		}
		return []float64{0, 0, 0, 0}
	case "active-damage":
		if active == nil {
			return []float64{0}
		}
		return []float64{active.BoostedAttack.Stats.Damage}
	case "active-attack-rate":
		if active == nil {
			return []float64{0}
		}
		return []float64{1 / active.BoostedAttack.Stats.IntervalSeconds}
	case "active-duration":
		if active == nil {
			return []float64{0}
		}
		return []float64{active.DurationSeconds}
	case "active-frequency":
		if active == nil {
			return []float64{0}
		}
		return []float64{1 / active.CooldownSeconds}
	}
	return nil
}

func hasActiveFollowUp(blueprint *m.Blueprint, pathIndex, tier int) bool {
	for t := 1; t <= tier; t++ {
		for _, c := range blueprint.Paths.At(pathIndex).Tiers.At(t).Changes {
			if c.Kind == "followUp" && c.Target == "boost" {
				return true
			}
		}
	}
	return false
}

func hasAbility(build m.Build, path string, withFollowUp bool) bool {
	for _, a := range build.Abilities {
		if a.Path == path && (!withFollowUp || a.BoostedAttack.FollowUp != nil) {
			return true
		}
	}
	return false
}

func unlockedIntent(before, after m.Build, intent string, pathIndex, tier int, blueprint *m.Blueprint, definition m.Definition) bool {
	a, b := before.BaseAttack, after.BaseAttack
	path := m.PathKeys[pathIndex]
	if b.IsV2() && !coreUnlocks[intent] {
		if !a.DetectsTrait(intent) && b.DetectsTrait(intent) {
			return true
		}
		_, had := a.Status(intent)
		_, has := b.Status(intent)
		return !had && has
	}
	switch intent {
	case "none":
		return true
	case "manual-boost":
		return tier == definition.Rules.ManualBoostUnlockTier && !hasAbility(before, path, false) && hasAbility(after, path, false)
	case "follow-up":
		return a.FollowUp == nil && b.FollowUp != nil
	case "active-follow-up":
		return !hasActiveFollowUp(blueprint, pathIndex, tier-1) && hasActiveFollowUp(blueprint, pathIndex, tier) && hasAbility(after, path, true)
	case "camo":
		return !a.Camo && b.Camo
	case "distinct-volley":
		// Distinct targets change nothing for a single projectile.
		return a.Distribution != "distinct-targets" && b.Distribution == "distinct-targets" && b.Stats.Projectiles > 1
	case "splash":
		return a.Stats.SplashRadius == 0 && b.Stats.SplashRadius > 0
	case "slow":
		return a.Stats.SlowPercent == 0 && b.Stats.SlowPercent > 0
	case "burn":
		return a.Stats.BurnDamagePerSecond == 0 && b.Stats.BurnDamagePerSecond > 0
	case "stun":
		return a.Stats.StunSeconds == 0 && b.Stats.StunSeconds > 0
	case "delivery-change":
		return a.Delivery != b.Delivery
	case "damage-type-change":
		return a.DamageType != b.DamageType
	case "targeting-change":
		return a.Targeting != b.Targeting
	}
	return false
}

// PlanIntentIssues reports retained plan promises a blueprint does not implement.
func PlanIntentIssues(blueprint m.Blueprint, intents *UpgradeIntents, definition m.Definition) []m.Issue {
	if intents == nil {
		return nil
	}
	type pair struct {
		selection m.Selection
		build     m.Build
	}
	var builds []pair
	for _, sel := range m.AllLegalBuilds(definition) {
		build := m.ResolveUnchecked(&blueprint, sel)
		if len(m.ResolvedIssues(build, definition, "build", nil)) > 0 {
			return nil
		}
		builds = append(builds, pair{sel, build})
	}
	var order []string
	found := map[string]m.Issue{}
	for _, entry := range builds {
		for index, path := range m.PathKeys {
			tier := entry.selection[index]
			if tier == 0 {
				continue
			}
			key := m.TierKeys[tier-1]
			intent := intents.At(index).At(tier)
			previous := entry.selection
			previous[index] = tier - 1
			before := m.ResolveUnchecked(&blueprint, previous)
			label := fmt.Sprintf("%d-%d-%d", entry.selection[0], entry.selection[1], entry.selection[2])
			report := func(promise string) {
				id := path + "." + key + "." + promise
				if _, ok := found[id]; !ok {
					order = append(order, id)
					found[id] = m.Issue{
						Path:    fmt.Sprintf("paths.%s.tiers.%s.planIntent", path, key),
						Message: fmt.Sprintf("The retained plan promises %s, but this purchase does not implement it in legal build %s. Implement the promised dimension; an unrelated benefit does not satisfy it.", promise, label),
					}
				}
			}
			for _, dimension := range intent.Improves {
				prior := measures(before, path, dimension)
				improved := false
				for metric, value := range measures(entry.build, path, dimension) {
					if value > prior[metric] {
						improved = true
					}
				}
				if !improved {
					report("improved " + dimension)
				}
			}
			if !unlockedIntent(before, entry.build, intent.Unlock, index, tier, &blueprint, definition) {
				report("unlock " + intent.Unlock)
			}
		}
	}
	out := make([]m.Issue, len(order))
	for i, id := range order {
		out[i] = found[id]
	}
	return out
}
