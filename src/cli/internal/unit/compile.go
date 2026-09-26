package unit

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	m "github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
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

// AttackDescription describes a resolved version 1 attack for players.
func AttackDescription(attack m.Attack) string { return attackDescription(attack, nil) }

// attackDescription describes an attack; version 2 statuses take their
// names and units from the vocabulary.
func attackDescription(attack m.Attack, vocabulary *m.Vocabulary) string {
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
	if attack.IsV2() {
		for _, status := range attack.AppliedStatuses() {
			effects = append(effects, statusText(status, vocabulary))
		}
	} else {
		if st.SlowPercent != 0 && !math.IsNaN(st.SlowPercent) {
			effects = append(effects, fmt.Sprintf("%s%% slow for %s s", num(st.SlowPercent), num(st.SlowSeconds)))
		}
		if st.BurnDamagePerSecond != 0 && !math.IsNaN(st.BurnDamagePerSecond) {
			effects = append(effects, fmt.Sprintf("%s burn damage/s for %s s", num(st.BurnDamagePerSecond), num(st.BurnSeconds)))
		}
		if st.StunSeconds != 0 && !math.IsNaN(st.StunSeconds) {
			effects = append(effects, num(st.StunSeconds)+" s stun")
		}
	}
	if attack.FollowUp != nil {
		effects = append(effects, followUpDescription(*attack.FollowUp, attack.IsV2()))
	}
	return strings.Join(effects, "; ") + "."
}

// effectOf is a status effect's vocabulary entry, or a bare one named by ID.
func effectOf(id string, vocabulary *m.Vocabulary) m.StatusEffect {
	if vocabulary != nil {
		if effect, ok := vocabulary.Effect(id); ok {
			return effect
		}
	}
	return m.StatusEffect{ID: id, Name: id, Stacking: m.Stacking{MaxStacks: 1}}
}

// termName is a vocabulary term's name, or its ID.
func termName(id string, terms []m.Term) string {
	for _, term := range terms {
		if term.ID == id && term.Name != "" {
			return term.Name
		}
	}
	return id
}

// magnitudeText writes a magnitude with its unit: "30%" or "5 damage/s".
func magnitudeText(value float64, effect m.StatusEffect) string {
	if effect.Magnitude == nil || effect.Magnitude.Unit == "percent" {
		return num(value) + "%"
	}
	return num(value) + " " + effect.Magnitude.Unit
}

// statusText describes an applied status effect, with its stacking.
func statusText(status m.StatusApplication, vocabulary *m.Vocabulary) string {
	effect := effectOf(status.Effect, vocabulary)
	text := num(status.Seconds) + " s " + effect.Name
	if status.Magnitude != nil {
		text = fmt.Sprintf("%s %s for %s s", magnitudeText(*status.Magnitude, effect), effect.Name, num(status.Seconds))
	}
	if stacks := effect.Stacking.MaxStacks; stacks > 1 {
		refresh := map[string]string{
			m.RefreshReset:       "each hit restarts every stack",
			m.RefreshExtend:      "each hit extends the duration",
			m.RefreshIndependent: "each stack lasts on its own",
		}[effect.Stacking.Refresh]
		text += fmt.Sprintf(", stacking up to %d times (%s)", stacks, refresh)
	}
	if limit := effect.Stacking.MaxMagnitude; limit != nil {
		text += ", at most " + magnitudeText(*limit, effect) + " combined"
	}
	return text
}

// FollowUpDescription describes a bounded follow-up of a version 1 attack.
func FollowUpDescription(effect m.FollowUp) string { return followUpDescription(effect, false) }

func followUpDescription(effect m.FollowUp, v2 bool) string {
	inherit := "No inherited burn, slow or stun."
	if effect.InheritStatuses {
		inherit = "Inherits purchased burn, slow and stun."
	}
	if v2 {
		inherit = "No inherited status effects."
		if effect.InheritStatuses {
			inherit = "Inherits the purchased status effects."
		}
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

func changeDescriptions(changes []m.Change, before, after m.ResolvedBuild, vocabulary *m.Vocabulary) []string {
	var order []string
	groups := map[string][]m.Change{}
	for _, c := range changes {
		key := c.Kind + "." + c.Target
		switch c.Kind {
		case "stat", "modifyBoost":
			key = c.Kind + "." + c.Stat
		case "status":
			key = c.Kind + "." + c.Effect + "." + c.Field
		case "detection":
			key = c.Kind + "." + c.Trait
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
			if entry.Kind == "stat" || entry.Kind == "modifyBoost" || entry.Kind == "status" {
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
		case "status":
			effect := effectOf(change.Effect, vocabulary)
			prior, _ := before.BaseAttack.Status(change.Effect)
			next, _ := after.BaseAttack.Status(change.Effect)
			if change.Field == "magnitude" {
				out = append(out, fmt.Sprintf("%s %s to %s (%s)", effect.Name, magnitudeText(prior.Strength(), effect), magnitudeText(next.Strength(), effect), joined))
			} else {
				out = append(out, fmt.Sprintf("%s duration (s) %s to %s (%s)", effect.Name, num(prior.Seconds), num(next.Seconds), joined))
			}
		case "detection":
			var terms []m.Term
			if vocabulary != nil {
				terms = vocabulary.Detection
			}
			name := termName(change.Trait, terms)
			if change.Bool {
				out = append(out, "Detect "+name+" enemies; delivery still requires a clear path")
			} else {
				out = append(out, "Remove "+name+" detection")
			}
		case "unlockBoost":
			out = append(out, "Unlock "+change.Boost.Name)
		case "followUp":
			prefix := ""
			if change.Target == "boost" {
				prefix = "While the manual boost is active only: "
			}
			out = append(out, prefix+followUpDescription(*change.FollowUp, after.BaseAttack.IsV2()))
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
	if attack.IsV2() && definition.IsV2() {
		vocabulary := definition.Vocabulary
		for _, trait := range vocabulary.Detection {
			if !attack.DetectsTrait(trait.ID) {
				limits = append(limits, "Starts without "+trait.Name+" detection.")
			}
		}
		if damageType, ok := vocabulary.DamageType(attack.DamageType); ok && len(damageType.IneffectiveAgainst) > 0 {
			var names []string
			for _, property := range damageType.IneffectiveAgainst {
				names = append(names, termName(property, vocabulary.EnemyProperties))
			}
			limits = append(limits, "Base damage cannot affect "+strings.Join(names, ", ")+" enemies.")
		}
	} else {
		if !attack.Camo {
			limits = append(limits, "Starts without Camo detection.")
		}
		if immunities := definition.Rules.DamageImmunities.For(attack.DamageType); len(immunities) > 0 {
			limits = append(limits, "Base damage cannot affect "+strings.Join(immunities, ", ")+" enemies.")
		}
	}
	targets := "Multiple-target"
	if attack.Stats.Pierce == 1 {
		targets = "Single-target"
	}
	return fmt.Sprintf("%s %s attacker. %s", targets, shape, strings.Join(limits, " "))
}

// PathSummary describes what a pure tier 5 build of a version 1 unit changes.
func PathSummary(base m.Attack, build m.ResolvedBuild) string { return pathSummary(base, build, nil) }

// statusSummary names a version 2 path's status gains and losses: control
// kinds read as enemy control, damage over time and other kinds by name.
func statusSummary(base, after m.Attack, vocabulary *m.Vocabulary) (gains, losses []string) {
	control := func(kind string) bool {
		return kind == m.KindMoveSpeed || kind == m.KindDisable
	}
	var gainedControl, lostControl bool
	seen := map[string]bool{}
	for _, status := range append(base.AppliedStatuses(), after.AppliedStatuses()...) {
		if seen[status.Effect] {
			continue
		}
		seen[status.Effect] = true
		effect := effectOf(status.Effect, vocabulary)
		prior, _ := base.Status(status.Effect)
		next, _ := after.Status(status.Effect)
		up := next.Strength() > prior.Strength() || next.Seconds > prior.Seconds
		down := next.Strength() < prior.Strength() || next.Seconds < prior.Seconds
		switch {
		case control(effect.Kind):
			gainedControl = gainedControl || up
			lostControl = lostControl || down
		case up:
			gains = append(gains, strings.ToLower(effect.Name))
		case down:
			losses = append(losses, "reduced "+strings.ToLower(effect.Name))
		}
	}
	if gainedControl {
		gains = append([]string{"enemy control"}, gains...)
	}
	if lostControl {
		losses = append([]string{"reduced enemy control"}, losses...)
	}
	var terms []m.Term
	if vocabulary != nil {
		terms = vocabulary.Detection
	}
	for _, trait := range after.DetectionTraits() {
		if !base.DetectsTrait(trait) {
			gains = append(gains, termName(trait, terms)+" detection")
		}
	}
	for _, trait := range base.DetectionTraits() {
		if !after.DetectsTrait(trait) {
			losses = append(losses, "loss of "+termName(trait, terms)+" detection")
		}
	}
	return gains, losses
}

func pathSummary(base m.Attack, build m.ResolvedBuild, vocabulary *m.Vocabulary) string {
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
	statusGains, statusLosses := statusSummary(base, after, vocabulary)
	if after.IsV2() {
		changed = append(changed, statusGains...)
	} else {
		if a.SlowPercent > b.SlowPercent || a.SlowSeconds > b.SlowSeconds || a.StunSeconds > b.StunSeconds {
			changed = append(changed, "enemy control")
		}
		if a.BurnDamagePerSecond > b.BurnDamagePerSecond || a.BurnSeconds > b.BurnSeconds {
			changed = append(changed, "burn damage")
		}
		if after.Camo && !base.Camo {
			changed = append(changed, "Camo detection")
		}
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
	if after.IsV2() {
		drawbacks = append(drawbacks, statusLosses...)
	} else {
		if a.SlowPercent < b.SlowPercent || a.SlowSeconds < b.SlowSeconds || a.StunSeconds < b.StunSeconds {
			drawbacks = append(drawbacks, "reduced enemy control")
		}
		if a.BurnDamagePerSecond < b.BurnDamagePerSecond || a.BurnSeconds < b.BurnSeconds {
			drawbacks = append(drawbacks, "reduced burn damage")
		}
		if base.Camo && !after.Camo {
			drawbacks = append(drawbacks, "loss of Camo detection")
		}
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
	var vocabulary *m.Vocabulary
	if definition.IsV2() {
		vocabulary = definition.Vocabulary
	}
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
				Benefit:    fmt.Sprintf("%s %s. %s.", num(tier.Cost), definition.Profile.Currency, strings.Join(changeDescriptions(tier.Changes, before, after, vocabulary), "; ")),
				AbilityIDs: abilityIDs, Evidence: pathEvidence,
			})
		}
		paths = append(paths, CandidatePath{
			ID: pathID, Name: path.Name,
			Theme: pathSummary(blueprint.BaseAttack, resolve(pureSelection(index, 5)), vocabulary),
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
	detection := "; cannot detect camo"
	if blueprint.BaseAttack.Camo {
		detection = "; detects camo"
	}
	damageType := blueprint.BaseAttack.DamageType
	if vocabulary != nil {
		detection = ""
		var detected, missing []string
		for _, trait := range vocabulary.Detection {
			if blueprint.BaseAttack.DetectsTrait(trait.ID) {
				detected = append(detected, trait.Name)
			} else {
				missing = append(missing, trait.Name)
			}
		}
		if len(detected) > 0 {
			detection += "; detects " + strings.Join(detected, ", ")
		}
		if len(missing) > 0 {
			detection += "; cannot detect " + strings.Join(missing, ", ")
		}
		if t, ok := vocabulary.DamageType(damageType); ok {
			damageType = t.Name
		}
	}
	bp := blueprint
	candidate := Candidate{
		SchemaVersion: VersionOf(&definition),
		Character:     request.Character,
		Role:          UnitSummary(blueprint.BaseAttack, definition),
		BasicAttack: BasicAttack{
			Name: blueprint.BaseAttack.Name, Status: "proposed", DecisionRefs: []string{},
			Behavior:    fmt.Sprintf("Placement: %s %s. %s", num(blueprint.BaseAttack.Cost), definition.Profile.Currency, attackDescription(blueprint.BaseAttack, vocabulary)),
			Delivery:    fmt.Sprintf("%s; %s damage; clear delivery path required.", blueprint.BaseAttack.Delivery, damageType),
			Targeting:   fmt.Sprintf("%s%s.", blueprint.BaseAttack.Targeting, detection),
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
	return c, s.ParseInto(Versioned(value, CandidateSchema, CandidateSchemaV2), value, &c)
}
