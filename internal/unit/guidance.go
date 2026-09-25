package unit

import s "github.com/mardwerk/unit-generator/internal/schema"

// DesignGuidance is the Definition policy guidance shared by drafting and repair.
func DesignGuidance(request *Request) []string {
	if request.MechanicsDefinition == nil || request.MechanicsDefinition.Profile.DesignPolicy == nil {
		return nil
	}
	policy := request.MechanicsDefinition.Profile.DesignPolicy
	specializations := "Shared specializations are allowed."
	if policy.DistinctPathSpecializations {
		specializations = "Use three different specializations."
	}
	out := []string{
		progressionReference,
		"The selected designPolicy is a hard authoring constraint with heuristic metrics, not a BTD6 balance law. Declare a specialization for each path: direct-damage, group-damage, attack-speed, control, range or ability-burst. " +
			specializations + " Establish each specialty by T3, make T4 its major payoff and T5 its capstone. At most " +
			s.FormatNumber(float64(policy.MaxManualAbilityPaths)) + " paths may unlock a manual boost. Automatic paths are complete designs.",
	}
	if policy.ManualAbilityPath.Present {
		if policy.ManualAbilityPath.Null {
			out = append(out, guideAutomaticOnly)
		} else {
			out = append(out, "Only "+policy.ManualAbilityPath.Value+" may unlock a manual boost at T4 or modify it at T5; even that path may remain automatic. Every other path must keep unlockBoost null and boostChanges empty. Assign the character technique suited to manual activation to the permitted path rather than adding extra active paths.")
		}
	}
	if policy.MinTier5SpecialtyMultiplier == nil {
		out = append(out, guideNoCapstoneMultiplier)
	} else {
		out = append(out, "This custom Profile requires Tier5 to improve an established Tier4 specialty metric by at least "+s.FormatNumber(*policy.MinTier5SpecialtyMultiplier)+" times. This optional capacity heuristic is not a universal BTD6 rule. Compare resolved builds, not raw modifiers; duty-only gains must retain peak output.")
	}
	first := "Repeated early behavior is allowed."
	if policy.DistinctFirstUpgrades {
		first = "No two T1 upgrades may produce the same resolved attack. Names, prices and different arithmetic expressions do not make identical effects different."
	}
	capstones := ""
	if policy.DistinctCapstones {
		capstones = "Pure T5 builds must differ mechanically even after ignoring names and costs."
	}
	out = append(out, "Distinct purchases: "+first+" "+capstones+" Strengthen the purchased branch rather than granting the other branches. A high-tier generalist can still be classified basic_dps; classification is not a power or quality grade.")
	if policy.PreserveEarlyAttackIdentity != nil && *policy.PreserveEarlyAttackIdentity {
		out = append(out, guideEarlyIdentity)
	}
	if policy.RequireTier3BehaviorChange != nil && *policy.RequireTier3BehaviorChange {
		out = append(out, guideTier3Transition)
	}
	return append(out, guidePatterns, guideThemes, guideNames, guidePrices)
}
