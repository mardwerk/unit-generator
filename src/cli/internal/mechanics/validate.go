package mechanics

import (
	"fmt"
	"strings"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

func capabilities(attack Attack) map[string]bool {
	st := attack.Stats
	out := map[string]bool{}
	if st.SplashRadius > 0 {
		out["splash"] = true
	}
	if st.SlowPercent > 0 {
		out["slow"] = true
	}
	if st.BurnDamagePerSecond > 0 {
		out["burn"] = true
	}
	if st.StunSeconds > 0 {
		out["stun"] = true
	}
	if attack.Camo {
		out["camo"] = true
	}
	if attack.Distribution == "distinct-targets" {
		out["distinct-volley"] = true
	}
	if attack.FollowUp != nil {
		out["follow-up"] = true
	}
	return out
}

// capabilityOrder is the insertion order of capabilities in the original.
var capabilityOrder = []string{"splash", "slow", "burn", "stun", "camo", "distinct-volley", "follow-up"}

// capabilityList is a version 2 attack's capability groups in order:
// splash, each status effect, each detection trait, then the volley shapes.
func capabilityList(attack Attack) []string {
	var out []string
	if attack.Stats.SplashRadius > 0 {
		out = append(out, "splash")
	}
	for _, status := range attack.AppliedStatuses() {
		out = append(out, status.Effect)
	}
	out = append(out, attack.DetectionTraits()...)
	if attack.Distribution == "distinct-targets" {
		out = append(out, "distinct-volley")
	}
	if attack.FollowUp != nil {
		out = append(out, "follow-up")
	}
	return out
}

// addedCapabilities lists the capability groups after has and before lacks.
func addedCapabilities(before, after Attack) []string {
	if !after.IsV2() {
		existing, now := capabilities(before), capabilities(after)
		var added []string
		for _, capability := range capabilityOrder {
			if now[capability] && !existing[capability] {
				added = append(added, capability)
			}
		}
		return added
	}
	existing := map[string]bool{}
	for _, capability := range capabilityList(before) {
		existing[capability] = true
	}
	var added []string
	for _, capability := range capabilityList(after) {
		if !existing[capability] {
			added = append(added, capability)
		}
	}
	return added
}

func sameBehavior(a, b Build) bool {
	return s.Stringify(behaviorValue(a)) == s.Stringify(behaviorValue(b))
}

func behaviorValue(build Build) any {
	return s.NewObject().Set("baseAttack", s.FromGoValue(build.BaseAttack)).Set("abilities", s.FromGoValue(build.Abilities))
}

// hasBenefit rejects pure downgrades; it does not compare different benefits.
func hasBenefit(before, after Build) bool {
	prior, next := before.BaseAttack, after.BaseAttack
	for _, stat := range StatKeys {
		if stat == "splashRadius" && next.Stats.Pierce <= 1 {
			continue
		}
		if stat == "intervalSeconds" {
			if next.Stats.Get(stat) < prior.Stats.Get(stat) {
				return true
			}
		} else if next.Stats.Get(stat) > prior.Stats.Get(stat) {
			return true
		}
	}
	if (!prior.Camo && next.Camo) || prior.DamageType != next.DamageType || prior.Delivery != next.Delivery || prior.Targeting != next.Targeting {
		return true
	}
	if next.IsV2() {
		for _, trait := range next.DetectionTraits() {
			if !prior.DetectsTrait(trait) {
				return true
			}
		}
		for _, status := range next.AppliedStatuses() {
			earlier, ok := prior.Status(status.Effect)
			if !ok || status.Strength() > earlier.Strength() || status.Seconds > earlier.Seconds {
				return true
			}
		}
	}
	// Distinct targets change nothing while the attack fires one projectile.
	if (volleyDistribution(prior) != volleyDistribution(next) && next.Stats.Projectiles > 1) || (prior.FollowUp == nil && next.FollowUp != nil) {
		return true
	}
	if prior.FollowUp != nil && next.FollowUp != nil {
		p, n := prior.FollowUp, next.FollowUp
		if n.Count > p.Count || n.DamageMultiplier > p.DamageMultiplier || n.Radius > p.Radius || (!p.InheritStatuses && n.InheritStatuses) {
			return true
		}
	}
	for _, ability := range after.Abilities {
		var previous *ResolvedAbility
		for i := range before.Abilities {
			if before.Abilities[i].Path == ability.Path {
				previous = &before.Abilities[i]
				break
			}
		}
		if previous == nil {
			return true
		}
		if previous.BoostedAttack.FollowUp == nil && ability.BoostedAttack.FollowUp != nil {
			return true
		}
		for _, stat := range BoostStatKeys {
			switch stat {
			case "damageMultiplier":
				if ability.BoostedAttack.Stats.Damage > previous.BoostedAttack.Stats.Damage {
					return true
				}
			case "cooldownSeconds", "intervalMultiplier":
				if abilityStat(ability, stat) < abilityStat(*previous, stat) {
					return true
				}
			default:
				if abilityStat(ability, stat) > abilityStat(*previous, stat) {
					return true
				}
			}
		}
	}
	return false
}

func abilityStat(a ResolvedAbility, stat string) float64 {
	b := Boost{a.Name, a.DurationSeconds, a.CooldownSeconds, a.DamageMultiplier, a.IntervalMultiplier, a.RangeBonus}
	return b.Get(stat)
}

// ValidateBlueprint validates syntax, every reachable build and each
// immediately purchasable upgrade. input and definition are JSON values.
func ValidateBlueprint(input any, definitionValue any) []Issue {
	defOut, defIssues := s.Parse(DefinitionSchemaOf(definitionValue), definitionValue)
	if len(defIssues) > 0 {
		issues := make([]Issue, len(defIssues))
		for i, issue := range defIssues {
			issues[i] = Issue{"definition." + issue.PathString(), issue.Message}
		}
		return issues
	}
	var rules Definition
	if err := s.ToGo(defOut, &rules); err != nil {
		panic(err)
	}
	bpOut, bpIssues := s.Parse(DiagnosticBlueprintSchemaFor(rules), input)
	if len(bpIssues) > 0 {
		issues := make([]Issue, len(bpIssues))
		for i, issue := range bpIssues {
			issues[i] = Issue{issue.PathString(), issue.Message}
		}
		return issues
	}
	var blueprint Blueprint
	if err := s.ToGo(bpOut, &blueprint); err != nil {
		panic(err)
	}
	return validateParsed(&blueprint, rules)
}

// ValidateTyped validates a typed blueprint under a typed Definition.
func ValidateTyped(blueprint *Blueprint, definition Definition) []Issue {
	return ValidateBlueprint(s.FromGoValue(blueprint), s.FromGoValue(definition))
}

func validateParsed(blueprint *Blueprint, rules Definition) []Issue {
	var issues []Issue
	add := func(path, message string) { issues = append(issues, Issue{path, message}) }
	profile := rules.Profile
	if blueprint.BaseAttack.Cost > profile.MaxBaseCost {
		add("baseAttack.cost", "Exceeds the Definition base cost ceiling.")
	}
	for pathIndex, path := range PathKeys {
		branch := blueprint.Paths.At(pathIndex)
		for ref, index := range branch.SourceFactIndices {
			if index >= len(blueprint.SourceFacts) {
				add(fmt.Sprintf("paths.%s.sourceFactIndices.%d", path, ref), "References a source fact that does not exist.")
			}
		}
		for tierIndex, tierKey := range TierKeys {
			tier := tierIndex + 1
			upgrade := branch.Tiers.At(tier)
			prefix := fmt.Sprintf("paths.%s.tiers.%s", path, tierKey)
			if upgrade.Cost > profile.MaxUpgradeCost {
				add(prefix+".cost", "Exceeds the Definition incremental upgrade cost ceiling.")
			}
			changeLimit := profile.MaxChangesPerTier
			if tier <= profile.EarlyThrough() {
				changeLimit = min(profile.EarlyTierMaxChanges, profile.MaxChangesPerTier)
			}
			if len(upgrade.Changes) > changeLimit {
				add(prefix+".changes", "Exceeds the Definition change budget.")
			}
			if len(upgrade.Changes) == 0 {
				add(prefix+".changes", "Tier must contain at least one effect.")
			}
			unlocks := 0
			for _, c := range upgrade.Changes {
				if c.Kind == "unlockBoost" {
					unlocks++
				}
			}
			if unlocks > 1 {
				add(prefix+".changes", "Only one manual boost can be unlocked on a path.")
			}
			tier4HasBoost := false
			for _, c := range branch.Tiers.Tier4.Changes {
				if c.Kind == "unlockBoost" {
					tier4HasBoost = true
				}
			}
			for changeIndex, change := range upgrade.Changes {
				changePath := fmt.Sprintf("%s.changes.%d", prefix, changeIndex)
				if (change.Kind == "stat" || change.Kind == "modifyBoost") && change.Operation == "multiply" && change.Number <= 0 {
					add(changePath, "A multiplier must be positive.")
				}
				if change.Kind == "unlockBoost" && tier != rules.Rules.ManualBoostUnlockTier {
					add(changePath, "A manual boost can only unlock at tier 4.")
				}
				if change.Kind == "modifyBoost" {
					if tier != rules.Rules.ManualBoostModifyTier {
						add(changePath, "A manual boost can only be modified at tier 5.")
					}
					if !tier4HasBoost {
						add(changePath, "This path has no tier 4 boost to modify.")
					}
				}
				if change.Kind == "followUp" && change.Target == "boost" {
					if tier < rules.Rules.ManualBoostUnlockTier || !tier4HasBoost {
						add(changePath, "An active follow-up requires this path's purchased tier 4 boost.")
					}
				}
			}
			if tier <= 2 {
				beforeSel := Selection{}
				beforeSel[pathIndex] = tier - 1
				afterSel := beforeSel
				afterSel[pathIndex] = tier
				before := ResolveUnchecked(blueprint, beforeSel).BaseAttack
				after := ResolveUnchecked(blueprint, afterSel).BaseAttack
				added := addedCapabilities(before, after)
				if before.DamageType != after.DamageType {
					added = append(added, "damage-type-access")
				}
				preserve := profile.DesignPolicy != nil && profile.DesignPolicy.PreserveEarlyAttackIdentity != nil && *profile.DesignPolicy.PreserveEarlyAttackIdentity
				// Personal detection stays allowed early; any other new capability is not.
				nonCamo := false
				for _, capability := range added {
					if !after.DetectsTrait(capability) {
						nonCamo = true
					}
				}
				if preserve && (nonCamo || before.Delivery != after.Delivery || before.Targeting != after.Targeting || (before.Stats.Projectiles == 1 && after.Stats.Projectiles > 1)) {
					add(prefix+".changes", "T1 and T2 improve the existing basic attack. They cannot introduce a new attack pattern, status or delivery; personal detection and improvements to existing stats remain allowed. Specialize at T3.")
				}
				if len(added) > profile.EarlyTierMaxNewCapabilities {
					add(prefix+".changes", fmt.Sprintf("Early tiers may add at most %d capability group; this adds %s.", profile.EarlyTierMaxNewCapabilities, strings.Join(added, ", ")))
				}
			}
		}
	}
	resolvedValuesValid := true
	noOp := map[string]bool{}
	downgrade := map[string]bool{}
	for _, selection := range AllLegalBuilds(rules) {
		build := ResolveUnchecked(blueprint, selection)
		label := fmt.Sprintf("%d-%d-%d", selection[0], selection[1], selection[2])
		buildIssues := ResolvedIssues(build, rules, "builds."+label, blueprint)
		if len(buildIssues) > 0 {
			resolvedValuesValid = false
		}
		issues = append(issues, buildIssues...)
		for pathIndex, path := range PathKeys {
			tier := selection[pathIndex]
			if tier == 0 {
				continue
			}
			previousSel := selection
			previousSel[pathIndex] = tier - 1
			previous := ResolveUnchecked(blueprint, previousSel)
			key := fmt.Sprintf("paths.%s.tiers.%s", path, TierKeys[tier-1])
			if sameBehavior(previous, build) {
				if !noOp[key] {
					add(key, fmt.Sprintf("Upgrade changes no behavior in legal build %s.", label))
					noOp[key] = true
				}
			} else if !hasBenefit(previous, build) && !downgrade[key] {
				add(key, fmt.Sprintf("Upgrade only reduces or preserves supported gameplay dimensions in legal build %s. Add a benefit; tradeoffs are allowed.", label))
				downgrade[key] = true
			}
		}
	}
	if resolvedValuesValid {
		issues = append(issues, DesignPolicyIssues(blueprint, rules)...)
	}
	return issues
}
