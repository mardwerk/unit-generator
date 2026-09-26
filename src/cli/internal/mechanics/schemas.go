// Package mechanics owns the typed 3×5 unit mechanics: the blueprint and
// Definition contract, build resolution, legality, validation and design policy.
package mechanics

import (
	"strconv"
	"strings"

	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

// PathKeys and TierKeys name the fixed 3 paths × 5 tiers.
var (
	PathKeys = []string{"path1", "path2", "path3"}
	TierKeys = []string{"tier1", "tier2", "tier3", "tier4", "tier5"}
	StatKeys = []string{
		"damage", "intervalSeconds", "range", "pierce", "projectiles", "splashRadius",
		"slowPercent", "slowSeconds", "burnDamagePerSecond", "burnSeconds", "stunSeconds",
	}
	BoostStatKeys       = []string{"durationSeconds", "cooldownSeconds", "damageMultiplier", "intervalMultiplier", "rangeBonus"}
	PathSpecializations = []string{"direct-damage", "group-damage", "attack-speed", "control", "range", "ability-burst"}
	Deliveries          = []string{"projectile", "instant", "area", "beam"}
	DamageTypes         = []string{"sharp", "normal", "explosive", "energy"}
	Targetings          = []string{"first", "last", "close", "strong"}
	Distributions       = []string{"same-primary", "distinct-targets"}
	Operations          = []string{"add", "multiply", "set"}
	EnemyProperties     = []string{"lead", "frozen", "purple", "black", "zebra", "blimp", "boss"}
)

func text() *s.StringSchema             { return s.Text() }
func nonnegative() *s.NumberSchema      { return s.Number().Nonnegative() }
func positive() *s.NumberSchema         { return s.Number().Positive() }
func positiveInt() *s.NumberSchema      { return s.Number().Positive().Int() }
func enum(values []string) s.Schema     { return s.Enum(values...) }
func lit(value string) *s.LiteralSchema { return s.Literal(value) }

// Schemas used by validation, decoding and provider grammars.
var (
	AttackStatsSchema = s.StrictObject(
		s.F("damage", nonnegative()),
		s.F("intervalSeconds", positive()),
		s.F("range", positive()),
		s.F("pierce", positiveInt()),
		s.F("projectiles", positiveInt()),
		s.F("splashRadius", nonnegative()),
		s.F("slowPercent", nonnegative().Max(100)),
		s.F("slowSeconds", nonnegative()),
		s.F("burnDamagePerSecond", nonnegative()),
		s.F("burnSeconds", nonnegative()),
		s.F("stunSeconds", nonnegative()),
	)
	DistributionSchema = s.Enum(Distributions...)
	FollowUpSchema     = s.StrictObject(
		s.F("name", text().Max(80)),
		s.F("count", positiveInt().Max(12)),
		s.F("damageMultiplier", positive()),
		s.F("radius", positive()),
		s.F("inheritStatuses", s.Bool()),
	)
	DeliverySchema   = s.Enum(Deliveries...)
	DamageTypeSchema = s.Enum(DamageTypes...)
	TargetingSchema  = s.Enum(Targetings...)
	AttackSchema     = s.StrictObject(
		s.F("name", text()),
		s.F("cost", positive()),
		s.F("delivery", DeliverySchema),
		s.F("damageType", DamageTypeSchema),
		s.F("targeting", TargetingSchema),
		s.F("camo", s.Bool()),
		s.F("stats", AttackStatsSchema),
		s.F("distribution", s.Optional(DistributionSchema)),
		s.F("followUp", s.Optional(FollowUpSchema)),
	)
	BoostSchema = s.StrictObject(
		s.F("name", text()),
		s.F("durationSeconds", positive()),
		s.F("cooldownSeconds", positive()),
		s.F("damageMultiplier", positive()),
		s.F("intervalMultiplier", positive()),
		s.F("rangeBonus", nonnegative()),
	)
	OperationSchema = s.Enum(Operations...)
	ChangeSchema    = s.DiscriminatedUnion("kind",
		s.StrictObject(s.F("kind", lit("stat")), s.F("target", lit("base")), s.F("stat", enum(StatKeys)), s.F("operation", OperationSchema), s.F("value", s.Number())),
		s.StrictObject(s.F("kind", lit("camo")), s.F("target", lit("base")), s.F("value", s.Bool())),
		s.StrictObject(s.F("kind", lit("delivery")), s.F("target", lit("base")), s.F("value", DeliverySchema)),
		s.StrictObject(s.F("kind", lit("damageType")), s.F("target", lit("base")), s.F("value", DamageTypeSchema)),
		s.StrictObject(s.F("kind", lit("targeting")), s.F("target", lit("base")), s.F("value", TargetingSchema)),
		s.StrictObject(s.F("kind", lit("distribution")), s.F("target", lit("base")), s.F("value", DistributionSchema)),
		s.StrictObject(s.F("kind", lit("followUp")), s.F("target", s.Enum("base", "boost")), s.F("value", FollowUpSchema)),
		s.StrictObject(s.F("kind", lit("unlockBoost")), s.F("target", lit("base")), s.F("boost", BoostSchema)),
		s.StrictObject(s.F("kind", lit("modifyBoost")), s.F("target", lit("base")), s.F("stat", enum(BoostStatKeys)), s.F("operation", OperationSchema), s.F("value", s.Number())),
	)
	tierSchema = s.StrictObject(
		s.F("name", text().Max(80)),
		s.F("cost", positive()),
		s.F("changes", s.Array(ChangeSchema).Min(1).Max(4)),
	)
	PathSchema = s.StrictObject(
		s.F("name", text().Max(80)),
		s.F("specialization", s.Optional(enum(PathSpecializations))),
		s.F("theme", text().Max(300)),
		s.F("rationale", text().Max(300)),
		s.F("sourceFactIndices", s.Array(s.Int().Nonnegative()).Min(1).Max(96)),
		s.F("tiers", tiersOf(tierSchema)),
	)
	ProposalSchema  = s.StrictObject(s.F("name", text()), s.F("reason", text()))
	BlueprintSchema = s.StrictObject(
		s.F("referencePattern", s.Optional(s.StrictObject(s.F("id", text()), s.F("version", s.Enum("1", "2"))))),
		s.F("name", text()),
		s.F("role", text().Max(300)),
		s.F("weakness", text().Max(300)),
		s.F("sourceFacts", s.Array(s.StrictObject(s.F("documentId", text()), s.F("quote", text().Max(500)))).Min(1).Max(96)),
		s.F("constraintCoverage", s.Array(s.StrictObject(s.F("constraintId", text()), s.F("implementation", text().Max(500))))),
		s.F("baseAttack", AttackSchema),
		s.F("paths", pathsOf(PathSchema)),
		s.F("proposals", s.Array(ProposalSchema)),
		s.F("reservedTechniques", s.Array(ProposalSchema)),
	)
	diagnosticTier = tierSchema.Extend(s.F("changes", s.Array(ChangeSchema).Max(20)))
	// DiagnosticBlueprintSchema keeps over-budget tiers inspectable (at most 20 effects).
	DiagnosticBlueprintSchema = BlueprintSchema.Extend(s.F("paths", pathsOf(PathSchema.Extend(s.F("tiers", tiersOf(diagnosticTier))))))

	properties                = s.Array(enum(EnemyProperties))
	MechanicsDefinitionSchema = s.StrictObject(
		s.F("version", lit("1")),
		s.F("id", text()),
		s.F("revision", text()),
		s.F("label", text()),
		s.F("balanceStatus", lit("experimental-starter-scale")),
		s.F("progression", s.StrictObject(
			s.F("pathCount", s.Literal(3)),
			s.F("tiersPerPath", s.Literal(5)),
			s.F("maxPurchasedPaths", s.Int().Min(1).Max(2)),
			s.F("maxAdvancedPaths", s.Literal(1)),
			s.F("crosspathTier", s.Int().Min(1).Max(2)),
		)),
		s.F("rules", s.StrictObject(
			s.F("attackExtensions", s.Optional(s.Array(s.Enum("distinct-volley", "volley-follow-up")))),
			s.F("arithmetic", lit("highest-tier-set-then-add-then-multiply")),
			s.F("tieBreak", lit("path-order-then-change-order")),
			s.F("detection", lit("camo-is-target-access-only")),
			s.F("obstruction", lit("all-deliveries-require-clear-path")),
			s.F("projectileDistribution", lit("same-primary-target-per-volley")),
			s.F("targetCap", lit("per-projectile-including-primary-and-splash")),
			s.F("manualBoostUnlockTier", s.Literal(4)),
			s.F("manualBoostModifyTier", s.Literal(5)),
			s.F("abilityReadiness", lit("ready-on-purchase-cooldown-starts-on-activation-no-reactivation-while-active")),
			s.F("slowStacking", lit("strongest-only-refresh-duration")),
			s.F("burnStacking", lit("strongest-only-refresh-duration")),
			s.F("stunStacking", lit("refresh-duration")),
			s.F("damageImmunities", s.StrictObject(
				s.F("sharp", properties), s.F("normal", properties), s.F("explosive", properties), s.F("energy", properties),
			)),
			s.F("slowImmune", properties),
			s.F("stunImmune", properties),
		)),
		s.F("profile", s.StrictObject(
			s.F("currency", text()),
			// Legacy: older Definitions name a drafting route here. It has no effect.
			s.F("authoringMode", s.Optional(s.Enum("direct", "reference-patterns-v1", "planned-v1"))),
			s.F("designPolicy", s.Optional(s.StrictObject(
				s.F("version", lit("1")),
				s.F("distinctPathSpecializations", s.Bool()),
				s.F("distinctFirstUpgrades", s.Bool()),
				s.F("distinctCapstones", s.Bool()),
				s.F("preserveEarlyAttackIdentity", s.Optional(s.Bool())),
				s.F("maxManualAbilityPaths", s.Int().Min(0).Max(3)),
				s.F("manualAbilityPath", s.Optional(s.Nullable(enum(PathKeys)))),
				s.F("minTier5SpecialtyMultiplier", s.Optional(s.Number().Gt(1).Max(20))),
				s.F("requireTier3BehaviorChange", s.Optional(s.Bool())),
				s.F("requireTier5BehaviorChange", s.Optional(s.Bool())),
				s.F("tier5Uniqueness", lit("one-per-player-unit-type-and-path")),
			))),
			s.F("referenceScale", s.Optional(s.StrictObject(
				s.F("healthResource", text()),
				s.F("startingHealth", positive()),
				s.F("ordinaryEnemyHealth", positive()),
				s.F("baseCost", positive()),
				s.F("baseDamage", positive()),
				s.F("baseIntervalSeconds", positive()),
				s.F("baseRange", positive()),
				s.F("basePierce", positiveInt()),
				s.F("incrementalUpgradeCosts", s.Tuple(positive(), positive(), positive(), positive(), positive())),
			))),
			s.F("maxBaseCost", positive()),
			s.F("maxUpgradeCost", positive()),
			s.F("maxStatValue", positive()),
			s.F("maxChangesPerTier", s.Int().Min(1).Max(4)),
			s.F("earlyTierMaxChanges", s.Int().Min(1).Max(3)),
			s.F("earlyTierThrough", s.Optional(s.Int().Min(1).Max(3))),
			s.F("earlyTierMaxNewCapabilities", s.Int().Min(0).Max(1)),
		)),
	)
)

func tiersOf(tier s.Schema) *s.ObjectSchema {
	return s.StrictObject(s.F("tier1", tier), s.F("tier2", tier), s.F("tier3", tier), s.F("tier4", tier), s.F("tier5", tier))
}

func pathsOf(path s.Schema) *s.ObjectSchema {
	return s.StrictObject(s.F("path1", path), s.F("path2", path), s.F("path3", path))
}

// Version 2 schemas take their IDs from a vocabulary. Given nil they accept
// any well-formed ID, for reading artifacts whose Definition is checked
// separately.
func vocabularyIDs(v *Vocabulary, list func(*Vocabulary) []string) s.Schema {
	if v == nil {
		return vocabularyID
	}
	return s.Enum(list(v)...)
}

func damageTypeIDs(v *Vocabulary) []string {
	var out []string
	for _, t := range v.DamageTypes {
		out = append(out, t.ID)
	}
	return out
}

func termIDs(terms []Term) []string {
	var out []string
	for _, t := range terms {
		out = append(out, t.ID)
	}
	return out
}

func effectIDs(v *Vocabulary) []string {
	var out []string
	for _, e := range v.StatusEffects {
		out = append(out, e.ID)
	}
	return out
}

// DamageTypeSchemaV2, TargetingSchemaV2, DetectionSchemaV2 and
// EffectSchemaV2 are the vocabulary's IDs.
func DamageTypeSchemaV2(v *Vocabulary) s.Schema { return vocabularyIDs(v, damageTypeIDs) }
func TargetingSchemaV2(v *Vocabulary) s.Schema {
	return vocabularyIDs(v, func(v *Vocabulary) []string { return termIDs(v.Targeting) })
}
func DetectionSchemaV2(v *Vocabulary) s.Schema {
	return vocabularyIDs(v, func(v *Vocabulary) []string { return termIDs(v.Detection) })
}
func EffectSchemaV2(v *Vocabulary) s.Schema { return vocabularyIDs(v, effectIDs) }

var (
	// CoreStatsSchema is a version 2 attack's stats.
	CoreStatsSchema = AttackStatsSchema.Omit("slowPercent", "slowSeconds", "burnDamagePerSecond", "burnSeconds", "stunSeconds")
	// StatusFieldSchema names a resolvable number of an applied status.
	StatusFieldSchema = enum(StatusFields)
)

// StatusApplicationSchema is one applied status effect.
func StatusApplicationSchema(v *Vocabulary) *s.ObjectSchema {
	return s.StrictObject(
		s.F("effect", EffectSchemaV2(v)),
		s.F("magnitude", s.Optional(nonnegative())),
		s.F("seconds", nonnegative()),
	)
}

// AttackSchemaV2 is a version 2 attack.
func AttackSchemaV2(v *Vocabulary) *s.ObjectSchema {
	return s.StrictObject(
		s.F("name", text()),
		s.F("cost", positive()),
		s.F("delivery", DeliverySchema),
		s.F("damageType", DamageTypeSchemaV2(v)),
		s.F("targeting", TargetingSchemaV2(v)),
		s.F("detects", s.Array(DetectionSchemaV2(v)).Max(8)),
		s.F("stats", CoreStatsSchema),
		s.F("statuses", s.Array(StatusApplicationSchema(v)).Max(16)),
		s.F("distribution", s.Optional(DistributionSchema)),
		s.F("followUp", s.Optional(FollowUpSchema)),
	)
}

// ChangeSchemaV2 is one typed effect of a version 2 upgrade: core stats,
// status fields and detection replace the version 1 stats and camo.
func ChangeSchemaV2(v *Vocabulary) s.Schema {
	return s.DiscriminatedUnion("kind",
		s.StrictObject(s.F("kind", lit("stat")), s.F("target", lit("base")), s.F("stat", enum(CoreStatKeys)), s.F("operation", OperationSchema), s.F("value", s.Number())),
		s.StrictObject(s.F("kind", lit("status")), s.F("target", lit("base")), s.F("effect", EffectSchemaV2(v)), s.F("field", StatusFieldSchema), s.F("operation", OperationSchema), s.F("value", s.Number())),
		s.StrictObject(s.F("kind", lit("detection")), s.F("target", lit("base")), s.F("trait", DetectionSchemaV2(v)), s.F("value", s.Bool())),
		s.StrictObject(s.F("kind", lit("delivery")), s.F("target", lit("base")), s.F("value", DeliverySchema)),
		s.StrictObject(s.F("kind", lit("damageType")), s.F("target", lit("base")), s.F("value", DamageTypeSchemaV2(v))),
		s.StrictObject(s.F("kind", lit("targeting")), s.F("target", lit("base")), s.F("value", TargetingSchemaV2(v))),
		s.StrictObject(s.F("kind", lit("distribution")), s.F("target", lit("base")), s.F("value", DistributionSchema)),
		s.StrictObject(s.F("kind", lit("followUp")), s.F("target", s.Enum("base", "boost")), s.F("value", FollowUpSchema)),
		s.StrictObject(s.F("kind", lit("unlockBoost")), s.F("target", lit("base")), s.F("boost", BoostSchema)),
		s.StrictObject(s.F("kind", lit("modifyBoost")), s.F("target", lit("base")), s.F("stat", enum(BoostStatKeys)), s.F("operation", OperationSchema), s.F("value", s.Number())),
	)
}

func blueprintSchemaV2(v *Vocabulary, maxChanges int) *s.ObjectSchema {
	changes := s.Array(ChangeSchemaV2(v)).Min(1).Max(maxChanges)
	if maxChanges > 4 {
		changes = s.Array(ChangeSchemaV2(v)).Max(maxChanges)
	}
	tier := tierSchema.Extend(s.F("changes", changes))
	return BlueprintSchema.Extend(
		s.F("baseAttack", AttackSchemaV2(v)),
		s.F("paths", pathsOf(PathSchema.Extend(s.F("tiers", tiersOf(tier))))),
	)
}

// BlueprintSchemaV2 is a version 2 blueprint; DiagnosticBlueprintSchemaV2
// keeps over-budget tiers inspectable, like its version 1 counterpart.
func BlueprintSchemaV2(v *Vocabulary) *s.ObjectSchema           { return blueprintSchemaV2(v, 4) }
func DiagnosticBlueprintSchemaV2(v *Vocabulary) *s.ObjectSchema { return blueprintSchemaV2(v, 20) }

// BlueprintSchemaFor and DiagnosticBlueprintSchemaFor pick the blueprint
// schema a Definition's units use.
func BlueprintSchemaFor(d Definition) *s.ObjectSchema {
	if d.IsV2() {
		return BlueprintSchemaV2(d.Vocabulary)
	}
	return BlueprintSchema
}

func DiagnosticBlueprintSchemaFor(d Definition) *s.ObjectSchema {
	if d.IsV2() {
		return DiagnosticBlueprintSchemaV2(d.Vocabulary)
	}
	return DiagnosticBlueprintSchema
}

// AttackSchemaFor is the attack schema of a Definition's units.
func AttackSchemaFor(d Definition) *s.ObjectSchema {
	if d.IsV2() {
		return AttackSchemaV2(d.Vocabulary)
	}
	return AttackSchema
}

// DefinitionV2Schema is a version 2 Definition: version 1 without the fixed
// rules a vocabulary replaces, plus the vocabulary.
var DefinitionV2Schema = s.StrictObject(
	s.F("version", lit("2")),
	s.F("id", text()),
	s.F("revision", text()),
	s.F("label", text()),
	s.F("balanceStatus", lit("experimental-starter-scale")),
	s.F("progression", MechanicsDefinitionSchema.Shape("progression")),
	s.F("rules", MechanicsDefinitionSchema.Shape("rules").(*s.ObjectSchema).Omit(legacyRules...)),
	s.F("vocabulary", VocabularySchema),
	s.F("profile", MechanicsDefinitionSchema.Shape("profile")),
).SuperRefine(func(value *s.Object, add func(path []any, message string)) {
	raw, _ := value.Get("vocabulary")
	var vocabulary Vocabulary
	if err := s.ToGo(raw, &vocabulary); err != nil {
		add([]any{"vocabulary"}, err.Error())
		return
	}
	for _, issue := range VocabularyIssues(vocabulary) {
		add(issuePath(issue.Path), issue.Message)
	}
})

// issuePath splits a dotted issue path, turning indices into numbers.
func issuePath(path string) []any {
	var out []any
	for _, part := range strings.Split(path, ".") {
		if n, err := strconv.Atoi(part); err == nil {
			out = append(out, n)
		} else {
			out = append(out, part)
		}
	}
	return out
}

// DefinitionSchemaOf picks the schema for a Definition value by its version.
// Anything but version "2" is checked as version 1, as it always was.
func DefinitionSchemaOf(value any) *s.ObjectSchema {
	if o, ok := value.(*s.Object); ok {
		if version, _ := o.Get("version"); version == "2" {
			return DefinitionV2Schema
		}
	}
	return MechanicsDefinitionSchema
}
