package unit

import s "github.com/mardwerk/unit-generator/src/cli/internal/schema"

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
		"The selected designPolicy is a hard authoring constraint with heuristic metrics, not a BTD6 balance law. Declare a specialization for each path: direct-damage, group-damage, attack-speed, control, range or ability-burst. " +
			specializations + " Establish each specialty by the third purchase, make the fourth its major payoff and the fifth its capstone. At most " +
			s.FormatNumber(float64(policy.MaxManualAbilityPaths)) + " paths may unlock a manual boost. Automatic paths are complete designs.",
		guideRoleScales,
	}
	if policy.ManualAbilityPath.Present {
		if policy.ManualAbilityPath.Null {
			out = append(out, guideAutomaticOnly)
		} else {
			out = append(out, "Only "+policy.ManualAbilityPath.Value+" ("+pathPosition(policy.ManualAbilityPath.Value)+" path) may unlock a manual boost at its fourth purchase or modify it at its fifth; even that path may remain automatic. Every other path must keep unlockBoost null and boostChanges empty. Assign the character technique suited to manual activation to the permitted path rather than adding extra active paths.")
		}
	}
	if policy.MinTier5SpecialtyMultiplier == nil {
		out = append(out, guideNoCapstoneMultiplier)
	} else {
		out = append(out, "This custom Profile requires the fifth purchase to improve an established fourth-purchase specialty metric by at least "+s.FormatNumber(*policy.MinTier5SpecialtyMultiplier)+" times. This optional capacity heuristic is not a universal BTD6 rule. Compare resolved builds, not raw modifiers; duty-only gains must retain peak output.")
	}
	first := "Repeated early behavior is allowed."
	if policy.DistinctFirstUpgrades {
		first = "No two first purchases (1-x-x, x-1-x, x-x-1) may produce the same resolved attack. Names, prices and different arithmetic expressions do not make identical effects different."
	}
	capstones := ""
	if policy.DistinctCapstones {
		capstones = "Pure 5-0-0, 0-5-0 and 0-0-5 builds must differ mechanically even after ignoring names and costs."
	}
	out = append(out, "Distinct purchases: "+first+" "+capstones+" Strengthen the purchased branch rather than granting the other branches. A high-tier generalist can still be classified basic_dps; classification is not a power or quality grade.")
	if policy.PreserveEarlyAttackIdentity != nil && *policy.PreserveEarlyAttackIdentity {
		out = append(out, guideEarlyIdentity)
	}
	if policy.RequireTier3BehaviorChange != nil && *policy.RequireTier3BehaviorChange {
		out = append(out, guideTier3Transition)
	}
	return append(out, guideDistinctPaths, guideNames, guidePrices)
}

// pathPosition names a path key's position in build codes.
func pathPosition(path string) string {
	switch path {
	case "path1":
		return "top"
	case "path2":
		return "middle"
	case "path3":
		return "bottom"
	}
	return path
}
