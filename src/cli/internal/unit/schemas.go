// Package unit is the Engine: the unit contract, request preparation and
// hashing, drafting through a model, deterministic checks and review.
package unit

import (
	"net/url"
	"regexp"

	"github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

func text() *s.StringSchema { return s.Text() }
func refs() s.Schema        { return s.Array(text()) }

var (
	version        = s.Literal("1")
	decisionStatus = s.Enum("confirmed", "proposed", "open")
	referenceURL   = s.String().URL().Refine(func(value string) bool {
		u, err := url.Parse(value)
		return err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.User == nil
	}, "Reference URLs must use HTTP or HTTPS without credentials")

	VisualReferenceSchema = s.StrictObject(
		s.F("id", text()),
		s.F("url", referenceURL),
		s.F("sourceUrl", referenceURL),
		s.F("caption", text()),
		s.F("kind", s.Enum("appearance", "pose", "form", "reference")),
		s.F("attribution", s.Nullable(text())),
		s.F("width", s.Optional(s.Int().Positive().Max(100000))),
		s.F("height", s.Optional(s.Int().Positive().Max(100000))),
	)
	ResolvedDocumentSchema = s.StrictObject(
		s.F("id", text()),
		s.F("kind", s.Enum("source", "rules", "decisions")),
		s.F("text", s.String().Min(1).Refine(func(v string) bool { return s.Trim(v) != "" }, "Document must not be blank")),
		s.F("origin", s.StrictObject(
			s.F("location", text()),
			s.F("access", s.Enum("supplied", "local-file", "retrieved")),
			s.F("note", s.Nullable(text())),
		)),
		s.F("visualReferences", s.Optional(s.Array(VisualReferenceSchema))),
		s.F("visualNotes", s.Optional(s.Array(text()))),
	)
	CharacterSchema = s.StrictObject(s.F("name", text()), s.F("work", text()), s.F("scope", text()))
	FindingSchema   = s.StrictObject(
		s.F("id", text()),
		s.F("method", s.Enum("deterministic", "model")),
		s.F("category", s.Enum("conflict", "missing_specification", "unsupported", "evidence", "coverage", "scope")),
		s.F("severity", s.Enum("error", "warning", "info")),
		s.F("outcome", s.Enum("pass", "fail", "unresolved", "not_checked")),
		s.F("subject", text()),
		s.F("rule", text()),
		s.F("message", text()),
		s.F("evidence", refs()),
		s.F("action", s.Nullable(text())),
	)
	basicAttackSchema = s.StrictObject(
		s.F("name", text()), s.F("status", decisionStatus), s.F("decisionRefs", refs()), s.F("behavior", text()),
		s.F("delivery", text()), s.F("targeting", text()), s.F("limitations", text()), s.F("mechanicIds", refs()), s.F("evidence", refs()),
	)
	candidatePathsSchema = s.Array(s.StrictObject(
		s.F("id", text()), s.F("name", text()), s.F("theme", text()),
		s.F("tiers", s.Array(s.StrictObject(
			s.F("tier", s.Int().Positive()), s.F("name", text()), s.F("status", decisionStatus), s.F("decisionRefs", refs()),
			s.F("benefit", text()), s.F("abilityIds", refs()), s.F("evidence", refs()),
		)).Min(1)),
	))
	abilitiesSchema = s.Array(s.StrictObject(
		s.F("id", text()), s.F("name", text()), s.F("status", decisionStatus), s.F("decisionRefs", refs()),
		s.F("description", text()), s.F("availability", text()), s.F("delivery", text()), s.F("targeting", text()),
		s.F("limitations", text()),
		s.F("placement", s.Enum("innate", "upgrade", "conditional", "reserved", "omitted")),
		s.F("pathId", s.Nullable(text())),
		s.F("tier", s.Nullable(s.Int().Positive())),
		s.F("mechanicIds", refs()), s.F("prerequisiteAbilityIds", refs()), s.F("evidence", refs()),
	))
	candidateMechanicsSchema = s.Array(s.StrictObject(
		s.F("id", text()), s.F("name", text()), s.F("behavior", text()),
		s.F("status", s.Enum("specified", "unspecified", "proposed_extension", "unsupported")),
		s.F("dependencies", refs()), s.F("evidence", refs()), s.F("requiredDecision", s.Nullable(text())),
	))
	sourcesSchema = s.Array(s.StrictObject(
		s.F("documentId", text()), s.F("claims", s.Array(text()).Min(1)), s.F("limitations", text()),
	))
	constraintCoverageSchema   = s.Array(s.StrictObject(s.F("constraintId", text()), s.F("implementation", text())))
	representativeBuildsSchema = s.Array(s.StrictObject(
		s.F("name", text()),
		s.F("selections", s.Array(s.StrictObject(s.F("pathId", text()), s.F("tier", s.Int().Nonnegative())))),
		s.F("rationale", text()),
	))
	unresolvedQuestionsSchema = s.Array(s.StrictObject(
		s.F("id", text()), s.F("question", text()), s.F("affected", text()), s.F("evidence", refs()),
	))
	CandidateSchema = s.StrictObject(
		s.F("schemaVersion", version),
		s.F("character", CharacterSchema),
		s.F("role", text()),
		s.F("basicAttack", basicAttackSchema),
		s.F("paths", candidatePathsSchema),
		s.F("abilities", abilitiesSchema),
		s.F("mechanics", candidateMechanicsSchema),
		s.F("sources", sourcesSchema),
		s.F("constraintCoverage", constraintCoverageSchema),
		s.F("representativeBuilds", representativeBuildsSchema),
		s.F("unresolvedQuestions", unresolvedQuestionsSchema),
		s.F("blueprint", s.Optional(mechanics.BlueprintSchema)),
	)
	ProgressionSchema = s.StrictObject(
		s.F("paths", s.Array(s.StrictObject(
			s.F("id", text()),
			s.F("tiers", s.Array(s.Int().Positive()).Min(1)),
		)).Min(1)),
		s.F("maxActivePaths", s.Int().Nonnegative()),
		s.F("maxPathsAboveTier", s.Nullable(s.StrictObject(
			s.F("tier", s.Int().Nonnegative()),
			s.F("count", s.Int().Nonnegative()),
		))),
		s.F("maxTotalTiers", s.Nullable(s.Int().Nonnegative())),
		s.F("allowedTierCombinations", s.Nullable(s.Array(s.Array(s.Int().Nonnegative())).Min(1))),
	)
	RequestSchema = s.StrictObject(
		s.F("schemaVersion", version),
		s.F("task", text()),
		// Legacy: requests saved before the qualitative route was removed may carry these.
		s.F("deliverable", s.Optional(s.Literal("mechanics"))),
		s.F("operation", s.Optional(s.Enum("generate", "redesign", "prose-edit", "adapt"))),
		s.F("character", CharacterSchema),
		s.F("documents", s.Array(ResolvedDocumentSchema).Min(1)),
		s.F("constraints", s.Array(s.StrictObject(s.F("id", text()), s.F("text", text())))),
		s.F("progression", s.Nullable(ProgressionSchema)),
		s.F("mechanicsDefinition", s.Optional(mechanics.MechanicsDefinitionSchema)),
		s.F("previous", s.Nullable(s.StrictObject(
			s.F("resultId", text()),
			s.F("draft", CandidateSchema),
			s.F("findings", s.Array(FindingSchema)),
		))),
		s.F("feedback", s.Nullable(text())),
	)
	PreparedSchema = s.StrictObject(
		s.F("schemaVersion", version),
		s.F("kind", s.Literal("prepared")),
		s.F("inputHash", text()),
		s.F("request", RequestSchema),
	)
	tokenCount       = s.Nullable(s.Int().Nonnegative())
	ModelUsageSchema = s.StrictObject(
		s.F("inputTokens", tokenCount),
		s.F("outputTokens", tokenCount),
		s.F("totalTokens", tokenCount),
		s.F("reasoningTokens", tokenCount),
		s.F("cachedInputTokens", tokenCount),
		s.F("costUsd", s.Nullable(s.Number().Nonnegative())),
		s.F("actualModel", s.Nullable(s.String())),
		s.F("provider", s.Nullable(s.String())),
		s.F("generationId", s.Nullable(s.String())),
	)
	ModelRunSchema = s.StrictObject(
		s.F("id", text()),
		s.F("modelId", text()),
		s.F("startedAt", text()),
		s.F("completedAt", text()),
		s.F("usage", s.Optional(ModelUsageSchema)),
		s.F("designPlan", s.Optional(DesignPlanSchema)),
		s.F("designEvaluation", s.Optional(DesignEvaluationSchema)),
		s.F("attempts", s.Optional(s.Array(s.StrictObject(
			s.F("number", s.Int().Positive()),
			s.F("purpose", s.Enum("plan", "design", "repair")),
			s.F("issues", s.Array(text())),
			s.F("usage", s.Optional(ModelUsageSchema)),
		)))),
	)
	DraftSchema = s.StrictObject(
		s.F("schemaVersion", version),
		s.F("kind", s.Literal("draft")),
		s.F("prepared", PreparedSchema),
		s.F("candidate", CandidateSchema),
		s.F("run", ModelRunSchema),
	)
	CheckedSchema = s.StrictObject(
		s.F("schemaVersion", version),
		s.F("kind", s.Literal("checked")),
		s.F("draft", DraftSchema),
		s.F("findings", s.Array(FindingSchema)),
	)
	reviewFinding        = FindingSchema.Extend(s.F("id", text().Regex(`^model\.[a-zA-Z0-9][a-zA-Z0-9._-]*$`, "")), s.F("method", s.Literal("model")))
	SemanticReviewSchema = s.StrictObject(s.F("summary", text()), s.F("findings", s.Array(reviewFinding)))
	ResultSchema         = s.StrictObject(
		s.F("schemaVersion", version),
		s.F("kind", s.Literal("result")),
		s.F("id", text()),
		s.F("prepared", PreparedSchema),
		s.F("candidate", CandidateSchema),
		s.F("findings", s.Array(FindingSchema)),
		s.F("reviewSummary", text()),
		s.F("run", s.StrictObject(s.F("draft", ModelRunSchema), s.F("review", ModelRunSchema))),
	)
)

// ReviewFindingSchema is one model review finding.
func ReviewFindingSchema() *s.ObjectSchema { return reviewFinding }

var profileID = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,62}$`)

// UnitProfileSchema is a reusable generation configuration.
var UnitProfileSchema = s.StrictObject(
	s.F("schemaVersion", s.Literal("1")),
	s.F("kind", s.Literal("profile")),
	s.F("id", s.String().Regex(profileID.String(), "Use lowercase letters, digits and hyphens")),
	s.F("name", s.String().Trim().Min(1).Max(120)),
	s.F("task", s.String().Trim().Min(1)),
	s.F("rules", ResolvedDocumentSchema),
	s.F("mechanicsDefinition", mechanics.MechanicsDefinitionSchema),
).Refine(func(profile *s.Object) bool {
	rules, _ := profile.Get("rules")
	kind, _ := rules.(*s.Object).Get("kind")
	return kind == "rules"
}, "The Profile rules document must be rules")

// Version 2 artifacts carry a version 2 Definition, whose vocabulary names
// the status effects, damage types, targeting and detection their units use.
// The version 1 schemas above stay exactly as they were, so saved version 1
// artifacts read as before. An artifact's version is its request's.
var (
	version2 = s.Literal("2")

	// CandidateSchemaV2 accepts any well-formed vocabulary ID; mechanics
	// validation checks the IDs against the request's Definition.
	CandidateSchemaV2 = CandidateSchema.Extend(
		s.F("schemaVersion", version2),
		s.F("blueprint", s.Optional(mechanics.BlueprintSchemaV2(nil))),
	)
	// A version 2 revision may start from a version 1 unit.
	previousCandidate = s.Union(CandidateSchema, CandidateSchemaV2)

	RequestSchemaV2 = RequestSchema.Extend(
		s.F("schemaVersion", version2),
		s.F("mechanicsDefinition", mechanics.DefinitionV2Schema),
		s.F("previous", s.Nullable(s.StrictObject(
			s.F("resultId", text()),
			s.F("draft", previousCandidate),
			s.F("findings", s.Array(FindingSchema)),
		))),
	)
	PreparedSchemaV2 = PreparedSchema.Extend(s.F("schemaVersion", version2), s.F("request", RequestSchemaV2))

	// DesignPlanSchemaV2 accepts the vocabulary's status and detection IDs as
	// promises; plan checks hold them to the request's Definition.
	DesignPlanSchemaV2 = DesignPlanSchema.Extend(s.F("upgradeIntents", s.Optional(UpgradeIntentsSchemaFor(nil))))
	ModelRunSchemaV2   = ModelRunSchema.Extend(s.F("designPlan", s.Optional(DesignPlanSchemaV2)))

	DraftSchemaV2 = DraftSchema.Extend(
		s.F("schemaVersion", version2),
		s.F("prepared", PreparedSchemaV2),
		s.F("candidate", CandidateSchemaV2),
		s.F("run", ModelRunSchemaV2),
	)
	CheckedSchemaV2 = CheckedSchema.Extend(s.F("schemaVersion", version2), s.F("draft", DraftSchemaV2))
	ResultSchemaV2  = ResultSchema.Extend(
		s.F("schemaVersion", version2),
		s.F("prepared", PreparedSchemaV2),
		s.F("candidate", CandidateSchemaV2),
		s.F("run", s.StrictObject(s.F("draft", ModelRunSchemaV2), s.F("review", ModelRunSchema))),
	)
	UnitProfileSchemaV2 = UnitProfileSchema.Extend(
		s.F("schemaVersion", version2),
		s.F("mechanicsDefinition", mechanics.DefinitionV2Schema),
	).Refine(func(profile *s.Object) bool {
		rules, _ := profile.Get("rules")
		kind, _ := rules.(*s.Object).Get("kind")
		return kind == "rules"
	}, "The Profile rules document must be rules")
)

// Versioned picks the version 2 schema for a value whose schemaVersion is
// "2" and the version 1 schema otherwise.
func Versioned(value any, v1, v2 s.Schema) s.Schema {
	if o, ok := value.(*s.Object); ok {
		if version, _ := o.Get("schemaVersion"); version == "2" {
			return v2
		}
	}
	return v1
}

// VersionOf is the schema version of a request under a Definition.
func VersionOf(definition *mechanics.Definition) string {
	if definition != nil && definition.IsV2() {
		return "2"
	}
	return "1"
}
