// Package mechanics owns the typed 3×5 unit mechanics: the blueprint and
// Definition contract, build resolution, legality, validation and design policy.
package mechanics

import s "github.com/mardwerk/unit-generator/internal/schema"

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
