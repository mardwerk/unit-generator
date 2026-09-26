package mechanics

import (
	"fmt"
	"math"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

// Effect kinds are the status-effect semantics the Engine understands. A
// Profile names its own effects; each one has one of these kinds.
const (
	KindMoveSpeed      = "moveSpeed"      // slows movement by its magnitude
	KindDamageOverTime = "damageOverTime" // deals its magnitude in damage per second
	KindDisable        = "disable"        // stops the enemy acting; no magnitude
	KindDamageTaken    = "damageTaken"    // raises damage taken by its magnitude
	KindCustom         = "custom"         // described only; the host implements it
)

// Stacking refresh modes: what a new application does to existing stacks.
const (
	RefreshReset       = "reset"       // every application restarts all stacks' duration
	RefreshExtend      = "extend"      // applications add duration; magnitude does not stack
	RefreshIndependent = "independent" // each stack keeps its own timer
)

var (
	// EffectKinds lists the status-effect kinds in documentation order.
	EffectKinds = []string{KindMoveSpeed, KindDamageOverTime, KindDisable, KindDamageTaken, KindCustom}
	// RefreshModes lists the stacking refresh modes.
	RefreshModes = []string{RefreshReset, RefreshExtend, RefreshIndependent}
	// StatusFields are the resolvable numbers of an applied status effect.
	StatusFields = []string{"magnitude", "seconds"}
	// CoreStatKeys are the attack stats of a version 2 Definition; status
	// effects replace the version 1 slow, burn and stun stats.
	CoreStatKeys = []string{"damage", "intervalSeconds", "range", "pierce", "projectiles", "splashRadius"}
)

// Term is a named entry of a vocabulary list.
type Term struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

// DamageType is a damage type and the enemy properties it cannot damage.
type DamageType struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	Description        string   `json:"description"`
	IneffectiveAgainst []string `json:"ineffectiveAgainst"`
}

// Magnitude bounds one application's strength, in the effect's unit.
type Magnitude struct {
	Unit string  `json:"unit"`
	Min  float64 `json:"min"`
	Max  float64 `json:"max"`
}

// Stacking says how repeated applications combine. MaxMagnitude, when set,
// caps the combined magnitude of all stacks (for example a poison cap).
type Stacking struct {
	MaxStacks    int      `json:"maxStacks"`
	Refresh      string   `json:"refresh"`
	MaxMagnitude *float64 `json:"maxMagnitude"`
}

// StatusEffect is one Profile-defined status effect.
type StatusEffect struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Aliases     []string   `json:"aliases"`
	Kind        string     `json:"kind"`
	Description string     `json:"description"`
	Magnitude   *Magnitude `json:"magnitude"`
	MaxSeconds  float64    `json:"maxSeconds"`
	Stacking    Stacking   `json:"stacking"`
	Immune      []string   `json:"immune"`
}

// Vocabulary is the game vocabulary a version 2 Definition declares: what
// enemies can be, which damage types, targeting modes and detection exist,
// and which status effects attacks may apply.
type Vocabulary struct {
	EnemyProperties []Term         `json:"enemyProperties"`
	DamageTypes     []DamageType   `json:"damageTypes"`
	Targeting       []Term         `json:"targeting"`
	Detection       []Term         `json:"detection"`
	StatusEffects   []StatusEffect `json:"statusEffects"`
}

// StatusApplication is a status effect an attack applies. Magnitude is
// absent for effects without one (such as a stun).
type StatusApplication struct {
	Effect    string   `json:"effect"`
	Magnitude *float64 `json:"magnitude,omitempty"`
	Seconds   float64  `json:"seconds"`
}

// Strength is the application's magnitude, or 0 without one.
func (a StatusApplication) Strength() float64 {
	if a.Magnitude == nil {
		return 0
	}
	return *a.Magnitude
}

// Effect returns the status effect with the given ID.
func (v *Vocabulary) Effect(id string) (StatusEffect, bool) {
	for _, effect := range v.StatusEffects {
		if effect.ID == id {
			return effect, true
		}
	}
	return StatusEffect{}, false
}

// DamageType returns the damage type with the given ID.
func (v *Vocabulary) DamageType(id string) (DamageType, bool) {
	for _, damageType := range v.DamageTypes {
		if damageType.ID == id {
			return damageType, true
		}
	}
	return DamageType{}, false
}

// IsV2 reports a version 2 Definition, which declares its vocabulary.
func (d Definition) IsV2() bool { return d.Version == "2" }

// Terms is the Definition's vocabulary: declared by a version 2 Definition,
// implied by the fixed rules of a version 1 Definition.
func (d Definition) Terms() Vocabulary {
	if d.Vocabulary != nil {
		return *d.Vocabulary
	}
	return legacyVocabulary(d.Rules)
}

// legacyVocabulary expresses version 1's fixed damage types, targeting, Camo
// detection and slow, burn and stun as a vocabulary, so one implementation
// resolves and measures both versions.
func legacyVocabulary(rules Rules) Vocabulary {
	terms := func(ids ...string) []Term {
		out := make([]Term, len(ids))
		for i, id := range ids {
			out[i] = Term{ID: id, Name: id}
		}
		return out
	}
	damageTypes := make([]DamageType, len(DamageTypes))
	for i, id := range DamageTypes {
		damageTypes[i] = DamageType{ID: id, Name: id, IneffectiveAgainst: rules.DamageImmunities.For(id)}
	}
	single := Stacking{MaxStacks: 1, Refresh: RefreshReset}
	unbounded := math.Inf(1)
	return Vocabulary{
		EnemyProperties: terms(EnemyProperties...),
		DamageTypes:     damageTypes,
		Targeting:       terms(Targetings...),
		Detection:       terms("camo"),
		StatusEffects: []StatusEffect{
			{ID: "slow", Name: "slow", Kind: KindMoveSpeed, Magnitude: &Magnitude{Unit: "percent", Max: 100}, MaxSeconds: unbounded, Stacking: single, Immune: rules.SlowImmune},
			{ID: "burn", Name: "burn", Kind: KindDamageOverTime, Magnitude: &Magnitude{Unit: "damage/s", Max: unbounded}, MaxSeconds: unbounded, Stacking: single},
			{ID: "stun", Name: "stun", Kind: KindDisable, MaxSeconds: unbounded, Stacking: single, Immune: rules.StunImmune},
		},
	}
}

// ReservedIDs name the Engine's own capabilities and plan promises; status
// effects and detection traits share those namespaces and cannot use them.
var ReservedIDs = []string{
	"none", "damage", "attack-rate", "range", "pierce", "projectiles", "splash", "follow-up",
	"active-damage", "active-attack-rate", "active-duration", "active-frequency", "manual-boost",
	"active-follow-up", "distinct-volley", "delivery-change", "damage-type-change",
	"targeting-change", "damage-type-access",
}

// UpgradeDefinition turns a version 1 Definition into the equivalent
// version 2 Definition: its fixed damage types, targeting, Camo detection
// and slow, burn and stun become a vocabulary with the same behavior.
// Durations and magnitudes keep version 1's only bound, the stat ceiling.
func UpgradeDefinition(d Definition) Definition {
	if d.IsV2() {
		return d
	}
	vocabulary := legacyVocabulary(d.Rules)
	ceiling := d.Profile.MaxStatValue
	for i := range vocabulary.StatusEffects {
		effect := &vocabulary.StatusEffects[i]
		effect.MaxSeconds = ceiling
		effect.Aliases = []string{}
		if effect.Immune == nil {
			effect.Immune = []string{}
		}
		if effect.Magnitude != nil && math.IsInf(effect.Magnitude.Max, 1) {
			effect.Magnitude.Max = ceiling
		}
	}
	for i := range vocabulary.DamageTypes {
		if vocabulary.DamageTypes[i].IneffectiveAgainst == nil {
			vocabulary.DamageTypes[i].IneffectiveAgainst = []string{}
		}
	}
	d.Version = "2"
	d.Vocabulary = &vocabulary
	return d
}

var vocabularyID = s.String().Regex(`^[a-z][a-z0-9-]{0,39}$`, "Use a lowercase ID of letters, digits and hyphens, starting with a letter.")

func termSchema() *s.ObjectSchema {
	return s.StrictObject(s.F("id", vocabularyID), s.F("name", text().Max(80)), s.F("description", s.String().Trim().Max(500)))
}

// VocabularySchema checks a vocabulary's shape; VocabularyIssues checks its
// cross-references.
var VocabularySchema = s.StrictObject(
	s.F("enemyProperties", s.Array(termSchema()).Max(32)),
	s.F("damageTypes", s.Array(termSchema().Extend(s.F("ineffectiveAgainst", s.Array(vocabularyID).Max(32)))).Min(1).Max(16)),
	s.F("targeting", s.Array(termSchema()).Min(1).Max(16)),
	s.F("detection", s.Array(termSchema()).Max(8)),
	s.F("statusEffects", s.Array(s.StrictObject(
		s.F("id", vocabularyID),
		s.F("name", text().Max(80)),
		s.F("aliases", s.Array(text().Max(40)).Max(8)),
		s.F("kind", enum(EffectKinds)),
		s.F("description", s.String().Trim().Max(500)),
		s.F("magnitude", s.Nullable(s.StrictObject(s.F("unit", text().Max(40)), s.F("min", nonnegative()), s.F("max", positive())))),
		s.F("maxSeconds", positive()),
		s.F("stacking", s.StrictObject(
			s.F("maxStacks", s.Int().Min(1).Max(100)),
			s.F("refresh", enum(RefreshModes)),
			s.F("maxMagnitude", s.Nullable(positive())),
		)),
		s.F("immune", s.Array(vocabularyID).Max(32)),
	)).Max(16)),
)

// VocabularyIssues checks what the schema cannot: unique IDs and aliases,
// references to declared enemy properties, and magnitudes that suit each kind.
func VocabularyIssues(v Vocabulary) []Issue {
	var issues []Issue
	add := func(path, message string) { issues = append(issues, Issue{"vocabulary." + path, message}) }
	properties := map[string]bool{}
	unique := func(list string, ids []string) {
		seen := map[string]bool{}
		for i, id := range ids {
			if seen[id] {
				add(fmt.Sprintf("%s.%d.id", list, i), fmt.Sprintf("The ID %s is already used in %s.", id, list))
			}
			seen[id] = true
		}
	}
	ids := func(n int, id func(int) string) []string {
		out := make([]string, n)
		for i := range out {
			out[i] = id(i)
		}
		return out
	}
	unique("enemyProperties", ids(len(v.EnemyProperties), func(i int) string { return v.EnemyProperties[i].ID }))
	unique("damageTypes", ids(len(v.DamageTypes), func(i int) string { return v.DamageTypes[i].ID }))
	unique("targeting", ids(len(v.Targeting), func(i int) string { return v.Targeting[i].ID }))
	unique("detection", ids(len(v.Detection), func(i int) string { return v.Detection[i].ID }))
	unique("statusEffects", ids(len(v.StatusEffects), func(i int) string { return v.StatusEffects[i].ID }))
	for _, property := range v.EnemyProperties {
		properties[property.ID] = true
	}
	// Capability groups are named after these IDs, so they must not collide
	// with each other or with the Engine's own groups.
	reserved := map[string]bool{}
	for _, name := range ReservedIDs {
		reserved[name] = true
	}
	for i, detection := range v.Detection {
		if properties[detection.ID] {
			add(fmt.Sprintf("detection.%d.id", i), "A detection trait cannot also be an enemy property.")
		}
		if reserved[detection.ID] {
			add(fmt.Sprintf("detection.%d.id", i), detection.ID+" is reserved by the Engine.")
		}
	}
	for i, effect := range v.StatusEffects {
		if reserved[effect.ID] {
			add(fmt.Sprintf("statusEffects.%d.id", i), effect.ID+" is reserved by the Engine.")
		}
		for _, detection := range v.Detection {
			if detection.ID == effect.ID {
				add(fmt.Sprintf("statusEffects.%d.id", i), "A status effect cannot share its ID with a detection trait.")
			}
		}
	}
	known := func(path string, refs []string) {
		for i, ref := range refs {
			if !properties[ref] {
				add(fmt.Sprintf("%s.%d", path, i), fmt.Sprintf("%s is not a declared enemy property.", ref))
			}
		}
	}
	for i, damageType := range v.DamageTypes {
		known(fmt.Sprintf("damageTypes.%d.ineffectiveAgainst", i), damageType.IneffectiveAgainst)
	}
	names := map[string]string{}
	for _, effect := range v.StatusEffects {
		names[effect.ID] = effect.ID
	}
	for i, effect := range v.StatusEffects {
		path := fmt.Sprintf("statusEffects.%d", i)
		known(path+".immune", effect.Immune)
		for j, alias := range effect.Aliases {
			if owner, ok := names[alias]; ok && owner != effect.ID {
				add(fmt.Sprintf("%s.aliases.%d", path, j), fmt.Sprintf("%s already names the effect %s.", alias, owner))
			} else if !ok {
				names[alias] = effect.ID
			}
		}
		m, stacking := effect.Magnitude, effect.Stacking
		switch {
		case effect.Kind == KindDisable && m != nil:
			add(path+".magnitude", "A disable effect has no magnitude; use null.")
		case effect.Kind != KindDisable && effect.Kind != KindCustom && m == nil:
			add(path+".magnitude", fmt.Sprintf("A %s effect needs a magnitude.", effect.Kind))
		}
		if m != nil {
			if m.Min > m.Max {
				add(path+".magnitude.min", "The minimum magnitude cannot exceed the maximum.")
			}
			if effect.Kind == KindDamageOverTime && m.Unit != "damage/s" {
				add(path+".magnitude.unit", "Damage over time is measured in damage/s.")
			}
			if effect.Kind == KindMoveSpeed && m.Unit == "percent" && m.Max > 100 {
				add(path+".magnitude.max", "A movement slow cannot exceed 100 percent.")
			}
		}
		if stacking.MaxMagnitude != nil {
			if m == nil {
				add(path+".stacking.maxMagnitude", "Only an effect with a magnitude can cap it; use null.")
			} else if *stacking.MaxMagnitude < m.Min {
				add(path+".stacking.maxMagnitude", "The stacked cap cannot be below the minimum magnitude.")
			}
		}
		if stacking.Refresh == RefreshExtend && stacking.MaxStacks > 1 && m != nil && stacking.MaxMagnitude != nil {
			add(path+".stacking.maxMagnitude", "Extending stacks add duration, not magnitude, so a stacked cap has no effect; use null.")
		}
	}
	return issues
}
