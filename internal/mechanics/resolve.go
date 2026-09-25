package mechanics

import (
	"fmt"
	"math"
	"strings"

	s "github.com/mardwerk/unit-generator/internal/schema"
)

// ResolvedAbility is an available manual boost and the attack it produces.
type ResolvedAbility struct {
	Name               string  `json:"name"`
	DurationSeconds    float64 `json:"durationSeconds"`
	CooldownSeconds    float64 `json:"cooldownSeconds"`
	DamageMultiplier   float64 `json:"damageMultiplier"`
	IntervalMultiplier float64 `json:"intervalMultiplier"`
	RangeBonus         float64 `json:"rangeBonus"`
	Path               string  `json:"path"`
	Available          bool    `json:"available"`
	InitiallyReady     bool    `json:"initiallyReady"`
	BoostedAttack      Attack  `json:"boostedAttack"`
}

// TierDelta is the attack before and after one purchase.
type TierDelta struct {
	Path            string   `json:"path"`
	Tier            int      `json:"tier"`
	Name            string   `json:"name"`
	IncrementalCost float64  `json:"incrementalCost"`
	CumulativeCost  float64  `json:"cumulativeCost"`
	Changes         []Change `json:"changes"`
	BeforeAttack    Attack   `json:"beforeAttack"`
	AfterAttack     Attack   `json:"afterAttack"`
}

// Build is a resolved build without per-tier deltas.
type Build struct {
	Selection      Selection         `json:"selection"`
	BaseAttack     Attack            `json:"baseAttack"`
	Abilities      []ResolvedAbility `json:"abilities"`
	CumulativeCost float64           `json:"cumulativeCost"`
}

// ResolvedBuild is a build with the effect of each purchase.
type ResolvedBuild struct {
	Selection      Selection         `json:"selection"`
	BaseAttack     Attack            `json:"baseAttack"`
	Abilities      []ResolvedAbility `json:"abilities"`
	CumulativeCost float64           `json:"cumulativeCost"`
	TierDeltas     []TierDelta       `json:"tierDeltas"`
}

// ValidationError carries mechanics issues.
type ValidationError struct{ Issues []Issue }

func (e *ValidationError) Error() string {
	lines := make([]string, len(e.Issues))
	for i, issue := range e.Issues {
		lines[i] = issue.Path + ": " + issue.Message
	}
	return strings.Join(lines, "\n")
}

// SelectionIssues checks a build against the Definition's crosspath limits.
func SelectionIssues(selection Selection, definition Definition) []Issue {
	for _, tier := range selection {
		if tier < 0 || tier > 5 {
			return []Issue{{"selection", "A build must contain three integer tiers from 0 through 5."}}
		}
	}
	p := definition.Progression
	purchased, advanced := 0, 0
	for _, tier := range selection {
		if tier > 0 {
			purchased++
		}
		if tier > p.CrosspathTier {
			advanced++
		}
	}
	if purchased > p.MaxPurchasedPaths || advanced > p.MaxAdvancedPaths {
		return []Issue{{"selection", fmt.Sprintf("At most %d paths may be purchased and only %d may exceed tier %d.", p.MaxPurchasedPaths, p.MaxAdvancedPaths, p.CrosspathTier)}}
	}
	return nil
}

// AllLegalBuilds lists every legal selection in path order.
func AllLegalBuilds(definition Definition) []Selection {
	var builds []Selection
	for a := 0; a <= 5; a++ {
		for b := 0; b <= 5; b++ {
			for c := 0; c <= 5; c++ {
				selection := Selection{a, b, c}
				if len(SelectionIssues(selection, definition)) == 0 {
					builds = append(builds, selection)
				}
			}
		}
	}
	return builds
}

// Purchase is one bought upgrade.
type Purchase struct {
	PathIndex int
	Tier      int
	Upgrade   *Tier
}

// Purchases lists bought upgrades in canonical order: tier, then path.
func Purchases(blueprint *Blueprint, selection Selection) []Purchase {
	var out []Purchase
	for tier := 1; tier <= 5; tier++ {
		for pathIndex := range PathKeys {
			if selection[pathIndex] >= tier {
				out = append(out, Purchase{pathIndex, tier, blueprint.Paths.At(pathIndex).Tiers.At(tier)})
			}
		}
	}
	return out
}

func calculate(initial float64, changes []Change) float64 {
	baseline, addition, multiplier := initial, 0.0, 1.0
	for _, change := range changes {
		switch change.Operation {
		case "set":
			baseline = change.Number
		case "add":
			addition += change.Number
		default:
			multiplier *= change.Number
		}
	}
	return (baseline + addition) * multiplier
}

// ResolveUnchecked resolves a build without validating it.
func ResolveUnchecked(blueprint *Blueprint, selection Selection) Build {
	bought := Purchases(blueprint, selection)
	var changes []Change
	for _, p := range bought {
		changes = append(changes, p.Upgrade.Changes...)
	}
	attack := blueprint.BaseAttack.Clone()
	for _, stat := range StatKeys {
		var matching []Change
		for _, c := range changes {
			if c.Kind == "stat" && c.Stat == stat {
				matching = append(matching, c)
			}
		}
		attack.Stats.Set(stat, calculate(attack.Stats.Get(stat), matching))
	}
	for _, c := range changes {
		switch c.Kind {
		case "camo":
			attack.Camo = c.Bool
		case "delivery":
			attack.Delivery = c.Text
		case "damageType":
			attack.DamageType = c.Text
		case "targeting":
			attack.Targeting = c.Text
		case "distribution":
			attack.Distribution = c.Text
		case "followUp":
			if c.Target == "base" {
				f := *c.FollowUp
				attack.FollowUp = &f
			}
		}
	}
	abilities := []ResolvedAbility{}
	for pathIndex, path := range PathKeys {
		var local []Change
		for _, p := range bought {
			if p.PathIndex == pathIndex {
				local = append(local, p.Upgrade.Changes...)
			}
		}
		var unlock *Change
		for i := range local {
			if local[i].Kind == "unlockBoost" {
				unlock = &local[i]
				break
			}
		}
		if unlock == nil {
			continue
		}
		boost := *unlock.Boost
		for _, stat := range BoostStatKeys {
			var matching []Change
			for _, c := range local {
				if c.Kind == "modifyBoost" && c.Stat == stat {
					matching = append(matching, c)
				}
			}
			boost.Set(stat, calculate(boost.Get(stat), matching))
		}
		boosted := attack.Clone()
		boosted.Stats.Damage *= boost.DamageMultiplier
		boosted.Stats.IntervalSeconds *= boost.IntervalMultiplier
		boosted.Stats.Range += boost.RangeBonus
		for _, c := range local {
			if c.Kind == "followUp" && c.Target == "boost" {
				f := *c.FollowUp
				boosted.FollowUp = &f
			}
		}
		abilities = append(abilities, ResolvedAbility{
			Name: boost.Name, DurationSeconds: boost.DurationSeconds, CooldownSeconds: boost.CooldownSeconds,
			DamageMultiplier: boost.DamageMultiplier, IntervalMultiplier: boost.IntervalMultiplier, RangeBonus: boost.RangeBonus,
			Path: path, Available: true, InitiallyReady: true, BoostedAttack: boosted,
		})
	}
	cost := blueprint.BaseAttack.Cost
	for _, p := range bought {
		cost += p.Upgrade.Cost
	}
	return Build{Selection: selection, BaseAttack: attack, Abilities: abilities, CumulativeCost: cost}
}

// ResolvedIssues checks the values of a resolved build.
func ResolvedIssues(build Build, definition Definition, prefix string, blueprint *Blueprint) []Issue {
	var issues []Issue
	add := func(path, message string) { issues = append(issues, Issue{prefix + "." + path, message}) }
	checkAttack := func(attack Attack, path string) {
		_, parseIssues := s.Parse(AttackSchema, s.FromGoValue(attack))
		for _, issue := range parseIssues {
			stat := ""
			if len(issue.Path) >= 2 && issue.Path[0] == "stats" {
				stat, _ = issue.Path[1].(string)
			}
			if stat == "projectiles" || stat == "pierce" {
				var modifiers []string
				if blueprint != nil {
					for _, p := range Purchases(blueprint, build.Selection) {
						for index, change := range p.Upgrade.Changes {
							if change.Kind == "stat" && change.Stat == stat {
								modifiers = append(modifiers, fmt.Sprintf("paths.%s.tiers.tier%d.changes.%d: %s %s", PathKeys[p.PathIndex], p.Tier, index, change.Operation, s.FormatNumber(change.Number)))
							}
						}
					}
				}
				message := fmt.Sprintf("Resolved %s is %s; must be a positive integer. ", stat, s.FormatNumber(attack.Stats.Get(stat)))
				if len(modifiers) > 0 {
					message += "Purchased modifiers: " + strings.Join(modifiers, "; ") + ". "
				}
				if blueprint != nil {
					message += "Starting base " + s.FormatNumber(blueprint.BaseAttack.Stats.Get(stat)) + ". "
				}
				message += "Correct the authored count changes so (last set or base + all adds) * all multipliers is integral in every legal build. Counts are never rounded."
				add(path+".stats."+stat, message)
			} else {
				add(path+"."+issue.PathString(), issue.Message)
			}
		}
		for _, stat := range StatKeys {
			if attack.Stats.Get(stat) > definition.Profile.MaxStatValue {
				add(path+".stats."+stat, "Exceeds the Definition stat ceiling.")
			}
		}
		st := attack.Stats
		if attack.Distribution == "distinct-targets" && !definition.Rules.HasExtension("distinct-volley") {
			add(path+".distribution", "This Definition does not enable distinct-target volleys.")
		}
		if attack.FollowUp != nil {
			if !definition.Rules.HasExtension("volley-follow-up") {
				add(path+".followUp", "This Definition does not enable volley follow-ups.")
			}
			f := attack.FollowUp
			for _, entry := range []struct {
				key   string
				value float64
			}{{"count", f.Count}, {"damageMultiplier", f.DamageMultiplier}, {"radius", f.Radius}} {
				if entry.value > definition.Profile.MaxStatValue {
					add(path+".followUp."+entry.key, "Exceeds the Definition stat ceiling.")
				}
			}
			secondary := st.Damage * f.DamageMultiplier
			if math.IsNaN(secondary) || math.IsInf(secondary, 0) || secondary > definition.Profile.MaxStatValue {
				add(path+".followUp.damageMultiplier", "Resolved secondary damage exceeds the Definition stat ceiling.")
			}
		}
		if (st.SlowPercent > 0) != (st.SlowSeconds > 0) {
			add(path+".stats.slowSeconds", "Slow requires both a positive percent and duration.")
		}
		if (st.BurnDamagePerSecond > 0) != (st.BurnSeconds > 0) {
			add(path+".stats.burnSeconds", "Burn requires both positive damage per second and duration.")
		}
		if st.Damage == 0 && st.BurnDamagePerSecond == 0 && st.SlowPercent == 0 && st.StunSeconds == 0 {
			add(path, "An attack must supply damage, burn, slow or stun.")
		}
		if attack.Delivery == "area" && st.SplashRadius <= 0 {
			add(path+".stats.splashRadius", "Area delivery requires a positive splash radius.")
		}
		if st.SplashRadius > 0 && st.Pierce < 2 {
			add(path+".stats.splashRadius", "Splash requires pierce of at least 2 because the primary target consumes one target slot.")
		}
	}
	checkAttack(build.BaseAttack, "baseAttack")
	for index, ability := range build.Abilities {
		boost := Boost{ability.Name, ability.DurationSeconds, ability.CooldownSeconds, ability.DamageMultiplier, ability.IntervalMultiplier, ability.RangeBonus}
		_, parseIssues := s.Parse(BoostSchema, s.FromGoValue(boost))
		for _, issue := range parseIssues {
			add(fmt.Sprintf("abilities.%d.%s", index, issue.PathString()), issue.Message)
		}
		for _, stat := range BoostStatKeys {
			if boost.Get(stat) > definition.Profile.MaxStatValue {
				add(fmt.Sprintf("abilities.%d.%s", index, stat), "Exceeds the Definition stat ceiling.")
			}
		}
		if boost.DurationSeconds > boost.CooldownSeconds {
			add(fmt.Sprintf("abilities.%d.durationSeconds", index), "Duration may not exceed cooldown in this Definition.")
		}
		boosted, base := ability.BoostedAttack, build.BaseAttack
		if s.Stringify(s.FromGoValue(boosted)) == s.Stringify(s.FromGoValue(base)) {
			add(fmt.Sprintf("abilities.%d", index), "The boost must change the resolved attack.")
		} else if boosted.Stats.Damage <= base.Stats.Damage && boosted.Stats.IntervalSeconds >= base.Stats.IntervalSeconds && boosted.Stats.Range <= base.Stats.Range {
			add(fmt.Sprintf("abilities.%d", index), "The boost must improve damage, attack interval or range over the purchased attack; tradeoffs are allowed.")
		}
		checkAttack(boosted, fmt.Sprintf("abilities.%d.boostedAttack", index))
	}
	if math.IsNaN(build.CumulativeCost) || math.IsInf(build.CumulativeCost, 0) {
		add("cumulativeCost", "Cumulative cost must be finite.")
	}
	return issues
}

// WithTierDeltas resolves a build and records each purchase's effect.
func WithTierDeltas(blueprint *Blueprint, selection Selection) ResolvedBuild {
	resolved := ResolveUnchecked(blueprint, selection)
	intermediate := Selection{}
	previous := ResolveUnchecked(blueprint, intermediate)
	deltas := []TierDelta{}
	for _, p := range Purchases(blueprint, selection) {
		intermediate[p.PathIndex] = p.Tier
		next := ResolveUnchecked(blueprint, intermediate)
		deltas = append(deltas, TierDelta{
			Path: PathKeys[p.PathIndex], Tier: p.Tier, Name: p.Upgrade.Name,
			IncrementalCost: p.Upgrade.Cost, CumulativeCost: next.CumulativeCost,
			Changes: append([]Change(nil), p.Upgrade.Changes...), BeforeAttack: previous.BaseAttack, AfterAttack: next.BaseAttack,
		})
		previous = next
	}
	return ResolvedBuild{resolved.Selection, resolved.BaseAttack, resolved.Abilities, resolved.CumulativeCost, deltas}
}

// ResolveBuild validates the blueprint and selection, then resolves the build.
func ResolveBuild(blueprint *Blueprint, selection Selection, definition Definition) (ResolvedBuild, error) {
	if issues := ValidateBlueprint(s.FromGoValue(blueprint), s.FromGoValue(definition)); len(issues) > 0 {
		return ResolvedBuild{}, &ValidationError{issues}
	}
	if issues := SelectionIssues(selection, definition); len(issues) > 0 {
		return ResolvedBuild{}, &ValidationError{issues}
	}
	return WithTierDeltas(blueprint, selection), nil
}

// TargetAssessment is static target eligibility, without simulating combat.
type TargetAssessment struct {
	Detected  bool `json:"detected"`
	Reachable bool `json:"reachable"`
	CanDamage bool `json:"canDamage"`
	CanSlow   bool `json:"canSlow"`
	CanStun   bool `json:"canStun"`
}

// AssessTarget reports whether an attack can detect, reach and affect a target.
func AssessTarget(attack Attack, camo, obstructed bool, properties []string, definition Definition) TargetAssessment {
	rules := definition.Rules
	has := func(list []string) bool {
		for _, a := range list {
			for _, b := range properties {
				if a == b {
					return true
				}
			}
		}
		return false
	}
	detected := !camo || attack.Camo
	reachable := !obstructed
	eligible := detected && reachable
	immune := has(rules.DamageImmunities.For(attack.DamageType))
	return TargetAssessment{
		Detected:  detected,
		Reachable: reachable,
		CanDamage: eligible && !immune && (attack.Stats.Damage > 0 || attack.Stats.BurnDamagePerSecond > 0),
		CanSlow:   eligible && attack.Stats.SlowPercent > 0 && !has(rules.SlowImmune),
		CanStun:   eligible && attack.Stats.StunSeconds > 0 && !has(rules.StunImmune),
	}
}
