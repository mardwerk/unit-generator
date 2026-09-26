package mechanics

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

func atLeast(value, minimum float64) bool {
	return value >= minimum || math.Abs(value-minimum) <= 1e-12*math.Max(1, minimum)
}

func directDamage(attack Attack) float64 {
	st := attack.Stats
	count := st.Projectiles
	if attack.Distribution == "distinct-targets" {
		count = 1
	}
	return (st.Damage*count)/st.IntervalSeconds + st.BurnDamagePerSecond*math.Min(1, st.BurnSeconds/st.IntervalSeconds)
}

func groupDamage(attack Attack) float64 {
	st := attack.Stats
	spread := 1.0
	if attack.Distribution == "distinct-targets" {
		spread = st.Projectiles
	}
	direct := directDamage(attack) * st.Pierce * spread
	secondary := 0.0
	if f := attack.FollowUp; f != nil {
		inherited := 0.0
		if f.InheritStatuses {
			inherited = st.BurnDamagePerSecond * math.Min(1, st.BurnSeconds/st.IntervalSeconds)
		}
		secondary = f.Count * ((st.Damage*f.DamageMultiplier)/st.IntervalSeconds + inherited)
	}
	return direct + secondary
}

// SpecialtyMetrics are capacity heuristics for a pure build, in insertion order.
func SpecialtyMetrics(build Build, specialization string) *s.Object {
	st := build.BaseAttack.Stats
	out := s.NewObject()
	switch specialization {
	case "direct-damage":
		out.Set("direct damage rate", directDamage(build.BaseAttack))
	case "group-damage":
		out.Set("group damage rate upper bound", groupDamage(build.BaseAttack))
	case "attack-speed":
		out.Set("attacks per second", 1/st.IntervalSeconds)
	case "range":
		out.Set("range", st.Range)
	case "control":
		out.Set("slow coverage upper bound", st.SlowPercent*math.Min(1, st.SlowSeconds/st.IntervalSeconds)*st.Pierce)
		out.Set("stun coverage upper bound", math.Min(1, st.StunSeconds/st.IntervalSeconds)*st.Pierce)
	case "ability-burst":
		if len(build.Abilities) == 0 {
			return out
		}
		a := build.Abilities[0]
		out.Set("active peak direct damage rate", directDamage(a.BoostedAttack))
		out.Set("active peak group damage rate upper bound", groupDamage(a.BoostedAttack))
		out.Set("active duty fraction", math.Min(1, a.DurationSeconds/a.CooldownSeconds))
	}
	return out
}

func attackBehavior(attack Attack) []any {
	distribution := attack.Distribution
	if distribution == "" {
		distribution = "same-primary"
	}
	var follow any
	if f := attack.FollowUp; f != nil {
		follow = []any{f.Count, f.DamageMultiplier, f.Radius, f.InheritStatuses}
	}
	out := []any{attack.Delivery, attack.DamageType, attack.Targeting, attack.Camo, distribution, follow}
	for _, stat := range StatKeys {
		out = append(out, attack.Stats.Get(stat))
	}
	return out
}

// HasBehaviorTransition reports a new attack shape or capability.
func HasBehaviorTransition(before, after Build) bool {
	a, b := before.BaseAttack, after.BaseAttack
	dist := func(x Attack) string {
		if x.Distribution == "" {
			return "same-primary"
		}
		return x.Distribution
	}
	if a.Delivery != b.Delivery || a.Targeting != b.Targeting || dist(a) != dist(b) {
		return true
	}
	if a.FollowUp == nil && b.FollowUp != nil {
		return true
	}
	if a.Stats.Projectiles == 1 && b.Stats.Projectiles > 1 {
		return true
	}
	for _, key := range []string{"splashRadius", "slowPercent", "burnDamagePerSecond", "stunSeconds"} {
		if a.Stats.Get(key) == 0 && b.Stats.Get(key) > 0 {
			return true
		}
	}
	for _, ability := range after.Abilities {
		var prior *ResolvedAbility
		for i := range before.Abilities {
			if before.Abilities[i].Path == ability.Path {
				prior = &before.Abilities[i]
				break
			}
		}
		if (prior == nil || prior.BoostedAttack.FollowUp == nil) && ability.BoostedAttack.FollowUp != nil {
			return true
		}
	}
	return false
}

func policyBehavior(build Build) string {
	abilities := []any{}
	for _, a := range build.Abilities {
		abilities = append(abilities, []any{a.DurationSeconds, a.CooldownSeconds, attackBehavior(a.BoostedAttack)})
	}
	return s.Stringify([]any{attackBehavior(build.BaseAttack), abilities})
}

func pureBuild(blueprint *Blueprint, pathIndex, tier int) Build {
	selection := Selection{}
	selection[pathIndex] = tier
	return ResolveUnchecked(blueprint, selection)
}

// toPrecision4 is Number(x.toPrecision(4)) rendered as a JavaScript number.
func toPrecision4(x float64) string {
	rounded, _ := strconv.ParseFloat(strconv.FormatFloat(x, 'g', 4, 64), 64)
	return s.FormatNumber(rounded)
}

// DesignPolicyIssues applies the Definition's optional authoring gates.
func DesignPolicyIssues(blueprint *Blueprint, definition Definition) []Issue {
	policy := definition.Profile.DesignPolicy
	if policy == nil {
		return nil
	}
	var issues []Issue
	specializations := map[string]bool{}
	firstUpgrades := map[string]string{}
	capstones := map[string]string{}
	manualPaths := 0
	for index, path := range PathKeys {
		branch := blueprint.Paths.At(index)
		prefix := "paths." + path
		specialization := branch.Specialization
		if specialization == "" {
			issues = append(issues, Issue{prefix + ".specialization", "The design policy requires an explicit path specialization."})
		} else {
			if policy.DistinctPathSpecializations && specializations[specialization] {
				issues = append(issues, Issue{prefix + ".specialization", fmt.Sprintf("The design policy requires distinct path specializations; %s is already used.", specialization)})
			}
			specializations[specialization] = true
		}
		tier4 := pureBuild(blueprint, index, 4)
		tier5 := pureBuild(blueprint, index, 5)
		for _, req := range []struct {
			tier     int
			required *bool
		}{{3, policy.RequireTier3BehaviorChange}, {5, policy.RequireTier5BehaviorChange}} {
			if req.required != nil && *req.required && !HasBehaviorTransition(pureBuild(blueprint, index, req.tier-1), pureBuild(blueprint, index, req.tier)) {
				issues = append(issues, Issue{fmt.Sprintf("%s.tiers.tier%d", prefix, req.tier), fmt.Sprintf("Tier %d must introduce a supported attack behavior, such as a new delivery, distinct-target volley, status, splash or bounded follow-up. Increasing existing numbers or changing a name alone is insufficient.", req.tier)})
			}
		}
		for _, check := range []struct {
			enabled bool
			tier    int
			build   Build
			seen    map[string]string
		}{{policy.DistinctFirstUpgrades, 1, pureBuild(blueprint, index, 1), firstUpgrades}, {policy.DistinctCapstones, 5, tier5, capstones}} {
			if !check.enabled {
				continue
			}
			signature := policyBehavior(check.build)
			if previous, ok := check.seen[signature]; ok {
				issues = append(issues, Issue{fmt.Sprintf("%s.tiers.tier%d", prefix, check.tier), fmt.Sprintf("Resolved tier %d behavior duplicates %s; names and prices do not make a distinct upgrade.", check.tier, previous)})
			} else {
				check.seen[signature] = path
			}
		}
		manual := policy.ManualAbilityPath
		if len(tier4.Abilities) > 0 && manual.Present && (manual.Null || manual.Value != path) {
			message := fmt.Sprintf("The design policy permits a manual ability only on %s. This path must remain automatic.", manual.Value)
			if manual.Null {
				message = "The design policy does not permit manual abilities on any path."
			}
			issues = append(issues, Issue{prefix + ".tiers.tier4", message})
		}
		if len(tier4.Abilities) > 0 {
			manualPaths++
			if manualPaths > policy.MaxManualAbilityPaths {
				issues = append(issues, Issue{prefix + ".tiers.tier4", fmt.Sprintf("The design policy permits at most %d paths with manual abilities.", policy.MaxManualAbilityPaths)})
			}
		}
		if specialization == "" || policy.MinTier5SpecialtyMultiplier == nil {
			continue
		}
		minimum := *policy.MinTier5SpecialtyMultiplier
		before := SpecialtyMetrics(tier4, specialization)
		after := SpecialtyMetrics(tier5, specialization)
		type ratio struct {
			metric string
			value  float64
		}
		var ratios, peaks []ratio
		for _, metric := range before.Keys() {
			v, _ := before.Get(metric)
			value := v.(float64)
			n, ok := after.Get(metric)
			if !ok {
				continue
			}
			next := n.(float64)
			r := next / value
			if finite(value) && value > 0 && finite(next) && finite(r) {
				ratios = append(ratios, ratio{metric, r})
				if strings.HasPrefix(metric, "active peak") {
					peaks = append(peaks, ratio{metric, r})
				}
			}
		}
		improved := false
		for _, r := range ratios {
			peaksHold := len(peaks) > 0
			for _, p := range peaks {
				if !atLeast(p.value, 1) {
					peaksHold = false
				}
			}
			if atLeast(r.value, minimum) && (r.metric != "active duty fraction" || peaksHold) {
				improved = true
			}
		}
		if !improved {
			achieved := "no finite positive tier 4 specialty metric is established"
			if len(ratios) > 0 {
				parts := make([]string, len(ratios))
				for i, r := range ratios {
					parts[i] = fmt.Sprintf("%s: %sx", r.metric, toPrecision4(r.value))
				}
				achieved = strings.Join(parts, "; ")
			}
			suffix := ""
			if specialization == "ability-burst" {
				suffix = " A duty-only gain must also retain peak output."
			}
			issues = append(issues, Issue{prefix + ".tiers.tier5", fmt.Sprintf("Tier 5 must improve an established %s specialty metric by at least %sx over pure tier 4. Achieved %s.%s These are capacity heuristics, including group/control upper bounds, not simulated combat power or a universal BTD6 balance rule.", specialization, s.FormatNumber(minimum), achieved, suffix)})
		}
	}
	return issues
}

func finite(x float64) bool { return !math.IsNaN(x) && !math.IsInf(x, 0) }

// PurchaseMetrics are analytic capacities of a build, not measured combat output.
func PurchaseMetrics(build Build) *s.Object {
	out := s.NewObject()
	parts := []string{"direct-damage", "group-damage", "control", "range", "attack-speed"}
	if len(build.Abilities) > 0 {
		parts = append(parts, "ability-burst")
	}
	for _, part := range parts {
		m := SpecialtyMetrics(build, part)
		for _, key := range m.Keys() {
			v, _ := m.Get(key)
			if f := v.(float64); finite(f) {
				out.Set(key, f)
			} else {
				out.Set(key, nil)
			}
		}
	}
	return out
}

// CompareCapstonePurchases compares each path's tier 4 and tier 5 purchases.
func CompareCapstonePurchases(blueprint *Blueprint) []any {
	var out []any
	for index, path := range PathKeys {
		selection := Selection{}
		selection[index] = 4
		before := ResolveUnchecked(blueprint, selection)
		selection[index] = 5
		after := ResolveUnchecked(blueprint, selection)
		ratio := math.NaN()
		if before.CumulativeCost > 0 {
			ratio = after.CumulativeCost / before.CumulativeCost
		}
		var count any
		if finite(ratio) {
			count = math.Floor(ratio)
		}
		metrics := PurchaseMetrics(before)
		bounds := s.NewObject()
		if count != nil {
			for _, key := range []string{"direct damage rate", "group damage rate upper bound"} {
				value, _ := metrics.Get(key)
				product := math.NaN()
				if f, ok := value.(float64); ok {
					product = f * count.(float64)
				}
				if finite(product) {
					bounds.Set(key, product)
				} else {
					bounds.Set(key, nil)
				}
			}
		}
		out = append(out, s.NewObject().
			Set("path", path).
			Set("tier4", s.NewObject().Set("totalGold", before.CumulativeCost).Set("metrics", metrics)).
			Set("tier5", s.NewObject().Set("totalGold", after.CumulativeCost).Set("metrics", PurchaseMetrics(after))).
			Set("tier4CopiesAtTier5Budget", count).
			Set("sameBudgetTier4Copies", s.NewObject().Set("count", count).Set("additiveThroughputUpperBounds", bounds).Set("perCopyMetrics", metrics)).
			Set("assumption", "Ideal sustained access to eligible targets. Group/control metrics are capacity upper bounds; active peaks are not sustained output. Copy throughput assumes independent target access and extra placement space; range, attack frequency, control coverage and active duty are per-copy values, not summed. A zero-cost tier-four build has no finite budget-limited copy count. Null metrics or counts are unavailable because the calculation has no finite numeric result. No waves, buffs, geometry, actual crowd density or balance are simulated."))
	}
	return out
}
