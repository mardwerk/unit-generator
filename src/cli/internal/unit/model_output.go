package unit

import (
	"errors"
	"fmt"
	"strings"

	m "github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

// CountArithmeticGuidance is shared by drafting and targeted repair.
const CountArithmeticGuidance = "Both projectiles and pierce must resolve to positive integers in EVERY legal build, including intermediate tiers and crosspaths. Prefer whole-number add changes for counts. A multiplier of 1.5 on one projectile produces 1.5 and is invalid; add 1 produces 2. Fractional multipliers are allowed only when all composed counts remain integral. The engine never rounds counts. Repair the authored statChanges, not a derived builds field. Diagnostic changes indices refer to the decoded mechanics DSL; locate the corresponding stat in the wire tier statChanges."

var (
	ordinaryStats    = []string{"damage", "intervalSeconds", "range", "pierce", "projectiles", "splashRadius", "stunSeconds"}
	wireStatChange   = s.StrictObject(s.F("stat", s.Enum(ordinaryStats...)), s.F("operation", m.OperationSchema), s.F("value", s.Number()))
	wireBoostChanges = s.Array(s.StrictObject(s.F("stat", s.Enum(m.BoostStatKeys...)), s.F("operation", m.OperationSchema), s.F("value", s.Number()))).Max(4)
	wireUnlockBoost  = s.Nullable(m.BoostSchema)
	tierOutput       = s.StrictObject(
		s.F("name", s.String().Min(1).Max(80)),
		s.F("cost", s.Number().Positive()),
		s.F("statChanges", s.Array(wireStatChange).Max(4)),
		s.F("slow", s.Nullable(s.StrictObject(s.F("percent", s.Number().Positive().Max(100)), s.F("durationSeconds", s.Number().Positive())))),
		s.F("burn", s.Nullable(s.StrictObject(s.F("damagePerSecond", s.Number().Positive()), s.F("durationSeconds", s.Number().Positive())))),
		s.F("camo", s.Nullable(s.Bool())),
		s.F("delivery", s.Nullable(m.DeliverySchema)),
		s.F("damageType", s.Nullable(m.DamageTypeSchema)),
		s.F("targeting", s.Nullable(m.TargetingSchema)),
		s.F("distribution", s.Optional(s.Nullable(m.DistributionSchema))),
		s.F("followUp", s.Optional(s.Nullable(m.FollowUpSchema))),
		s.F("activeFollowUp", s.Optional(s.Nullable(m.FollowUpSchema))),
		s.F("unlockBoost", wireUnlockBoost),
		s.F("boostChanges", wireBoostChanges),
	)
	pathOutput = m.PathSchema.Omit("sourceFactIndices", "specialization")
)

// wireStatusSchema is a status effect as models write it, with a null
// magnitude for effects that have none.
func wireStatusSchema(v *m.Vocabulary) *s.ObjectSchema {
	return s.StrictObject(
		s.F("effect", m.EffectSchemaV2(v)),
		s.F("magnitude", s.Nullable(s.Number().Positive())),
		s.F("seconds", s.Number().Positive()),
	)
}

// tierOutputFor is a tier as models write it. Under a version 2 Definition,
// statuses and detect replace slow, burn and camo, and the vocabulary names
// damage types and targeting.
func tierOutputFor(d *m.Definition) *s.ObjectSchema {
	if d == nil || !d.IsV2() {
		return tierOutput
	}
	v := d.Vocabulary
	budget := d.Profile.MaxChangesPerTier
	statuses := s.Array(wireStatusSchema(v)).Max(budget)
	if len(v.StatusEffects) == 0 {
		statuses = s.Array(wireStatusSchema(v)).Max(0)
	}
	var detect s.Schema = s.Nullable(m.DetectionSchemaV2(v))
	if len(v.Detection) == 0 {
		detect = s.Null()
	}
	return s.StrictObject(
		s.F("name", s.String().Min(1).Max(80)),
		s.F("cost", s.Number().Positive()),
		s.F("statChanges", s.Array(s.StrictObject(s.F("stat", s.Enum(m.CoreStatKeys...)), s.F("operation", m.OperationSchema), s.F("value", s.Number()))).Max(budget)),
		s.F("statuses", statuses),
		s.F("detect", detect),
		s.F("delivery", s.Nullable(m.DeliverySchema)),
		s.F("damageType", s.Nullable(m.DamageTypeSchemaV2(v))),
		s.F("targeting", s.Nullable(m.TargetingSchemaV2(v))),
		s.F("distribution", s.Optional(s.Nullable(m.DistributionSchema))),
		s.F("followUp", s.Optional(s.Nullable(m.FollowUpSchema))),
		s.F("activeFollowUp", s.Optional(s.Nullable(m.FollowUpSchema))),
		s.F("unlockBoost", wireUnlockBoost),
		s.F("boostChanges", wireBoostChanges),
	)
}

// ModelOutputSchema is the mechanics wire format for a request.
func ModelOutputSchema(request *Request) (*s.ObjectSchema, error) {
	var constraintIDs []string
	for _, c := range request.Constraints {
		constraintIDs = append(constraintIDs, c.ID)
	}
	var constraintID s.Schema = s.String()
	if len(constraintIDs) > 0 {
		constraintID = s.Enum(constraintIDs...)
	}
	coverage := s.StrictObject(s.F("constraintId", s.Text()), s.F("implementation", s.Text().Max(500))).Extend(s.F("constraintId", constraintID))
	evidence := AuthorEvidence(request)
	if len(evidence) == 0 {
		return nil, errors.New("Supply source text with at least one passage of 15 characters.")
	}
	var ids []string
	for _, span := range evidence {
		ids = append(ids, span.ID)
	}
	sourceIDs := s.Array(s.Enum(ids...)).Min(1).Max(96)
	definition := request.MechanicsDefinition
	var policy *m.DesignPolicy
	if definition != nil {
		policy = definition.Profile.DesignPolicy
	}
	followUp := s.Optional(s.Nullable(m.FollowUpSchema))
	if definition != nil && !definition.Rules.HasExtension("volley-follow-up") {
		followUp = s.Optional(s.Null())
	}
	distribution := s.Optional(s.Nullable(m.DistributionSchema))
	if definition != nil && !definition.Rules.HasExtension("distinct-volley") {
		distribution = s.Optional(s.Nullable(s.Literal("same-primary")))
	}
	unlockTier, modifyTier := 4, 5
	if definition != nil {
		unlockTier, modifyTier = definition.Rules.ManualBoostUnlockTier, definition.Rules.ManualBoostModifyTier
	}
	sourcedPath := func(key string) s.Schema {
		maxPaths := 1
		if policy != nil {
			maxPaths = policy.MaxManualAbilityPaths
		}
		allowsBoost := maxPaths > 0 && (policy == nil || !policy.ManualAbilityPath.Present ||
			(!policy.ManualAbilityPath.Null && policy.ManualAbilityPath.Value == key))
		atTier := func(tier int) s.Schema {
			active := s.Optional(s.Null())
			if allowsBoost && tier >= unlockTier {
				active = followUp
			}
			var unlock s.Schema = s.Null()
			if allowsBoost && tier == unlockTier {
				unlock = wireUnlockBoost
			}
			boosts := wireBoostChanges.Max(0)
			if allowsBoost && tier == modifyTier {
				boosts = wireBoostChanges
				if definition != nil && definition.IsV2() {
					boosts = wireBoostChanges.Max(definition.Profile.MaxChangesPerTier)
				}
			}
			return tierOutputFor(definition).Extend(
				s.F("distribution", distribution), s.F("followUp", followUp), s.F("activeFollowUp", active),
				s.F("unlockBoost", unlock), s.F("boostChanges", boosts),
			)
		}
		output := pathOutput.Extend(s.F("tiers", s.StrictObject(
			s.F("tier1", atTier(1)), s.F("tier2", atTier(2)), s.F("tier3", atTier(3)), s.F("tier4", atTier(4)), s.F("tier5", atTier(5)),
		)))
		if policy != nil {
			return output.Extend(s.F("sourceIds", sourceIDs), s.F("specialization", s.Enum(m.PathSpecializations...)))
		}
		return output.Extend(s.F("sourceIds", sourceIDs))
	}
	blueprint, attack := m.BlueprintSchema, m.AttackSchema
	if definition != nil && definition.IsV2() {
		blueprint = m.BlueprintSchemaV2(definition.Vocabulary)
		attack = m.AttackSchemaV2(definition.Vocabulary).Extend(s.F("statuses", s.Array(wireStatusSchema(definition.Vocabulary)).Max(16)))
	}
	return blueprint.Omit("sourceFacts", "proposals", "referencePattern").Extend(
		s.F("baseAttack", attack.Extend(s.F("distribution", distribution), s.F("followUp", followUp))),
		s.F("unsupportedMechanics", m.BlueprintSchema.Shape("proposals")),
		s.F("baseSourceIds", sourceIDs),
		s.F("name", s.Literal(request.Character.Name)),
		s.F("constraintCoverage", s.Array(coverage).Length(len(constraintIDs))),
		s.F("paths", s.StrictObject(s.F("path1", sourcedPath("path1")), s.F("path2", sourcedPath("path2")), s.F("path3", sourcedPath("path3")))),
	), nil
}

// ProviderJSONSchema adapts a schema's JSON Schema for provider grammars:
// every object property is required, numeric bounds and string lengths are
// dropped (runtime validation keeps them), and arrays lose their size bounds
// except for empty-only arrays.
func ProviderJSONSchema(schema s.Schema) *s.Object {
	root := s.JSONSchema(schema)
	adaptGrammar(root)
	return root
}

func adaptGrammar(value any) {
	switch node := value.(type) {
	case []any:
		for _, item := range node {
			adaptGrammar(item)
		}
	case *s.Object:
		kind, _ := node.Get("type")
		if properties, ok := node.Get("properties"); ok && kind == "object" {
			required := []any{}
			for _, key := range properties.(*s.Object).Keys() {
				required = append(required, key)
			}
			node.Set("required", required)
		}
		switch kind {
		case "number":
			node.Delete("exclusiveMinimum")
			node.Delete("minimum")
			node.Delete("exclusiveMaximum")
			node.Delete("maximum")
		case "string":
			node.Delete("minLength")
			node.Delete("maxLength")
		case "array":
			if maxItems, ok := node.Get("maxItems"); ok && maxItems == 0.0 {
				node.Set("items", s.NewObject().Set("type", "null"))
			} else {
				node.Delete("minItems")
				node.Delete("maxItems")
			}
		}
		for _, key := range node.Keys() {
			child, _ := node.Get(key)
			adaptGrammar(child)
		}
	}
}

// ModelOutputJSONSchema is the provider schema for mechanics output. The
// retained plan owns names, themes, rationales and citations, so they are omitted.
func ModelOutputJSONSchema(request *Request) (*s.Object, error) {
	schema, err := ModelOutputSchema(request)
	if err != nil {
		return nil, err
	}
	root := ProviderJSONSchema(schema)
	omit := func(node *s.Object, fields ...string) {
		props, _ := node.Get("properties")
		for _, f := range fields {
			props.(*s.Object).Delete(f)
		}
		required, _ := node.Get("required")
		var kept []any
		for _, r := range required.([]any) {
			drop := false
			for _, f := range fields {
				if r == f {
					drop = true
				}
			}
			if !drop {
				kept = append(kept, r)
			}
		}
		if kept == nil {
			kept = []any{}
		}
		node.Set("required", kept)
	}
	properties, _ := root.Get("properties")
	omit(root, "baseSourceIds")
	base, _ := properties.(*s.Object).Get("baseAttack")
	omit(base.(*s.Object), "name")
	paths, _ := properties.(*s.Object).Get("paths")
	pathProps, _ := paths.(*s.Object).Get("properties")
	for _, key := range m.PathKeys {
		node, _ := pathProps.(*s.Object).Get(key)
		omit(node.(*s.Object), "name", "sourceIds", "theme", "rationale")
	}
	return root, nil
}

// budgetSentence states the Definition's change budget per purchase.
func budgetSentence(request *Request) string {
	early, later := TierEffectLimit(request, "tier1"), TierEffectLimit(request, "tier5")
	through := 3
	if d := request.MechanicsDefinition; d != nil {
		through = d.Profile.EarlyThrough()
	}
	return fmt.Sprintf("Tier1 to Tier%d allow 1 to %d primitive changes total; Tier%d to Tier5 allow up to %d.", through, early, through+1, later)
}

// TierEffectLimit is the effect budget of a tier.
func TierEffectLimit(request *Request, tier string) int {
	n := int(tier[4] - '0')
	early, perTier, through := 3, 4, 3
	if d := request.MechanicsDefinition; d != nil {
		early, perTier, through = d.Profile.EarlyTierMaxChanges, d.Profile.MaxChangesPerTier, d.Profile.EarlyThrough()
	}
	if n <= through {
		return min(early, perTier)
	}
	return perTier
}

func present(o *s.Object, key string) bool {
	v, ok := o.Get(key)
	return ok && v != nil
}

func field(o *s.Object, key string) any {
	v, _ := o.Get(key)
	return v
}

// DecodeForDiagnostics decodes mechanics output while keeping every
// structurally valid effect, so one repair sees budget, domain and plan issues.
func DecodeForDiagnostics(output any, request *Request) (m.Blueprint, []s.Issue, error) {
	schema, err := ModelOutputSchema(request)
	if err != nil {
		return m.Blueprint{}, nil, err
	}
	parsedValue, issues := s.Parse(schema, output)
	if len(issues) > 0 {
		return m.Blueprint{}, nil, &s.Error{Issues: issues}
	}
	parsed := parsedValue.(*s.Object)
	pathsValue := field(parsed, "paths").(*s.Object)
	var budget []s.Issue
	v2 := request.MechanicsDefinition != nil && request.MechanicsDefinition.IsV2()
	nonnull := []string{"camo", "delivery", "damageType", "targeting", "unlockBoost", "distribution", "followUp", "activeFollowUp"}
	if v2 {
		nonnull[0] = "detect"
	}
	for _, path := range m.PathKeys {
		tiers := field(field(pathsValue, path).(*s.Object), "tiers").(*s.Object)
		for _, tier := range m.TierKeys {
			f := field(tiers, tier).(*s.Object)
			var selected []string
			for _, key := range nonnull {
				if present(f, key) {
					selected = append(selected, key)
				}
			}
			paired := 0
			if present(f, "slow") {
				paired += 2
			}
			if present(f, "burn") {
				paired += 2
			}
			if v2 {
				for _, status := range field(f, "statuses").([]any) {
					paired++
					if present(status.(*s.Object), "magnitude") {
						paired++
					}
				}
			}
			stats := len(field(f, "statChanges").([]any))
			boosts := len(field(f, "boostChanges").([]any))
			count := stats + boosts + len(selected) + paired
			limit := TierEffectLimit(request, tier)
			if count < 1 || count > limit {
				names := strings.Join(selected, ", ")
				if names == "" {
					names = "none"
				}
				advice := "Add one meaningful effect."
				if count > limit {
					advice = fmt.Sprintf("Remove at least %d effects from those fields.", count-limit)
				}
				primitives := "slow/burn primitive changes"
				if v2 {
					primitives = "status changes (magnitude and duration count separately)"
				}
				budget = append(budget, s.Issue{
					Code: "custom", Path: []any{"paths", path, "tiers", tier, "statChanges"},
					Message: fmt.Sprintf("This tier contains %d effects: %d statChanges, %d boostChanges, %d %s and %d nonnull fields (%s). Total must be 1 to %d. %s", count, stats, boosts, paired, primitives, len(selected), names, limit, advice),
				})
			}
		}
	}
	var selectedIDs []string
	seen := map[string]bool{}
	addIDs := func(list any) {
		for _, id := range list.([]any) {
			if !seen[id.(string)] {
				seen[id.(string)] = true
				selectedIDs = append(selectedIDs, id.(string))
			}
		}
	}
	addIDs(field(parsed, "baseSourceIds"))
	for _, path := range m.PathKeys {
		addIDs(field(field(pathsValue, path).(*s.Object), "sourceIds"))
	}
	factIndex := map[string]int{}
	for i, id := range selectedIDs {
		factIndex[id] = i
	}
	stat := func(name string, value any) any {
		return s.NewObject().Set("kind", "stat").Set("target", "base").Set("stat", name).Set("operation", "set").Set("value", value)
	}
	outPaths := s.NewObject()
	for _, key := range m.PathKeys {
		wire := field(pathsValue, key).(*s.Object)
		path := s.NewObject()
		for _, k := range wire.Keys() {
			if k != "sourceIds" && k != "tiers" {
				path.Set(k, field(wire, k))
			}
		}
		var indices []any
		used := map[string]bool{}
		for _, id := range field(wire, "sourceIds").([]any) {
			if !used[id.(string)] {
				used[id.(string)] = true
				indices = append(indices, float64(factIndex[id.(string)]))
			}
		}
		path.Set("sourceFactIndices", indices)
		tiers := s.NewObject()
		wireTiers := field(wire, "tiers").(*s.Object)
		for _, tierKey := range m.TierKeys {
			t := field(wireTiers, tierKey).(*s.Object)
			changes := []any{}
			for _, c := range field(t, "statChanges").([]any) {
				co := c.(*s.Object)
				changes = append(changes, s.NewObject().Set("kind", "stat").Set("target", "base").
					Set("stat", field(co, "stat")).Set("operation", field(co, "operation")).Set("value", field(co, "value")))
			}
			if present(t, "slow") {
				slow := field(t, "slow").(*s.Object)
				changes = append(changes, stat("slowPercent", field(slow, "percent")), stat("slowSeconds", field(slow, "durationSeconds")))
			}
			if present(t, "burn") {
				burn := field(t, "burn").(*s.Object)
				changes = append(changes, stat("burnDamagePerSecond", field(burn, "damagePerSecond")), stat("burnSeconds", field(burn, "durationSeconds")))
			}
			if v2 {
				for _, raw := range field(t, "statuses").([]any) {
					status := raw.(*s.Object)
					set := func(name string, value any) any {
						return s.NewObject().Set("kind", "status").Set("target", "base").Set("effect", field(status, "effect")).
							Set("field", name).Set("operation", "set").Set("value", value)
					}
					if present(status, "magnitude") {
						changes = append(changes, set("magnitude", field(status, "magnitude")))
					}
					changes = append(changes, set("seconds", field(status, "seconds")))
				}
				if present(t, "detect") {
					changes = append(changes, s.NewObject().Set("kind", "detection").Set("target", "base").Set("trait", field(t, "detect")).Set("value", true))
				}
			}
			simple := func(kind, target, key string) {
				if present(t, key) {
					changes = append(changes, s.NewObject().Set("kind", kind).Set("target", target).Set("value", field(t, key)))
				}
			}
			simple("camo", "base", "camo")
			simple("delivery", "base", "delivery")
			simple("distribution", "base", "distribution")
			simple("followUp", "base", "followUp")
			simple("followUp", "boost", "activeFollowUp")
			simple("damageType", "base", "damageType")
			simple("targeting", "base", "targeting")
			if present(t, "unlockBoost") {
				changes = append(changes, s.NewObject().Set("kind", "unlockBoost").Set("target", "base").Set("boost", field(t, "unlockBoost")))
			}
			for _, c := range field(t, "boostChanges").([]any) {
				co := c.(*s.Object)
				changes = append(changes, s.NewObject().Set("kind", "modifyBoost").Set("target", "base").
					Set("stat", field(co, "stat")).Set("operation", field(co, "operation")).Set("value", field(co, "value")))
			}
			tiers.Set(tierKey, s.NewObject().Set("name", field(t, "name")).Set("cost", field(t, "cost")).Set("changes", changes))
		}
		path.Set("tiers", tiers)
		outPaths.Set(key, path)
	}
	spans := map[string]EvidenceSpan{}
	for _, span := range AuthorEvidence(request) {
		spans[span.ID] = span
	}
	var facts []any
	for _, id := range selectedIDs {
		span := spans[id]
		facts = append(facts, s.NewObject().Set("documentId", span.DocumentID).Set("quote", span.Text))
	}
	blueprint := s.NewObject()
	for _, key := range parsed.Keys() {
		if key == "baseSourceIds" || key == "unsupportedMechanics" {
			continue
		}
		blueprint.Set(key, field(parsed, key))
	}
	wireBase := field(parsed, "baseAttack").(*s.Object)
	base := s.NewObject()
	for _, key := range wireBase.Keys() {
		if key != "distribution" && key != "followUp" {
			base.Set(key, field(wireBase, key))
		}
	}
	if v2 {
		statuses := []any{}
		for _, raw := range field(wireBase, "statuses").([]any) {
			status := raw.(*s.Object)
			out := s.NewObject().Set("effect", field(status, "effect"))
			if present(status, "magnitude") {
				out.Set("magnitude", field(status, "magnitude"))
			}
			statuses = append(statuses, out.Set("seconds", field(status, "seconds")))
		}
		base.Set("statuses", statuses)
	}
	if present(wireBase, "distribution") {
		base.Set("distribution", field(wireBase, "distribution"))
	}
	if present(wireBase, "followUp") {
		base.Set("followUp", field(wireBase, "followUp"))
	}
	blueprint.Set("baseAttack", base)
	blueprint.Set("proposals", field(parsed, "unsupportedMechanics"))
	blueprint.Set("sourceFacts", facts)
	blueprint.Set("paths", outPaths)
	diagnostic := m.DiagnosticBlueprintSchema
	if v2 {
		diagnostic = m.DiagnosticBlueprintSchemaV2(request.MechanicsDefinition.Vocabulary)
	}
	var decoded m.Blueprint
	if err := s.ParseInto(diagnostic, blueprint, &decoded); err != nil {
		return m.Blueprint{}, nil, err
	}
	return decoded, budget, nil
}

// DecodeBlueprintOutput decodes mechanics output strictly.
func DecodeBlueprintOutput(output any, request *Request) (m.Blueprint, error) {
	blueprint, budget, err := DecodeForDiagnostics(output, request)
	if err != nil {
		return m.Blueprint{}, err
	}
	if len(budget) > 0 {
		return m.Blueprint{}, &s.Error{Issues: budget}
	}
	schema := m.BlueprintSchema
	if d := request.MechanicsDefinition; d != nil {
		schema = m.BlueprintSchemaFor(*d)
	}
	var strict m.Blueprint
	if err := s.ParseInto(schema, s.FromGoValue(blueprint), &strict); err != nil {
		return m.Blueprint{}, err
	}
	return strict, nil
}
