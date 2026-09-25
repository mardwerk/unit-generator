package unit

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	m "github.com/mardwerk/unit-generator/internal/mechanics"
	s "github.com/mardwerk/unit-generator/internal/schema"
)

var statLabels = map[string]string{
	"damage":              "damage",
	"intervalSeconds":     "attack interval (s)",
	"range":               "range (map units)",
	"pierce":              "pierce (targets)",
	"projectiles":         "projectiles per attack",
	"splashRadius":        "splash radius (map units)",
	"slowPercent":         "slow (%)",
	"slowSeconds":         "slow duration (s)",
	"burnDamagePerSecond": "burn damage/s",
	"burnSeconds":         "burn duration (s)",
	"stunSeconds":         "stun duration (s)",
	"durationSeconds":     "active duration (s)",
	"cooldownSeconds":     "cooldown (s)",
	"damageMultiplier":    "active damage multiplier",
	"intervalMultiplier":  "active attack interval multiplier",
	"rangeBonus":          "active range bonus",
}

// num is Number(value.toFixed(4)).toString().
func num(value float64) string {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return s.FormatNumber(value)
	}
	rounded, _ := strconv.ParseFloat(strconv.FormatFloat(value, 'f', 4, 64), 64)
	return s.FormatNumber(rounded)
}

func pureSelection(index, tier int) m.Selection {
	var sel m.Selection
	sel[index] = tier
	return sel
}

// AttackDescription describes a resolved attack for players.
func AttackDescription(attack m.Attack) string {
	st := attack.Stats
	hit := "pulse"
	if attack.Delivery == "projectile" {
		hit = "projectile"
	}
	shots := fmt.Sprintf("%s %s(s) per attack aimed at the selected primary target", s.FormatNumber(st.Projectiles), hit)
	if attack.Distribution == "distinct-targets" {
		shots = fmt.Sprintf("up to %s %s(s) per attack aimed at distinct detected targets in range; one primary hit per target, unused shots are lost", s.FormatNumber(st.Projectiles), hit)
	}
	effects := []string{
		fmt.Sprintf("%s damage every %s s", num(st.Damage), num(st.IntervalSeconds)),
		fmt.Sprintf("%s map-unit range", num(st.Range)),
		shots,
		fmt.Sprintf("%s target(s) per %s, including primary and splash targets", s.FormatNumber(st.Pierce), hit),
	}
	if st.SplashRadius != 0 && !math.IsNaN(st.SplashRadius) {
		effects = append(effects, num(st.SplashRadius)+" map-unit splash radius")
	}
	if st.SlowPercent != 0 && !math.IsNaN(st.SlowPercent) {
		effects = append(effects, fmt.Sprintf("%s%% slow for %s s", num(st.SlowPercent), num(st.SlowSeconds)))
	}
	if st.BurnDamagePerSecond != 0 && !math.IsNaN(st.BurnDamagePerSecond) {
		effects = append(effects, fmt.Sprintf("%s burn damage/s for %s s", num(st.BurnDamagePerSecond), num(st.BurnSeconds)))
	}
	if st.StunSeconds != 0 && !math.IsNaN(st.StunSeconds) {
		effects = append(effects, num(st.StunSeconds)+" s stun")
	}
	if attack.FollowUp != nil {
		effects = append(effects, FollowUpDescription(*attack.FollowUp))
	}
	return strings.Join(effects, "; ") + "."
}

// FollowUpDescription describes a bounded follow-up.
func FollowUpDescription(effect m.FollowUp) string {
	inherit := "No inherited burn, slow or stun."
	if effect.InheritStatuses {
		inherit = "Inherits purchased burn, slow and stun."
	}
	return fmt.Sprintf("%s: after a primary volley hits, strike up to %s other detected enemies within %s map units of the primary impact, nearest first, once each for %sx the purchased hit damage. Excludes every enemy hit by the primary volley. %s Same damage type and clear-path requirement; no inherited splash, pierce, additional volleys or recursive follow-ups",
		effect.Name, s.FormatNumber(effect.Count), num(effect.Radius), num(effect.DamageMultiplier), inherit)
}

// BoostDescription describes a manual boost.
func BoostDescription(b m.Boost) string {
	return fmt.Sprintf("For %s s, multiply the purchased attack's damage by %s and its interval by %s, and add %s range. Cooldown: %s s from activation. Ready on purchase; cannot reactivate while active.",
		num(b.DurationSeconds), num(b.DamageMultiplier), num(b.IntervalMultiplier), num(b.RangeBonus), num(b.CooldownSeconds))
}

func operationDescription(c m.Change) string {
	switch c.Operation {
	case "add":
		sign := ""
		if c.Number >= 0 {
			sign = "+"
		}
		return sign + num(c.Number)
	case "multiply":
		return "multiply by " + num(c.Number)
	}
	return "set baseline to " + num(c.Number)
}

func changeDescriptions(changes []m.Change, before, after m.ResolvedBuild) []string {
	var order []string
	groups := map[string][]m.Change{}
	for _, c := range changes {
		key := c.Kind + "." + c.Target
		if c.Kind == "stat" || c.Kind == "modifyBoost" {
			key = c.Kind + "." + c.Stat
		}
		if _, ok := groups[key]; !ok {
			order = append(order, key)
		}
		groups[key] = append(groups[key], c)
	}
	var out []string
	for _, key := range order {
		group := groups[key]
		change := group[len(group)-1]
		var effects []string
		for _, entry := range group {
			if entry.Kind == "stat" || entry.Kind == "modifyBoost" {
				effects = append(effects, operationDescription(entry))
			}
		}
		joined := strings.Join(effects, ", ")
		switch change.Kind {
		case "stat":
			label := statLabels[change.Stat]
			if change.Stat == "projectiles" && after.BaseAttack.Delivery != "projectile" {
				label = "pulses per attack"
			}
			out = append(out, fmt.Sprintf("%s %s to %s (%s)", label, num(before.BaseAttack.Stats.Get(change.Stat)), num(after.BaseAttack.Stats.Get(change.Stat)), joined))
		case "unlockBoost":
			out = append(out, "Unlock "+change.Boost.Name)
		case "followUp":
			prefix := ""
			if change.Target == "boost" {
				prefix = "While the manual boost is active only: "
			}
			out = append(out, prefix+FollowUpDescription(*change.FollowUp))
		case "distribution":
			if change.Text == "distinct-targets" {
				out = append(out, "Volley now targets distinct detected enemies in range, primary first then nearest to the primary; one projectile per target, unused shots are lost")
			} else {
				out = append(out, "All projectiles now target the same primary enemy")
			}
		case "modifyBoost":
			prior, next := before.Abilities[0], after.Abilities[0]
			out = append(out, fmt.Sprintf("%s %s to %s (%s)", statLabels[change.Stat], num(abilityValue(prior, change.Stat)), num(abilityValue(next, change.Stat)), joined))
		case "camo":
			if change.Bool {
				out = append(out, "Detect camo enemies; delivery still requires a clear path")
			} else {
				out = append(out, "Remove camo detection")
			}
		default:
			out = append(out, fmt.Sprintf("%s %s to %s", change.Kind, attackField(before.BaseAttack, change.Kind), attackField(after.BaseAttack, change.Kind)))
		}
	}
	return out
}

func abilityValue(a m.ResolvedAbility, stat string) float64 {
	b := m.Boost{Name: a.Name, DurationSeconds: a.DurationSeconds, CooldownSeconds: a.CooldownSeconds, DamageMultiplier: a.DamageMultiplier, IntervalMultiplier: a.IntervalMultiplier, RangeBonus: a.RangeBonus}
	return b.Get(stat)
}

func attackField(a m.Attack, kind string) string {
	switch kind {
	case "delivery":
		return a.Delivery
	case "damageType":
		return a.DamageType
	case "targeting":
		return a.Targeting
	}
	return ""
}

// UnitSummary describes the resolved base attack.
func UnitSummary(attack m.Attack, definition m.Definition) string {
	shape := map[string]string{"projectile": "projectile", "instant": "instant-hit", "area": "area", "beam": "pulsed beam"}[attack.Delivery]
	limits := []string{"Requires a clear delivery path."}
	if !attack.Camo {
		limits = append(limits, "Starts without Camo detection.")
	}
	if immunities := definition.Rules.DamageImmunities.For(attack.DamageType); len(immunities) > 0 {
		limits = append(limits, "Base damage cannot affect "+strings.Join(immunities, ", ")+" enemies.")
	}
	targets := "Multiple-target"
	if attack.Stats.Pierce == 1 {
		targets = "Single-target"
	}
	return fmt.Sprintf("%s %s attacker. %s", targets, shape, strings.Join(limits, " "))
}

// PathSummary describes what a pure tier 5 build changes.
func PathSummary(base m.Attack, build m.ResolvedBuild) string {
	after := build.BaseAttack
	a, b := after.Stats, base.Stats
	var changed []string
	if a.Damage > b.Damage {
		changed = append(changed, "higher damage per hit")
	}
	if a.IntervalSeconds < b.IntervalSeconds {
		changed = append(changed, "faster attacks")
	}
	if a.Projectiles > b.Projectiles {
		if after.Distribution == "distinct-targets" {
			changed = append(changed, "volleys across distinct targets")
		} else {
			changed = append(changed, "more hits on the primary target")
		}
	}
	if after.FollowUp != nil {
		changed = append(changed, "secondary hits on nearby enemies")
	}
	for _, ability := range build.Abilities {
		if ability.BoostedAttack.FollowUp != nil && after.FollowUp == nil {
			changed = append(changed, "secondary hits during activation")
			break
		}
	}
	if a.Pierce > b.Pierce || (a.Pierce > 1 && a.SplashRadius > b.SplashRadius) {
		changed = append(changed, "wider coverage")
	}
	if a.Range > b.Range {
		changed = append(changed, "longer reach")
	}
	if a.SlowPercent > b.SlowPercent || a.SlowSeconds > b.SlowSeconds || a.StunSeconds > b.StunSeconds {
		changed = append(changed, "enemy control")
	}
	if a.BurnDamagePerSecond > b.BurnDamagePerSecond || a.BurnSeconds > b.BurnSeconds {
		changed = append(changed, "burn damage")
	}
	if after.Camo && !base.Camo {
		changed = append(changed, "Camo detection")
	}
	if after.DamageType != base.DamageType {
		changed = append(changed, after.DamageType+" damage")
	}
	if after.Delivery != base.Delivery {
		changed = append(changed, after.Delivery+" delivery")
	}
	if len(build.Abilities) > 0 {
		changed = append(changed, "a manual attack boost")
	}
	if len(changed) == 0 {
		changed = append(changed, "changes to the base attack")
	}
	text := strings.Join(changed, ", ")
	var drawbacks []string
	if a.Damage < b.Damage {
		drawbacks = append(drawbacks, "lower damage per hit")
	}
	if a.IntervalSeconds > b.IntervalSeconds {
		drawbacks = append(drawbacks, "slower attacks")
	}
	if a.Range < b.Range {
		drawbacks = append(drawbacks, "shorter reach")
	}
	if a.Pierce < b.Pierce {
		drawbacks = append(drawbacks, "fewer targets per hit")
	}
	if a.Projectiles < b.Projectiles {
		drawbacks = append(drawbacks, "fewer hits per attack")
	}
	if a.SplashRadius < b.SplashRadius {
		drawbacks = append(drawbacks, "smaller splash area")
	}
	if a.SlowPercent < b.SlowPercent || a.SlowSeconds < b.SlowSeconds || a.StunSeconds < b.StunSeconds {
		drawbacks = append(drawbacks, "reduced enemy control")
	}
	if a.BurnDamagePerSecond < b.BurnDamagePerSecond || a.BurnSeconds < b.BurnSeconds {
		drawbacks = append(drawbacks, "reduced burn damage")
	}
	if base.Camo && !after.Camo {
		drawbacks = append(drawbacks, "loss of Camo detection")
	}
	out := strings.ToUpper(text[:1]) + text[1:] + "."
	if len(drawbacks) > 0 {
		out += " Tradeoffs: " + strings.Join(drawbacks, ", ") + "."
	}
	return out
}

func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, v := range values {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}

// CompileBlueprint turns a valid blueprint into the readable candidate.
// IDs, unlock joins, purchase deltas and builds come from code, not prose.
func CompileBlueprint(blueprint m.Blueprint, request Request) (Candidate, error) {
	if request.MechanicsDefinition == nil {
		return Candidate{}, errors.New("A mechanics definition is required to compile a blueprint.")
	}
	definition := *request.MechanicsDefinition
	ruleDoc, err := DefinitionDocument(definition)
	if err != nil {
		return Candidate{}, err
	}
	if issues := m.ValidateTyped(&blueprint, definition); len(issues) > 0 {
		return Candidate{}, &m.ValidationError{Issues: issues}
	}
	resolve := func(sel m.Selection) m.ResolvedBuild { return m.WithTierDeltas(&blueprint, sel) }
	rule := ruleDoc.ID
	var docIDs []string
	for _, fact := range blueprint.SourceFacts {
		docIDs = append(docIDs, fact.DocumentID)
	}
	sourceIDs := uniqueStrings(docIDs)
	evidence := append(append([]string(nil), sourceIDs...), rule)
	available := EvidenceSpans(&request)
	selected := AuthorEvidence(&request)
	var active []string
	for i := range m.PathKeys {
		for _, index := range blueprint.Paths.At(i).SourceFactIndices {
			active = append(active, blueprint.SourceFacts[index].DocumentID)
		}
	}
	var historical []TechniqueContext
	for _, id := range uniqueStrings(active) {
		if context := HistoricalTechniqueContext(&request, id); context != nil {
			historical = append(historical, *context)
		}
	}
	abilities := []Ability{}
	var paths []CandidatePath
	for index := range m.PathKeys {
		path := blueprint.Paths.At(index)
		pathID := fmt.Sprintf("path-%d", index+1)
		var pathDocs []string
		for _, i := range path.SourceFactIndices {
			pathDocs = append(pathDocs, blueprint.SourceFacts[i].DocumentID)
		}
		pathEvidence := append(uniqueStrings(pathDocs), rule)
		var tiers []CandidateTier
		for tierIndex := range m.TierKeys {
			tier := path.Tiers.At(tierIndex + 1)
			level := tierIndex + 1
			before := resolve(pureSelection(index, tierIndex))
			after := resolve(pureSelection(index, level))
			abilityIDs := []string{}
			for _, change := range tier.Changes {
				if change.Kind != "unlockBoost" {
					continue
				}
				id := pathID + "-active"
				abilityIDs = append(abilityIDs, id)
				pid, lvl := pathID, level
				abilities = append(abilities, Ability{
					ID: id, Name: change.Boost.Name, Status: "proposed", DecisionRefs: []string{},
					Description:  fmt.Sprintf("At tier %d: %s Later upgrades modify the fields stated in their tier benefits.", level, BoostDescription(*change.Boost)),
					Availability: fmt.Sprintf("%s, tier %d. Manual activation.", path.Name, level),
					Delivery:     "Modifies this Unit's purchased base attack.",
					Targeting:    "Uses the purchased attack's targeting.",
					Limitations:  "No independent attack, extra actor, obstruction bypass or unpurchased upgrade is granted.",
					Placement:    "upgrade", PathID: &pid, Tier: &lvl,
					MechanicIDs: []string{"dsl-boost"}, PrerequisiteAbilityIDs: []string{}, Evidence: pathEvidence,
				})
			}
			tiers = append(tiers, CandidateTier{
				Tier: level, Name: tier.Name, Status: "proposed", DecisionRefs: []string{},
				Benefit:    fmt.Sprintf("%s %s. %s.", num(tier.Cost), definition.Profile.Currency, strings.Join(changeDescriptions(tier.Changes, before, after), "; ")),
				AbilityIDs: abilityIDs, Evidence: pathEvidence,
			})
		}
		paths = append(paths, CandidatePath{
			ID: pathID, Name: path.Name,
			Theme: PathSummary(blueprint.BaseAttack, resolve(pureSelection(index, 5))),
			Tiers: tiers,
		})
	}
	for index, technique := range blueprint.ReservedTechniques {
		abilities = append(abilities, Ability{
			ID: fmt.Sprintf("reserved-%d", index+1), Name: technique.Name, Description: technique.Reason,
			Status: "proposed", DecisionRefs: []string{},
			Availability: "Not granted by any build.", Delivery: "Not implemented.", Targeting: "Not applicable.",
			Limitations: "Reserved for a later definition or design revision.", Placement: "reserved",
			MechanicIDs: []string{}, PrerequisiteAbilityIDs: []string{}, Evidence: sourceIDs,
		})
	}
	mechanicsList := []Mechanic{{
		ID: "dsl-attack", Name: "Attack and upgrade composition", Status: "specified",
		Dependencies: []string{}, Evidence: []string{rule},
		Behavior: "Only purchased upgrades apply. Set operations replace the baseline; all additions then multipliers compose in canonical order. Detection and clear delivery are separate. Immunities and effect stacking follow the supplied definition. Upgrade before/after examples show the main path alone; crosspaths compose over the same base. All values are proposals.",
	}}
	for _, a := range abilities {
		if a.Placement == "upgrade" {
			mechanicsList = append(mechanicsList, Mechanic{
				ID: "dsl-boost", Name: "Manual attack boost", Status: "specified",
				Dependencies: []string{"dsl-attack"}, Evidence: []string{rule},
				Behavior: "Ready on purchase; cooldown starts at activation. No reactivation while active. The boost applies to the purchased attack and expires without erasing its upgrades.",
			})
			break
		}
	}
	for index, proposal := range blueprint.Proposals {
		mechanicsList = append(mechanicsList, Mechanic{
			ID: fmt.Sprintf("proposal-%d", index+1), Name: proposal.Name, Behavior: proposal.Reason,
			Status: "proposed_extension", Dependencies: []string{}, Evidence: sourceIDs,
			RequiredDecision: strPtr("Specify and approve a definition extension before including this behavior in a build."),
		})
	}
	var builds []RepresentativeBuild
	for _, sel := range m.AllLegalBuilds(definition) {
		if sel[0] != 5 && sel[1] != 5 && sel[2] != 5 {
			continue
		}
		var selections []BuildSelection
		for i, tier := range sel {
			selections = append(selections, BuildSelection{PathID: fmt.Sprintf("path-%d", i+1), Tier: tier})
		}
		builds = append(builds, RepresentativeBuild{
			Name:       fmt.Sprintf("%d-%d-%d", sel[0], sel[1], sel[2]),
			Selections: selections,
			Rationale:  fmt.Sprintf("Total investment: %s %s. Computed from the purchased tiers; not a balance rating.", num(resolve(sel).CumulativeCost), definition.Profile.Currency),
		})
	}
	limitations := "Numeric values are proposed on the supplied starter scale. No Unit HP. Runtime integration and balance testing remain required."
	if len(historical) > 0 {
		limitations += " This draft includes a historical skill subset; current source-period availability is not established."
	}
	var sources []Source
	for _, id := range sourceIDs {
		var claims []string
		for _, fact := range blueprint.SourceFacts {
			if fact.DocumentID == id {
				claims = append(claims, fact.Quote)
			}
		}
		note := "Supplied evidence supports character claims; game adaptations and values remain proposals."
		for _, d := range request.Documents {
			if d.ID == id {
				if d.Origin.Note != nil {
					note = *d.Origin.Note
				}
				break
			}
		}
		chosen, total := 0, 0
		for _, span := range selected {
			if span.DocumentID == id {
				chosen++
			}
		}
		for _, span := range available {
			if span.DocumentID == id {
				total++
			}
		}
		sources = append(sources, Source{
			DocumentID: id, Claims: claims,
			Limitations: note + " " + fmt.Sprintf("Authoring context included %d of %d source passages. Full text remains in the request; selection does not establish exhaustive canon coverage.", chosen, total),
		})
	}
	var questions []Question
	for index, source := range historical {
		questions = append(questions, Question{
			ID:       fmt.Sprintf("source-period-%d", index+1),
			Question: fmt.Sprintf("%s is listed under \"Former\" in its character source. This draft adapts that historical skill. Which source period should this Unit use? Current availability is not established.", source.Technique),
			Affected: source.Technique + " and the selected character scope",
			Evidence: []string{source.DocumentID},
		})
	}
	camo := "cannot detect camo"
	if blueprint.BaseAttack.Camo {
		camo = "detects camo"
	}
	bp := blueprint
	candidate := Candidate{
		SchemaVersion: "1",
		Character:     request.Character,
		Role:          UnitSummary(blueprint.BaseAttack, definition),
		BasicAttack: BasicAttack{
			Name: blueprint.BaseAttack.Name, Status: "proposed", DecisionRefs: []string{},
			Behavior:    fmt.Sprintf("Placement: %s %s. %s", num(blueprint.BaseAttack.Cost), definition.Profile.Currency, AttackDescription(blueprint.BaseAttack)),
			Delivery:    fmt.Sprintf("%s; %s damage; clear delivery path required.", blueprint.BaseAttack.Delivery, blueprint.BaseAttack.DamageType),
			Targeting:   fmt.Sprintf("%s; %s.", blueprint.BaseAttack.Targeting, camo),
			Limitations: limitations, MechanicIDs: []string{"dsl-attack"}, Evidence: evidence,
		},
		Paths:                paths,
		Abilities:            abilities,
		Mechanics:            mechanicsList,
		Sources:              sources,
		ConstraintCoverage:   blueprint.ConstraintCoverage,
		RepresentativeBuilds: builds,
		UnresolvedQuestions:  questions,
		Blueprint:            &bp,
	}
	return ParseCandidate(s.FromGoValue(candidate))
}

// ParseCandidate validates a candidate value and decodes it.
func ParseCandidate(value any) (Candidate, error) {
	var c Candidate
	return c, s.ParseInto(CandidateSchema, value, &c)
}
