package render

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	m "github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
	"github.com/mardwerk/unit-generator/src/cli/internal/unit"
)

// Purchase sentences describe resolved mechanics for readers: each change a
// purchase makes, with the exact numbers of its pure path. They add no rule
// of their own; the blueprint and its Definition decide every value.

// pathPositions name the paths in build-code order.
var pathPositions = []string{"Top", "Middle", "Bottom"}

// Purchase is one bought upgrade as the unit sheet shows it.
type Purchase struct {
	Code    string   `json:"code"`
	Name    string   `json:"name"`
	Cost    float64  `json:"cost"`
	Effects []string `json:"effects"`
}

// PathPurchases are a path's five purchases in order.
type PathPurchases struct {
	Position  string     `json:"position"`
	Name      string     `json:"name"`
	Purchases []Purchase `json:"purchases"`
}

// sheet resolves one blueprint under its Definition for the sentences.
type sheet struct {
	blueprint  *m.Blueprint
	definition m.Definition
	vocabulary m.Vocabulary
	currency   string
}

func newSheet(blueprint *m.Blueprint, definition *m.Definition) *sheet {
	if blueprint == nil {
		return nil
	}
	d := m.DefaultDefinition()
	if definition != nil {
		d = *definition
	}
	if len(m.ValidateTyped(blueprint, d)) > 0 {
		return nil
	}
	return &sheet{blueprint: blueprint, definition: d, vocabulary: d.Terms(), currency: d.Profile.Currency}
}

func (sh *sheet) resolve(selection m.Selection) m.Build {
	return m.ResolveUnchecked(sh.blueprint, selection)
}

// decimal writes a stat with at most four decimals.
func decimal(value float64) string {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return s.FormatNumber(value)
	}
	rounded, _ := strconv.ParseFloat(strconv.FormatFloat(value, 'f', 4, 64), 64)
	return s.FormatNumber(rounded)
}

// price writes a price with thousands separators: 15000 is 15,000.
func price(value float64) string {
	text := decimal(value)
	whole, fraction, _ := strings.Cut(text, ".")
	negative := strings.HasPrefix(whole, "-")
	whole = strings.TrimPrefix(whole, "-")
	for i := len(whole) - 3; i > 0; i -= 3 {
		whole = whole[:i] + "," + whole[i:]
	}
	if negative {
		whole = "-" + whole
	}
	if fraction != "" {
		return whole + "." + fraction
	}
	return whole
}

func (sh *sheet) money(value float64) string { return price(value) + " " + sh.currency }

func (sh *sheet) damageTypeName(id string) string {
	if damageType, ok := sh.vocabulary.DamageType(id); ok && damageType.Name != "" {
		return damageType.Name
	}
	return capitalized(id)
}

func (sh *sheet) effect(id string) m.StatusEffect {
	if effect, ok := sh.vocabulary.Effect(id); ok {
		return effect
	}
	return m.StatusEffect{ID: id, Name: capitalized(id), Stacking: m.Stacking{MaxStacks: 1}}
}

func capitalized(text string) string {
	if text == "" {
		return text
	}
	return strings.ToUpper(text[:1]) + text[1:]
}

func lowerFirst(text string) string {
	if text == "" {
		return text
	}
	return strings.ToLower(text[:1]) + text[1:]
}

// magnitude writes an effect's magnitude with its unit: 30% or 5 damage/s.
func (sh *sheet) magnitude(value float64, effect m.StatusEffect) string {
	return decimal(value) + magnitudeSuffix(effect)
}

// status describes an applied status: "Slow 30% for 2 s".
func (sh *sheet) status(status m.StatusApplication) string {
	effect := sh.effect(status.Effect)
	text := effect.Name + " for " + decimal(status.Seconds) + " s"
	if status.Magnitude != nil {
		text = effect.Name + " " + sh.magnitude(*status.Magnitude, effect) + " for " + decimal(status.Seconds) + " s"
	}
	if effect.Stacking.MaxStacks > 1 {
		text += fmt.Sprintf(", stacking up to %d times", effect.Stacking.MaxStacks)
	}
	if limit := effect.Stacking.MaxMagnitude; limit != nil {
		text += ", at most " + sh.magnitude(*limit, effect) + " combined"
	}
	return text
}

func (sh *sheet) detectionName(trait string) string {
	return termName(trait, sh.vocabulary.Detection)
}

func (sh *sheet) targetingName(id string) string {
	return termName(id, sh.vocabulary.Targeting)
}

// immunity says which enemy properties a damage type cannot hurt.
func (sh *sheet) immunity(damageType string) string {
	kind, ok := sh.vocabulary.DamageType(damageType)
	name := sh.damageTypeName(damageType)
	if !ok || len(kind.IneffectiveAgainst) == 0 {
		return name + " damage can hurt every enemy property."
	}
	var names []string
	for _, property := range kind.IneffectiveAgainst {
		names = append(names, termName(property, sh.vocabulary.EnemyProperties))
	}
	return name + " damage cannot hurt " + joinAnd(names) + " enemies."
}

func joinAnd(items []string) string {
	switch len(items) {
	case 0:
		return ""
	case 1:
		return items[0]
	}
	return strings.Join(items[:len(items)-1], ", ") + " and " + items[len(items)-1]
}

func plural(count float64, one, many string) string {
	if count == 1 {
		return one
	}
	return many
}

// shot names what one attack emits.
func shot(attack m.Attack) string {
	if attack.Delivery == "projectile" {
		return "projectile"
	}
	return "pulse"
}

// followUp describes a bounded follow-up of an attack.
func (sh *sheet) followUp(f m.FollowUp, damage float64) string {
	inherit := "it applies no statuses"
	if f.InheritStatuses {
		inherit = "it applies the attack's purchased statuses"
	}
	return fmt.Sprintf("%s: after each volley hits, up to %s other detected %s within %s of the primary impact take %s times the hit damage (%s) once each; %s, never recurses and inherits no pierce, splash or volley count",
		f.Name, decimal(f.Count), plural(f.Count, "enemy", "enemies"), decimal(f.Radius), decimal(f.DamageMultiplier), decimal(damage*f.DamageMultiplier), inherit)
}

// attackSentences describe a whole resolved attack, as the base Unit has it.
// attackSentences describes what an attack does. Defaults the reader need
// not act on stay internal: the Definition's first targeting priority, the
// clear-path delivery rule and detection the attack lacks.
func (sh *sheet) attackSentences(attack m.Attack) []string {
	st := attack.Stats
	aim := "its target"
	if attack.Distribution == "distinct-targets" {
		aim = "different detected enemies in range, its target first; unused shots are lost"
	}
	targeting := ""
	if len(sh.vocabulary.Targeting) > 0 && attack.Targeting != sh.vocabulary.Targeting[0].ID {
		targeting = " with " + sh.targetingName(attack.Targeting) + " targeting"
	}
	out := []string{fmt.Sprintf("%s is an automatic %s attack%s. Every %s s it fires %s %s at %s; each deals %s %s damage to up to %s %s, at range %s.",
		attack.Name, attack.Delivery, targeting, decimal(st.IntervalSeconds), decimal(st.Projectiles), plural(st.Projectiles, shot(attack), shot(attack)+"s"), aim,
		decimal(st.Damage), sh.damageTypeName(attack.DamageType), decimal(st.Pierce), plural(st.Pierce, "enemy", "enemies"), decimal(st.Range))}
	if st.SplashRadius > 0 {
		out = append(out, "Its splash radius is "+decimal(st.SplashRadius)+", shared within the same target cap.")
	}
	var statuses []string
	for _, status := range attack.AppliedStatuses() {
		statuses = append(statuses, sh.status(status))
	}
	if len(statuses) > 0 {
		out = append(out, "Each hit applies "+joinAnd(statuses)+".")
	}
	if attack.FollowUp != nil {
		out = append(out, capitalized(sh.followUp(*attack.FollowUp, st.Damage))+".")
	}
	var detected []string
	for _, trait := range sh.vocabulary.Detection {
		if attack.DetectsTrait(trait.ID) {
			detected = append(detected, sh.detectionName(trait.ID))
		}
	}
	if len(detected) > 0 {
		out = append(out, "It detects "+joinAnd(detected)+" enemies.")
	}
	return append(out, sh.immunity(attack.DamageType))
}

var statNames = map[string]string{
	"damage":              "damage",
	"intervalSeconds":     "the attack interval",
	"range":               "range",
	"pierce":              "pierce",
	"projectiles":         "projectiles per attack",
	"splashRadius":        "splash radius",
	"slowPercent":         "Slow",
	"slowSeconds":         "Slow duration",
	"burnDamagePerSecond": "Burn",
	"burnSeconds":         "Burn duration",
	"stunSeconds":         "Stun duration",
}

func statUnit(stat string) string {
	switch stat {
	case "intervalSeconds", "slowSeconds", "burnSeconds", "stunSeconds":
		return " s"
	case "slowPercent":
		return "%"
	case "burnDamagePerSecond":
		return " damage/s"
	}
	return ""
}

// operations describes how a purchase's own changes compose: "+1", "×0.85"
// or "base value set to 20".
func operations(changes []m.Change) string {
	var parts []string
	for _, change := range changes {
		switch change.Operation {
		case "add":
			sign := "+"
			if change.Number < 0 {
				sign = "-"
			}
			parts = append(parts, sign+decimal(math.Abs(change.Number)))
		case "multiply":
			parts = append(parts, "×"+decimal(change.Number))
		default:
			parts = append(parts, "base value set to "+decimal(change.Number)+"; purchased additions and multipliers still apply")
		}
	}
	return strings.Join(parts, ", ")
}

// numberChange writes a resolved number's change as a sentence.
func numberChange(label, unitText string, before, after float64, lowerIsBetter bool, how string) string {
	verb := "Raises"
	switch {
	case before == after:
		verb = "Keeps"
	case lowerIsBetter && after < before:
		verb = "Shortens"
	case lowerIsBetter:
		verb = "Lengthens"
	case after < before:
		verb = "Lowers"
	}
	text := fmt.Sprintf("%s %s from %s%s to %s%s", verb, label, decimal(before), unitText, decimal(after), unitText)
	if verb == "Keeps" {
		text = fmt.Sprintf("Keeps %s at %s%s", label, decimal(after), unitText)
	}
	if how != "" {
		text += " (" + how + ")"
	}
	return text + "."
}

// purchaseEffects describes one purchase with the resolved values of the
// builds before and after it.
func (sh *sheet) purchaseEffects(changes []m.Change, before, after m.Build) []string {
	var order []string
	groups := map[string][]m.Change{}
	for _, change := range changes {
		key := change.Kind + "." + change.Target
		switch change.Kind {
		case "stat", "modifyBoost":
			key = change.Kind + "." + change.Stat
		case "status":
			key = change.Kind + "." + change.Effect
		case "detection":
			key = change.Kind + "." + change.Trait
		}
		if _, ok := groups[key]; !ok {
			order = append(order, key)
		}
		groups[key] = append(groups[key], change)
	}
	prior, next := before.BaseAttack, after.BaseAttack
	var out []string
	for _, key := range order {
		group := groups[key]
		change := group[len(group)-1]
		switch change.Kind {
		case "stat":
			label := statNames[change.Stat]
			if change.Stat == "projectiles" && next.Delivery != "projectile" {
				label = "pulses per attack"
			}
			out = append(out, numberChange(label, statUnit(change.Stat), prior.Stats.Get(change.Stat), next.Stats.Get(change.Stat), change.Stat == "intervalSeconds", operations(group)))
		case "status":
			effect := sh.effect(change.Effect)
			was, had := prior.Status(change.Effect)
			now, has := next.Status(change.Effect)
			switch {
			case !had && has:
				out = append(out, "Adds "+sh.status(now)+" to each hit.")
			case had && !has:
				out = append(out, "Removes "+effect.Name+".")
			default:
				if was.Strength() != now.Strength() {
					out = append(out, numberChange(effect.Name, magnitudeSuffix(effect), was.Strength(), now.Strength(), false, ""))
				}
				if was.Seconds != now.Seconds {
					out = append(out, numberChange(effect.Name+" duration", " s", was.Seconds, now.Seconds, false, ""))
				}
			}
		case "detection", "camo":
			trait := change.Trait
			if change.Kind == "camo" {
				trait = "camo"
			}
			if change.Bool {
				out = append(out, "Adds "+sh.detectionName(trait)+" detection to this Unit's attack.")
			} else {
				out = append(out, "Removes "+sh.detectionName(trait)+" detection.")
			}
		case "damageType":
			out = append(out, fmt.Sprintf("Switches damage from %s to %s. %s", sh.damageTypeName(prior.DamageType), sh.damageTypeName(next.DamageType), sh.immunity(next.DamageType)))
		case "delivery":
			out = append(out, fmt.Sprintf("Replaces %s delivery with %s delivery.", prior.Delivery, next.Delivery))
		case "targeting":
			out = append(out, fmt.Sprintf("Changes targeting from %s to %s.", sh.targetingName(prior.Targeting), sh.targetingName(next.Targeting)))
		case "distribution":
			if next.Distribution == "distinct-targets" {
				out = append(out, "Aims each projectile at a different detected enemy in range, the selected target first; unused shots are lost.")
			} else {
				out = append(out, "Aims every projectile at the selected target again.")
			}
		case "followUp":
			if change.Target == "boost" {
				name := "the manual ability"
				if ability := newAbilityOrLast(after); ability != nil {
					name = ability.Name
				}
				out = append(out, "While "+name+" is active, adds "+sh.followUp(*change.FollowUp, next.Stats.Damage)+".")
			} else if prior.FollowUp != nil {
				out = append(out, "Replaces "+prior.FollowUp.Name+" with "+sh.followUp(*change.FollowUp, next.Stats.Damage)+".")
			} else {
				out = append(out, "Adds "+sh.followUp(*change.FollowUp, next.Stats.Damage)+".")
			}
		case "unlockBoost":
			if ability := newAbility(before, after); ability != nil {
				out = append(out, sh.abilitySentence(*ability))
			}
		case "modifyBoost":
			if ability := newAbilityOrLast(after); ability != nil {
				var old *m.ResolvedAbility
				for i := range before.Abilities {
					if before.Abilities[i].Path == ability.Path {
						old = &before.Abilities[i]
					}
				}
				if old != nil {
					out = append(out, boostChange(ability.Name, change.Stat, boostStat(old, change.Stat), boostStat(ability, change.Stat)))
				}
			}
		}
	}
	return out
}

// magnitudeSuffix follows a magnitude: "%" or " damage/s".
func magnitudeSuffix(effect m.StatusEffect) string {
	if effect.Magnitude == nil || effect.Magnitude.Unit == "percent" {
		return "%"
	}
	return " " + effect.Magnitude.Unit
}

func boostChange(name, stat string, before, after float64) string {
	switch stat {
	case "durationSeconds":
		return numberChange(name+" duration", " s", before, after, false, "")
	case "cooldownSeconds":
		return numberChange(name+" recharge", " s", before, after, true, "")
	case "damageMultiplier":
		return numberChange(name+"'s damage multiplier", "", before, after, false, "")
	case "intervalMultiplier":
		return numberChange(name+"'s interval multiplier", "", before, after, true, "")
	}
	return numberChange(name+"'s range bonus", "", before, after, false, "")
}

// abilitySentence describes the manual boost a purchase unlocks.
func (sh *sheet) abilitySentence(ability m.ResolvedAbility) string {
	boosted := ability.BoostedAttack.Stats
	var effects []string
	if ability.DamageMultiplier != 1 {
		effects = append(effects, "multiplies the purchased attack's damage by "+decimal(ability.DamageMultiplier))
	}
	if ability.IntervalMultiplier != 1 {
		effects = append(effects, "multiplies its interval by "+decimal(ability.IntervalMultiplier))
	}
	if ability.RangeBonus != 0 {
		effects = append(effects, "adds "+decimal(ability.RangeBonus)+" range")
	}
	if len(effects) == 0 {
		effects = append(effects, "leaves the purchased attack unchanged")
	}
	return fmt.Sprintf("Adds %s, this Unit's manual ability: for %s s it %s, so the attack deals %s damage every %s s at range %s. It is ready on purchase, recharges %s s after activation and cannot reactivate while active; it grants no separate attack.",
		ability.Name, decimal(ability.DurationSeconds), joinAnd(effects),
		decimal(boosted.Damage), decimal(boosted.IntervalSeconds), decimal(boosted.Range), decimal(ability.CooldownSeconds))
}

func newAbility(before, after m.Build) *m.ResolvedAbility {
	for i := range after.Abilities {
		found := false
		for _, old := range before.Abilities {
			if old.Path == after.Abilities[i].Path {
				found = true
			}
		}
		if !found {
			return &after.Abilities[i]
		}
	}
	return nil
}

func newAbilityOrLast(after m.Build) *m.ResolvedAbility {
	if len(after.Abilities) == 0 {
		return nil
	}
	return &after.Abilities[len(after.Abilities)-1]
}

// Purchases describes every purchase of a valid blueprint along its pure
// path. It returns nil for a candidate without valid typed mechanics.
func Purchases(candidate unit.Candidate, definition *m.Definition) []PathPurchases {
	sh := newSheet(candidate.Blueprint, definition)
	if sh == nil {
		return nil
	}
	return sh.purchases()
}

func (sh *sheet) purchases() []PathPurchases {
	var out []PathPurchases
	for index := range m.PathKeys {
		path := sh.blueprint.Paths.At(index)
		entry := PathPurchases{Position: pathPositions[index], Name: path.Name}
		for tier := 1; tier <= len(m.TierKeys); tier++ {
			var before, after m.Selection
			before[index], after[index] = tier-1, tier
			upgrade := path.Tiers.At(tier)
			entry.Purchases = append(entry.Purchases, Purchase{
				Code: unit.BuildCode(index, tier), Name: upgrade.Name, Cost: upgrade.Cost,
				Effects: sh.purchaseEffects(upgrade.Changes, sh.resolve(before), sh.resolve(after)),
			})
		}
		out = append(out, entry)
	}
	return out
}
