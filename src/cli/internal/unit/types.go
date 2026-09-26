package unit

import (
	"github.com/mardwerk/unit-generator/src/cli/internal/mechanics"
	s "github.com/mardwerk/unit-generator/src/cli/internal/schema"
)

// Character identifies the character a unit adapts.
type Character struct {
	Name  string `json:"name"`
	Work  string `json:"work"`
	Scope string `json:"scope"`
}

// VisualReference is an image found for a character.
type VisualReference struct {
	ID          string  `json:"id"`
	URL         string  `json:"url"`
	SourceURL   string  `json:"sourceUrl"`
	Caption     string  `json:"caption"`
	Kind        string  `json:"kind"`
	Attribution *string `json:"attribution"`
	Width       *int    `json:"width,omitempty"`
	Height      *int    `json:"height,omitempty"`
}

// Origin records where a document came from.
type Origin struct {
	Location string  `json:"location"`
	Access   string  `json:"access"`
	Note     *string `json:"note"`
}

// Document is a resolved source, rules or decisions document.
type Document struct {
	ID               string             `json:"id"`
	Kind             string             `json:"kind"`
	Text             string             `json:"text"`
	Origin           Origin             `json:"origin"`
	VisualReferences *[]VisualReference `json:"visualReferences,omitempty"`
	VisualNotes      *[]string          `json:"visualNotes,omitempty"`
}

// Constraint is a confirmed decision the unit must preserve.
type Constraint struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// ProgressionPath is a declared path and its tiers.
type ProgressionPath struct {
	ID    string `json:"id"`
	Tiers []int  `json:"tiers"`
}

// Threshold limits how many paths may exceed a tier.
type Threshold struct {
	Tier  int `json:"tier"`
	Count int `json:"count"`
}

// Progression is the request's path and crosspath layout.
type Progression struct {
	Paths                   []ProgressionPath `json:"paths"`
	MaxActivePaths          int               `json:"maxActivePaths"`
	MaxPathsAboveTier       *Threshold        `json:"maxPathsAboveTier"`
	MaxTotalTiers           *int              `json:"maxTotalTiers"`
	AllowedTierCombinations *[][]int          `json:"allowedTierCombinations"`
}

// Previous is the earlier version a revision starts from.
type Previous struct {
	ResultID string    `json:"resultId"`
	Draft    Candidate `json:"draft"`
	Findings []Finding `json:"findings"`
}

// Request is one explicit, resolved generation request.
type Request struct {
	SchemaVersion       string                `json:"schemaVersion"`
	Task                string                `json:"task"`
	Deliverable         string                `json:"deliverable,omitempty"`
	Operation           string                `json:"operation,omitempty"`
	Character           Character             `json:"character"`
	Documents           []Document            `json:"documents"`
	Constraints         []Constraint          `json:"constraints"`
	Progression         *Progression          `json:"progression"`
	MechanicsDefinition *mechanics.Definition `json:"mechanicsDefinition,omitempty"`
	Previous            *Previous             `json:"previous"`
	Feedback            *string               `json:"feedback"`
}

// Finding is one check or review result.
type Finding struct {
	ID       string   `json:"id"`
	Method   string   `json:"method"`
	Category string   `json:"category"`
	Severity string   `json:"severity"`
	Outcome  string   `json:"outcome"`
	Subject  string   `json:"subject"`
	Rule     string   `json:"rule"`
	Message  string   `json:"message"`
	Evidence []string `json:"evidence"`
	Action   *string  `json:"action"`
}

// BasicAttack is the candidate's readable basic attack.
type BasicAttack struct {
	Name         string   `json:"name"`
	Status       string   `json:"status"`
	DecisionRefs []string `json:"decisionRefs"`
	Behavior     string   `json:"behavior"`
	Delivery     string   `json:"delivery"`
	Targeting    string   `json:"targeting"`
	Limitations  string   `json:"limitations"`
	MechanicIDs  []string `json:"mechanicIds"`
	Evidence     []string `json:"evidence"`
}

// CandidateTier is one readable upgrade.
type CandidateTier struct {
	Tier         int      `json:"tier"`
	Name         string   `json:"name"`
	Status       string   `json:"status"`
	DecisionRefs []string `json:"decisionRefs"`
	Benefit      string   `json:"benefit"`
	AbilityIDs   []string `json:"abilityIds"`
	Evidence     []string `json:"evidence"`
}

// CandidatePath is one readable path.
type CandidatePath struct {
	ID    string          `json:"id"`
	Name  string          `json:"name"`
	Theme string          `json:"theme"`
	Tiers []CandidateTier `json:"tiers"`
}

// Ability is a readable innate, upgrade, conditional or reserved ability.
type Ability struct {
	ID                     string   `json:"id"`
	Name                   string   `json:"name"`
	Status                 string   `json:"status"`
	DecisionRefs           []string `json:"decisionRefs"`
	Description            string   `json:"description"`
	Availability           string   `json:"availability"`
	Delivery               string   `json:"delivery"`
	Targeting              string   `json:"targeting"`
	Limitations            string   `json:"limitations"`
	Placement              string   `json:"placement"`
	PathID                 *string  `json:"pathId"`
	Tier                   *int     `json:"tier"`
	MechanicIDs            []string `json:"mechanicIds"`
	PrerequisiteAbilityIDs []string `json:"prerequisiteAbilityIds"`
	Evidence               []string `json:"evidence"`
}

// Mechanic is a readable mechanic requirement.
type Mechanic struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	Behavior         string   `json:"behavior"`
	Status           string   `json:"status"`
	Dependencies     []string `json:"dependencies"`
	Evidence         []string `json:"evidence"`
	RequiredDecision *string  `json:"requiredDecision"`
}

// Source summarizes what a document supports.
type Source struct {
	DocumentID  string   `json:"documentId"`
	Claims      []string `json:"claims"`
	Limitations string   `json:"limitations"`
}

// BuildSelection names one path's purchased tier in a representative build.
type BuildSelection struct {
	PathID string `json:"pathId"`
	Tier   int    `json:"tier"`
}

// RepresentativeBuild is an example build.
type RepresentativeBuild struct {
	Name       string           `json:"name"`
	Selections []BuildSelection `json:"selections"`
	Rationale  string           `json:"rationale"`
}

// Question is an unresolved design question.
type Question struct {
	ID       string   `json:"id"`
	Question string   `json:"question"`
	Affected string   `json:"affected"`
	Evidence []string `json:"evidence"`
}

// Candidate is the readable unit, with its blueprint when mechanics are typed.
type Candidate struct {
	SchemaVersion        string                `json:"schemaVersion"`
	Character            Character             `json:"character"`
	Role                 string                `json:"role"`
	BasicAttack          BasicAttack           `json:"basicAttack"`
	Paths                []CandidatePath       `json:"paths"`
	Abilities            []Ability             `json:"abilities"`
	Mechanics            []Mechanic            `json:"mechanics"`
	Sources              []Source              `json:"sources"`
	ConstraintCoverage   []mechanics.Coverage  `json:"constraintCoverage"`
	RepresentativeBuilds []RepresentativeBuild `json:"representativeBuilds"`
	UnresolvedQuestions  []Question            `json:"unresolvedQuestions"`
	Blueprint            *mechanics.Blueprint  `json:"blueprint,omitempty"`
}

// Prepared is a validated request with its input hash.
type Prepared struct {
	SchemaVersion string  `json:"schemaVersion"`
	Kind          string  `json:"kind"`
	InputHash     string  `json:"inputHash"`
	Request       Request `json:"request"`
}

// Usage is what a provider reported for one call.
type Usage struct {
	InputTokens       *float64 `json:"inputTokens"`
	OutputTokens      *float64 `json:"outputTokens"`
	TotalTokens       *float64 `json:"totalTokens"`
	ReasoningTokens   *float64 `json:"reasoningTokens"`
	CachedInputTokens *float64 `json:"cachedInputTokens"`
	CostUSD           *float64 `json:"costUsd"`
	ActualModel       *string  `json:"actualModel"`
	Provider          *string  `json:"provider"`
	GenerationID      *string  `json:"generationId"`
}

// Attempt is one billed model call of a draft.
type Attempt struct {
	Number  int      `json:"number"`
	Purpose string   `json:"purpose"`
	Issues  []string `json:"issues"`
	Usage   *Usage   `json:"usage,omitempty"`
}

// Run records one model stage.
type Run struct {
	ID               string      `json:"id"`
	ModelID          string      `json:"modelId"`
	StartedAt        string      `json:"startedAt"`
	CompletedAt      string      `json:"completedAt"`
	Usage            *Usage      `json:"usage,omitempty"`
	DesignPlan       *DesignPlan `json:"designPlan,omitempty"`
	DesignEvaluation *s.Object   `json:"designEvaluation,omitempty"`
	Attempts         *[]Attempt  `json:"attempts,omitempty"`
}

// Draft is a candidate authored by a model for a prepared request.
type Draft struct {
	SchemaVersion string    `json:"schemaVersion"`
	Kind          string    `json:"kind"`
	Prepared      Prepared  `json:"prepared"`
	Candidate     Candidate `json:"candidate"`
	Run           Run       `json:"run"`
}

// Checked is a draft with its deterministic findings.
type Checked struct {
	SchemaVersion string    `json:"schemaVersion"`
	Kind          string    `json:"kind"`
	Draft         Draft     `json:"draft"`
	Findings      []Finding `json:"findings"`
}

// ResultRuns are the draft and review runs of a Result.
type ResultRuns struct {
	Draft  Run `json:"draft"`
	Review Run `json:"review"`
}

// Result is a checked and reviewed unit.
type Result struct {
	SchemaVersion string     `json:"schemaVersion"`
	Kind          string     `json:"kind"`
	ID            string     `json:"id"`
	Prepared      Prepared   `json:"prepared"`
	Candidate     Candidate  `json:"candidate"`
	Findings      []Finding  `json:"findings"`
	ReviewSummary string     `json:"reviewSummary"`
	Run           ResultRuns `json:"run"`
}

// SemanticReview is a model's review output.
type SemanticReview struct {
	Summary  string    `json:"summary"`
	Findings []Finding `json:"findings"`
}

// Profile is a reusable generation configuration.
type Profile struct {
	SchemaVersion       string               `json:"schemaVersion"`
	Kind                string               `json:"kind"`
	ID                  string               `json:"id"`
	Name                string               `json:"name"`
	Task                string               `json:"task"`
	Rules               Document             `json:"rules"`
	MechanicsDefinition mechanics.Definition `json:"mechanicsDefinition"`
}

// DesignPlan is the retained character and purchasing plan.
type DesignPlan struct {
	Contract          string           `json:"contract,omitempty"`
	Concept           string           `json:"concept"`
	Signature         PlanSignature    `json:"signature"`
	Repertoire        []PlanRepertoire `json:"repertoire"`
	Base              PlanBase         `json:"base"`
	Paths             PlanPaths        `json:"paths"`
	OmittedTechniques []PlanOmission   `json:"omittedTechniques"`
	ScopeLimits       []string         `json:"scopeLimits"`
	UpgradeIntents    *UpgradeIntents  `json:"upgradeIntents,omitempty"`
}

// PlanSignature is the character's signature technique.
type PlanSignature struct {
	Name       string   `json:"name"`
	SourceIDs  []string `json:"sourceIds"`
	Adaptation string   `json:"adaptation"`
}

// PlanRepertoire is one planned technique.
type PlanRepertoire struct {
	Name       string   `json:"name"`
	SourceIDs  []string `json:"sourceIds"`
	Limitation string   `json:"limitation"`
}

// PlanBase is the planned base attack.
type PlanBase struct {
	Name      string   `json:"name"`
	SourceIDs []string `json:"sourceIds"`
	Behavior  string   `json:"behavior"`
}

// PlanCrosspath is a planned crosspath contribution.
type PlanCrosspath struct {
	Path         string `json:"path"`
	Contribution string `json:"contribution"`
}

// PlanMilestones are the five planned purchases of a branch.
type PlanMilestones struct {
	Tier1 string `json:"tier1"`
	Tier2 string `json:"tier2"`
	Tier3 string `json:"tier3"`
	Tier4 string `json:"tier4"`
	Tier5 string `json:"tier5"`
}

// At returns milestone n (1–5).
func (m PlanMilestones) At(n int) string {
	return [...]string{m.Tier1, m.Tier2, m.Tier3, m.Tier4, m.Tier5}[n-1]
}

// PlanBranch is one planned path.
type PlanBranch struct {
	Name             string          `json:"name"`
	SourceIDs        []string        `json:"sourceIds"`
	BuyFor           string          `json:"buyFor"`
	Weakness         string          `json:"weakness"`
	Milestones       PlanMilestones  `json:"milestones"`
	CapstoneValue    string          `json:"capstoneValue"`
	Crosspaths       []PlanCrosspath `json:"crosspaths"`
	ReferenceExample string          `json:"referenceExample"`
}

// PlanPaths are the three planned branches.
type PlanPaths struct {
	Path1 PlanBranch `json:"path1"`
	Path2 PlanBranch `json:"path2"`
	Path3 PlanBranch `json:"path3"`
}

// At returns branch i (0–2).
func (p *PlanPaths) At(i int) *PlanBranch { return [...]*PlanBranch{&p.Path1, &p.Path2, &p.Path3}[i] }

// PlanOmission is a technique deliberately left out.
type PlanOmission struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}

// UpgradeIntent is a typed promise for one milestone.
type UpgradeIntent struct {
	Improves []string `json:"improves"`
	Unlock   string   `json:"unlock"`
}

// PathIntents are the five promises of a path.
type PathIntents struct {
	Tier1 UpgradeIntent `json:"tier1"`
	Tier2 UpgradeIntent `json:"tier2"`
	Tier3 UpgradeIntent `json:"tier3"`
	Tier4 UpgradeIntent `json:"tier4"`
	Tier5 UpgradeIntent `json:"tier5"`
}

// At returns intent n (1–5).
func (p *PathIntents) At(n int) *UpgradeIntent {
	return [...]*UpgradeIntent{&p.Tier1, &p.Tier2, &p.Tier3, &p.Tier4, &p.Tier5}[n-1]
}

// UpgradeIntents are the promises of all paths.
type UpgradeIntents struct {
	Path1 PathIntents `json:"path1"`
	Path2 PathIntents `json:"path2"`
	Path3 PathIntents `json:"path3"`
}

// At returns path i (0–2).
func (u *UpgradeIntents) At(i int) *PathIntents {
	return [...]*PathIntents{&u.Path1, &u.Path2, &u.Path3}[i]
}
