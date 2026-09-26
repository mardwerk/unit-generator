package unit

import (
	"regexp"

	"github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

func planText() *s.StringSchema { return s.String().Trim().Min(1).Max(800) }

var (
	planSourceIDs = s.Array(s.String().Min(1)).Min(1).Max(96)
	planBranch    = s.StrictObject(
		s.F("name", planText().Max(80)),
		s.F("sourceIds", planSourceIDs),
		s.F("buyFor", planText().Max(300)),
		s.F("weakness", planText()),
		s.F("milestones", s.StrictObject(
			s.F("tier1", planText()), s.F("tier2", planText()), s.F("tier3", planText()), s.F("tier4", planText()), s.F("tier5", planText()),
		)),
		s.F("capstoneValue", planText()),
		s.F("crosspaths", s.Array(s.StrictObject(s.F("path", s.Enum(mechanics.PathKeys...)), s.F("contribution", planText()))).Length(2)),
		s.F("referenceExample", planText()),
	)
	// Improvements and Unlocks are the typed promises a plan may make per milestone.
	Improvements = []string{
		"damage", "attack-rate", "range", "pierce", "projectiles", "splash", "slow", "burn", "stun",
		"follow-up", "active-damage", "active-attack-rate", "active-duration", "active-frequency",
	}
	Unlocks = []string{
		"none", "manual-boost", "follow-up", "active-follow-up", "camo", "distinct-volley", "splash",
		"slow", "burn", "stun", "delivery-change", "damage-type-change", "targeting-change",
	}
	UpgradeIntentSchema  = upgradeIntentSchema(s.Enum(Improvements...), s.Enum(Unlocks...))
	UpgradeIntentsSchema = upgradeIntentsSchema(UpgradeIntentSchema)

	// DesignPlanSchema is a retained design proposal, not evidence its mechanics run.
	DesignPlanSchema = s.StrictObject(
		s.F("contract", s.Optional(s.Literal("purchase-plan-v1"))),
		s.F("concept", planText()),
		s.F("signature", s.StrictObject(s.F("name", planText().Max(80)), s.F("sourceIds", planSourceIDs), s.F("adaptation", planText()))),
		s.F("repertoire", s.Array(s.StrictObject(s.F("name", planText().Max(80)), s.F("sourceIds", planSourceIDs), s.F("limitation", planText()))).Min(1).Max(32)),
		s.F("base", s.StrictObject(s.F("name", planText().Max(80)), s.F("sourceIds", planSourceIDs), s.F("behavior", planText()))),
		s.F("paths", s.StrictObject(s.F("path1", planBranch), s.F("path2", planBranch), s.F("path3", planBranch))),
		s.F("omittedTechniques", s.Array(s.StrictObject(s.F("name", planText().Max(80)), s.F("reason", planText()))).Max(12)),
		s.F("scopeLimits", s.Array(planText()).Max(24)),
		s.F("upgradeIntents", s.Optional(UpgradeIntentsSchema)),
	)

	letter = regexp.MustCompile(`\p{L}`)

	// DesignPlanAuthoringSchema is the plan a model authors, held to
	// planAuthoringFloor.
	DesignPlanAuthoringSchema = DesignPlanSchema.Extend(s.F("upgradeIntents", UpgradeIntentsSchema)).SuperRefine(planAuthoringFloor)
)

// DesignPlanAuthoringSchemaFor is the authoring schema under a Definition.
func DesignPlanAuthoringSchemaFor(d *mechanics.Definition) *s.ObjectSchema {
	if d == nil || !d.IsV2() {
		return DesignPlanAuthoringSchema
	}
	return DesignPlanSchema.Extend(s.F("upgradeIntents", UpgradeIntentsSchemaFor(d))).SuperRefine(planAuthoringFloor)
}

// planAuthoringFloor adds a small lexical floor that catches empty
// placeholder output, not strategic quality.
func planAuthoringFloor(plan *s.Object, add func(path []any, message string)) {
	var inspect func(value any, path []any)
	inspect = func(value any, path []any) {
		if len(path) > 0 && path[0] == "upgradeIntents" {
			return
		}
		switch v := value.(type) {
		case string:
			last := any(nil)
			if len(path) > 0 {
				last = path[len(path)-1]
			}
			if last == "name" || last == "path" || containsKey(path, "sourceIds") {
				return
			}
			// Every letter belongs to a word-like segment, so this matches
			// the original letters-and-words test.
			if len(letter.FindAllString(v, 4)) < 4 {
				add(path, "Describe the proposed behavior or limitation in words, not punctuation or numeric placeholders.")
			}
		case []any:
			for i, item := range v {
				inspect(item, appendPath(path, i))
			}
		case *s.Object:
			for _, key := range v.Keys() {
				item, _ := v.Get(key)
				inspect(item, appendPath(path, key))
			}
		}
	}
	inspect(plan, nil)
	intents, _ := plan.Get("upgradeIntents")
	for _, path := range mechanics.PathKeys {
		p, _ := intents.(*s.Object).Get(path)
		for _, tier := range mechanics.TierKeys {
			t, _ := p.(*s.Object).Get(tier)
			improves, _ := t.(*s.Object).Get("improves")
			unlock, _ := t.(*s.Object).Get("unlock")
			if len(improves.([]any)) == 0 && unlock == "none" {
				add([]any{"upgradeIntents", path, tier}, "Declare at least one supported improvement or unlock for this milestone.")
			}
		}
	}
}

func upgradeIntentSchema(improvement, unlock s.Schema) *s.ObjectSchema {
	return s.StrictObject(s.F("improves", s.Array(improvement).Max(4)), s.F("unlock", unlock))
}

func upgradeIntentsSchema(intent s.Schema) *s.ObjectSchema {
	path := s.StrictObject(
		s.F("tier1", intent), s.F("tier2", intent), s.F("tier3", intent), s.F("tier4", intent), s.F("tier5", intent),
	)
	return s.StrictObject(s.F("path1", path), s.F("path2", path), s.F("path3", path))
}

// Plan promises of a version 2 Definition: the core dimensions, each status
// effect as an improvement and an unlock, and each detection trait as an
// unlock. They replace version 1's slow, burn, stun and camo.
var (
	coreImprovements  = []string{"damage", "attack-rate", "range", "pierce", "projectiles", "splash"}
	boostImprovements = []string{"follow-up", "active-damage", "active-attack-rate", "active-duration", "active-frequency"}
)

// ImprovementsFor lists the improvements a Definition's plans may promise.
func ImprovementsFor(d *mechanics.Definition) []string {
	if d == nil || !d.IsV2() {
		return Improvements
	}
	out := append([]string{}, coreImprovements...)
	for _, effect := range d.Vocabulary.StatusEffects {
		out = append(out, effect.ID)
	}
	return append(out, boostImprovements...)
}

// UnlocksFor lists the unlocks a Definition's plans may promise.
func UnlocksFor(d *mechanics.Definition) []string {
	if d == nil || !d.IsV2() {
		return Unlocks
	}
	out := []string{"none", "manual-boost", "follow-up", "active-follow-up"}
	for _, trait := range d.Vocabulary.Detection {
		out = append(out, trait.ID)
	}
	out = append(out, "distinct-volley", "splash")
	for _, effect := range d.Vocabulary.StatusEffects {
		out = append(out, effect.ID)
	}
	return append(out, "delivery-change", "damage-type-change", "targeting-change")
}

// UpgradeIntentsSchemaFor is the promise schema under a Definition. For a
// version 2 Definition given as nil (reading artifacts), any well-formed ID.
func UpgradeIntentsSchemaFor(d *mechanics.Definition) *s.ObjectSchema {
	if d == nil {
		return upgradeIntentsSchema(upgradeIntentSchema(promiseID, promiseID))
	}
	if !d.IsV2() {
		return UpgradeIntentsSchema
	}
	return upgradeIntentsSchema(upgradeIntentSchema(s.Enum(ImprovementsFor(d)...), s.Enum(UnlocksFor(d)...)))
}

// promiseID is any well-formed promise ID; the Definition's vocabulary
// decides which ones a plan may use.
var promiseID = s.String().Regex(`^[a-z][a-z0-9-]{0,39}$`, "Use a promise ID of this Definition.")

func containsKey(path []any, key string) bool {
	for _, p := range path {
		if p == key {
			return true
		}
	}
	return false
}

func appendPath(path []any, key any) []any {
	return append(append([]any(nil), path...), key)
}

var (
	evalFinite = s.Number()
	evalMetric = s.Nullable(evalFinite)
	metrics    = s.Record(evalMetric)
	selection  = s.Tuple(s.Int(), s.Int(), s.Int())
	transition = s.LooseObject(
		s.F("from", selection),
		s.F("to", selection),
		s.F("incrementalGold", evalFinite),
		s.F("metricDeltas", s.Record(s.LooseObject(s.F("before", evalMetric), s.F("after", evalMetric), s.F("change", evalMetric)))),
		s.F("capabilityChanges", s.Array(s.String())),
	)
	comparison = s.LooseObject(
		s.F("path", s.Enum(mechanics.PathKeys...)),
		s.F("tier4", s.LooseObject(s.F("totalGold", evalFinite), s.F("metrics", metrics))),
		s.F("tier5", s.LooseObject(s.F("totalGold", evalFinite), s.F("metrics", metrics))),
		s.F("tier4CopiesAtTier5Budget", s.Nullable(evalFinite)),
		s.F("sameBudgetTier4Copies", s.LooseObject(
			s.F("count", s.Nullable(evalFinite)),
			s.F("additiveThroughputUpperBounds", metrics),
			s.F("perCopyMetrics", metrics),
		)),
		s.F("assumption", s.String()),
	)
	// DesignEvaluationSchema is the analytical purchase evidence retained with a draft.
	DesignEvaluationSchema = s.LooseObject(
		s.F("scope", s.Literal("analytical-not-simulation")),
		s.F("sourceClaims", s.Nullable(s.LooseObject(
			s.F("signature", DesignPlanSchema.Shape("signature")),
			s.F("scopeLimits", DesignPlanSchema.Shape("scopeLimits")),
			s.F("omittedTechniques", DesignPlanSchema.Shape("omittedTechniques")),
		))),
		s.F("paths", s.Array(s.LooseObject(
			s.F("path", s.Enum(mechanics.PathKeys...)),
			s.F("name", s.String()),
			s.F("purchaseClaim", s.Nullable(s.LooseObject(
				s.F("buyFor", s.String()),
				s.F("weakness", s.String()),
				s.F("capstoneValue", s.String()),
				s.F("sourceIds", s.Array(s.String())),
			))),
			s.F("milestones", s.Array(transition)),
			s.F("capstoneComparison", comparison),
			s.F("crosspaths", s.Array(transition.Extend(s.F("secondaryPath", s.Enum(mechanics.PathKeys...)), s.F("tier", s.Int())))),
		))),
		s.F("limitations", s.Array(s.String())),
	)
)
