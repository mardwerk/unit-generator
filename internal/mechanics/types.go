package mechanics

import (
	"encoding/json"
	"fmt"

	s "github.com/mardwerk/unit-generator/internal/schema"
)

// Definition is a mechanics Definition: the executable rules a unit follows.
type Definition struct {
	Version       string                `json:"version"`
	ID            string                `json:"id"`
	Revision      string                `json:"revision"`
	Label         string                `json:"label"`
	BalanceStatus string                `json:"balanceStatus"`
	Progression   DefinitionProgression `json:"progression"`
	Rules         Rules                 `json:"rules"`
	Profile       DefinitionProfile     `json:"profile"`
}

// DefinitionProgression is the fixed 3×5 shape and its crosspath limits.
type DefinitionProgression struct {
	PathCount         int `json:"pathCount"`
	TiersPerPath      int `json:"tiersPerPath"`
	MaxPurchasedPaths int `json:"maxPurchasedPaths"`
	MaxAdvancedPaths  int `json:"maxAdvancedPaths"`
	CrosspathTier     int `json:"crosspathTier"`
}

// Rules are the Definition's runtime rules.
type Rules struct {
	AttackExtensions       *[]string        `json:"attackExtensions,omitempty"`
	Arithmetic             string           `json:"arithmetic"`
	TieBreak               string           `json:"tieBreak"`
	Detection              string           `json:"detection"`
	Obstruction            string           `json:"obstruction"`
	ProjectileDistribution string           `json:"projectileDistribution"`
	TargetCap              string           `json:"targetCap"`
	ManualBoostUnlockTier  int              `json:"manualBoostUnlockTier"`
	ManualBoostModifyTier  int              `json:"manualBoostModifyTier"`
	AbilityReadiness       string           `json:"abilityReadiness"`
	SlowStacking           string           `json:"slowStacking"`
	BurnStacking           string           `json:"burnStacking"`
	StunStacking           string           `json:"stunStacking"`
	DamageImmunities       DamageImmunities `json:"damageImmunities"`
	SlowImmune             []string         `json:"slowImmune"`
	StunImmune             []string         `json:"stunImmune"`
}

// HasExtension reports whether an attack extension is enabled.
func (r Rules) HasExtension(name string) bool {
	if r.AttackExtensions == nil {
		return false
	}
	for _, e := range *r.AttackExtensions {
		if e == name {
			return true
		}
	}
	return false
}

// DamageImmunities lists enemy properties immune to each damage type.
type DamageImmunities struct {
	Sharp     []string `json:"sharp"`
	Normal    []string `json:"normal"`
	Explosive []string `json:"explosive"`
	Energy    []string `json:"energy"`
}

// For returns the immunities for a damage type.
func (d DamageImmunities) For(damageType string) []string {
	switch damageType {
	case "sharp":
		return d.Sharp
	case "normal":
		return d.Normal
	case "explosive":
		return d.Explosive
	}
	return d.Energy
}

// DefinitionProfile holds scale, budgets and the optional design policy.
type DefinitionProfile struct {
	Currency                    string          `json:"currency"`
	AuthoringMode               string          `json:"authoringMode,omitempty"`
	DesignPolicy                *DesignPolicy   `json:"designPolicy,omitempty"`
	ReferenceScale              *ReferenceScale `json:"referenceScale,omitempty"`
	MaxBaseCost                 float64         `json:"maxBaseCost"`
	MaxUpgradeCost              float64         `json:"maxUpgradeCost"`
	MaxStatValue                float64         `json:"maxStatValue"`
	MaxChangesPerTier           int             `json:"maxChangesPerTier"`
	EarlyTierMaxChanges         int             `json:"earlyTierMaxChanges"`
	EarlyTierThrough            *int            `json:"earlyTierThrough,omitempty"`
	EarlyTierMaxNewCapabilities int             `json:"earlyTierMaxNewCapabilities"`
}

// EarlyThrough is the last early tier (3 when unset).
func (p DefinitionProfile) EarlyThrough() int {
	if p.EarlyTierThrough == nil {
		return 3
	}
	return *p.EarlyTierThrough
}

// DesignPolicy is an optional set of authoring gates.
type DesignPolicy struct {
	Version                     string         `json:"version"`
	DistinctPathSpecializations bool           `json:"distinctPathSpecializations"`
	DistinctFirstUpgrades       bool           `json:"distinctFirstUpgrades"`
	DistinctCapstones           bool           `json:"distinctCapstones"`
	PreserveEarlyAttackIdentity *bool          `json:"preserveEarlyAttackIdentity,omitempty"`
	MaxManualAbilityPaths       int            `json:"maxManualAbilityPaths"`
	ManualAbilityPath           NullableString `json:"manualAbilityPath,omitempty"`
	MinTier5SpecialtyMultiplier *float64       `json:"minTier5SpecialtyMultiplier,omitempty"`
	RequireTier3BehaviorChange  *bool          `json:"requireTier3BehaviorChange,omitempty"`
	RequireTier5BehaviorChange  *bool          `json:"requireTier5BehaviorChange,omitempty"`
	Tier5Uniqueness             string         `json:"tier5Uniqueness"`
}

// ReferenceScale is the starter numerical scale shown to the model.
type ReferenceScale struct {
	HealthResource          string     `json:"healthResource"`
	StartingHealth          float64    `json:"startingHealth"`
	OrdinaryEnemyHealth     float64    `json:"ordinaryEnemyHealth"`
	BaseCost                float64    `json:"baseCost"`
	BaseDamage              float64    `json:"baseDamage"`
	BaseIntervalSeconds     float64    `json:"baseIntervalSeconds"`
	BaseRange               float64    `json:"baseRange"`
	BasePierce              float64    `json:"basePierce"`
	IncrementalUpgradeCosts [5]float64 `json:"incrementalUpgradeCosts"`
}

// NullableString is an optional, nullable string: absent, null or a value.
type NullableString struct {
	Present bool
	Null    bool
	Value   string
}

// IsAbsent reports an omitted member.
func (n NullableString) IsAbsent() bool { return !n.Present }

// JSONValue implements schema.ValueMarshaler.
func (n NullableString) JSONValue() any {
	if n.Null {
		return nil
	}
	return n.Value
}

// MarshalJSON writes null or the value.
func (n NullableString) MarshalJSON() ([]byte, error) { return json.Marshal(n.JSONValue()) }

// UnmarshalJSON reads null or a string.
func (n *NullableString) UnmarshalJSON(data []byte) error {
	n.Present = true
	if string(data) == "null" {
		n.Null = true
		return nil
	}
	return json.Unmarshal(data, &n.Value)
}

// AttackStats are the numeric properties of an attack.
type AttackStats struct {
	Damage              float64 `json:"damage"`
	IntervalSeconds     float64 `json:"intervalSeconds"`
	Range               float64 `json:"range"`
	Pierce              float64 `json:"pierce"`
	Projectiles         float64 `json:"projectiles"`
	SplashRadius        float64 `json:"splashRadius"`
	SlowPercent         float64 `json:"slowPercent"`
	SlowSeconds         float64 `json:"slowSeconds"`
	BurnDamagePerSecond float64 `json:"burnDamagePerSecond"`
	BurnSeconds         float64 `json:"burnSeconds"`
	StunSeconds         float64 `json:"stunSeconds"`
}

// Get returns a stat by key.
func (a *AttackStats) Get(key string) float64 { return *a.ptr(key) }

// Set assigns a stat by key.
func (a *AttackStats) Set(key string, value float64) { *a.ptr(key) = value }

func (a *AttackStats) ptr(key string) *float64 {
	switch key {
	case "damage":
		return &a.Damage
	case "intervalSeconds":
		return &a.IntervalSeconds
	case "range":
		return &a.Range
	case "pierce":
		return &a.Pierce
	case "projectiles":
		return &a.Projectiles
	case "splashRadius":
		return &a.SplashRadius
	case "slowPercent":
		return &a.SlowPercent
	case "slowSeconds":
		return &a.SlowSeconds
	case "burnDamagePerSecond":
		return &a.BurnDamagePerSecond
	case "burnSeconds":
		return &a.BurnSeconds
	case "stunSeconds":
		return &a.StunSeconds
	}
	panic("mechanics: unknown stat " + key)
}

// FollowUp is a bounded secondary hit after a primary volley.
type FollowUp struct {
	Name             string  `json:"name"`
	Count            float64 `json:"count"`
	DamageMultiplier float64 `json:"damageMultiplier"`
	Radius           float64 `json:"radius"`
	InheritStatuses  bool    `json:"inheritStatuses"`
}

// Attack is the unit's automatic attack.
type Attack struct {
	Name         string      `json:"name"`
	Cost         float64     `json:"cost"`
	Delivery     string      `json:"delivery"`
	DamageType   string      `json:"damageType"`
	Targeting    string      `json:"targeting"`
	Camo         bool        `json:"camo"`
	Stats        AttackStats `json:"stats"`
	Distribution string      `json:"distribution,omitempty"`
	FollowUp     *FollowUp   `json:"followUp,omitempty"`
}

// Clone copies an attack.
func (a Attack) Clone() Attack {
	if a.FollowUp != nil {
		f := *a.FollowUp
		a.FollowUp = &f
	}
	return a
}

// Boost is a temporary manual boost of the purchased attack.
type Boost struct {
	Name               string  `json:"name"`
	DurationSeconds    float64 `json:"durationSeconds"`
	CooldownSeconds    float64 `json:"cooldownSeconds"`
	DamageMultiplier   float64 `json:"damageMultiplier"`
	IntervalMultiplier float64 `json:"intervalMultiplier"`
	RangeBonus         float64 `json:"rangeBonus"`
}

// Get returns a boost stat by key.
func (b *Boost) Get(key string) float64 { return *b.ptr(key) }

// Set assigns a boost stat by key.
func (b *Boost) Set(key string, value float64) { *b.ptr(key) = value }

func (b *Boost) ptr(key string) *float64 {
	switch key {
	case "durationSeconds":
		return &b.DurationSeconds
	case "cooldownSeconds":
		return &b.CooldownSeconds
	case "damageMultiplier":
		return &b.DamageMultiplier
	case "intervalMultiplier":
		return &b.IntervalMultiplier
	case "rangeBonus":
		return &b.RangeBonus
	}
	panic("mechanics: unknown boost stat " + key)
}

// Change is one typed effect of an upgrade. Kind selects which fields apply:
// stat and modifyBoost use Stat, Operation and Number; camo uses Bool;
// delivery, damageType, targeting and distribution use Text; followUp uses
// FollowUp; unlockBoost uses Boost.
type Change struct {
	Kind      string
	Target    string
	Stat      string
	Operation string
	Number    float64
	Bool      bool
	Text      string
	FollowUp  *FollowUp
	Boost     *Boost
}

// JSONValue renders the change with the original key order.
func (c Change) JSONValue() any {
	o := s.NewObject().Set("kind", c.Kind).Set("target", c.Target)
	switch c.Kind {
	case "stat", "modifyBoost":
		o.Set("stat", c.Stat).Set("operation", c.Operation).Set("value", c.Number)
	case "camo":
		o.Set("value", c.Bool)
	case "followUp":
		o.Set("value", s.FromGoValue(c.FollowUp))
	case "unlockBoost":
		o.Set("boost", s.FromGoValue(c.Boost))
	default:
		o.Set("value", c.Text)
	}
	return o
}

// MarshalJSON writes the change's JSON form.
func (c Change) MarshalJSON() ([]byte, error) { return []byte(s.Stringify(c.JSONValue())), nil }

// UnmarshalJSON reads a validated change.
func (c *Change) UnmarshalJSON(data []byte) error {
	var raw struct {
		Kind      string          `json:"kind"`
		Target    string          `json:"target"`
		Stat      string          `json:"stat"`
		Operation string          `json:"operation"`
		Value     json.RawMessage `json:"value"`
		Boost     *Boost          `json:"boost"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	*c = Change{Kind: raw.Kind, Target: raw.Target, Stat: raw.Stat, Operation: raw.Operation, Boost: raw.Boost}
	switch raw.Kind {
	case "stat", "modifyBoost":
		return json.Unmarshal(raw.Value, &c.Number)
	case "camo":
		return json.Unmarshal(raw.Value, &c.Bool)
	case "followUp":
		c.FollowUp = &FollowUp{}
		return json.Unmarshal(raw.Value, c.FollowUp)
	case "unlockBoost":
		return nil
	case "delivery", "damageType", "targeting", "distribution":
		return json.Unmarshal(raw.Value, &c.Text)
	}
	return fmt.Errorf("unknown change kind %q", raw.Kind)
}

// Tier is one purchasable upgrade.
type Tier struct {
	Name    string   `json:"name"`
	Cost    float64  `json:"cost"`
	Changes []Change `json:"changes"`
}

// Tiers are the five upgrades of a path.
type Tiers struct {
	Tier1 Tier `json:"tier1"`
	Tier2 Tier `json:"tier2"`
	Tier3 Tier `json:"tier3"`
	Tier4 Tier `json:"tier4"`
	Tier5 Tier `json:"tier5"`
}

// At returns tier n (1–5).
func (t *Tiers) At(n int) *Tier {
	return [...]*Tier{&t.Tier1, &t.Tier2, &t.Tier3, &t.Tier4, &t.Tier5}[n-1]
}

// Path is one upgrade path of a blueprint.
type Path struct {
	Name              string `json:"name"`
	Specialization    string `json:"specialization,omitempty"`
	Theme             string `json:"theme"`
	Rationale         string `json:"rationale"`
	SourceFactIndices []int  `json:"sourceFactIndices"`
	Tiers             Tiers  `json:"tiers"`
}

// Paths are the three paths.
type Paths struct {
	Path1 Path `json:"path1"`
	Path2 Path `json:"path2"`
	Path3 Path `json:"path3"`
}

// At returns path index i (0–2).
func (p *Paths) At(i int) *Path { return [...]*Path{&p.Path1, &p.Path2, &p.Path3}[i] }

// SourceFact is a verbatim quote that supports the blueprint.
type SourceFact struct {
	DocumentID string `json:"documentId"`
	Quote      string `json:"quote"`
}

// Coverage records how a confirmed constraint is preserved.
type Coverage struct {
	ConstraintID   string `json:"constraintId"`
	Implementation string `json:"implementation"`
}

// Proposal is an unsupported mechanic or a reserved technique.
type Proposal struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}

// ReferencePattern records older code-authored mechanics (read-only).
type ReferencePattern struct {
	ID      string `json:"id"`
	Version string `json:"version"`
}

// Blueprint is the typed, executable form of a unit.
type Blueprint struct {
	ReferencePattern   *ReferencePattern `json:"referencePattern,omitempty"`
	Name               string            `json:"name"`
	Role               string            `json:"role"`
	Weakness           string            `json:"weakness"`
	SourceFacts        []SourceFact      `json:"sourceFacts"`
	ConstraintCoverage []Coverage        `json:"constraintCoverage"`
	BaseAttack         Attack            `json:"baseAttack"`
	Paths              Paths             `json:"paths"`
	Proposals          []Proposal        `json:"proposals"`
	ReservedTechniques []Proposal        `json:"reservedTechniques"`
}

// Selection is a build: the purchased tier (0–5) on each path.
type Selection [3]int

// Issue is one mechanics validation problem.
type Issue struct {
	Path    string `json:"path"`
	Message string `json:"message"`
}
