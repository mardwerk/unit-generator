/**
 * JSON shapes of the /api/v1 contract. The Go server validates every
 * artifact; the client only reads these fields, so deep Engine structures
 * such as the typed blueprint stay opaque here.
 */

export type Status = 'confirmed' | 'proposed' | 'unspecified' | 'unsupported';

export interface Character {
  name: string;
  work: string;
  scope: string;
}

export interface VisualReference {
  id: string;
  url: string;
  sourceUrl: string;
  caption: string;
  kind: 'appearance' | 'form' | 'pose' | 'reference';
  attribution: string | null;
  width?: number;
  height?: number;
}

export interface ResolvedDocument {
  id: string;
  kind: 'source' | 'rules' | 'decisions';
  text: string;
  origin: {
    location: string;
    access: 'supplied' | 'local-file' | 'retrieved';
    note: string | null;
  };
  visualReferences?: VisualReference[];
  visualNotes?: string[];
}

export interface Progression {
  paths: { id: string; tiers: number[] }[];
  maxActivePaths: number;
  maxPathsAboveTier: { tier: number; count: number } | null;
  maxTotalTiers: number | null;
  allowedTierCombinations: number[][] | null;
}

export interface ReferenceScale {
  healthResource: string;
  startingHealth: number;
  ordinaryEnemyHealth: number;
  baseCost: number;
  baseDamage: number;
  baseIntervalSeconds: number;
  baseRange: number;
  basePierce: number;
  incrementalUpgradeCosts: number[];
}

/** Contract version 2 artifacts carry a Definition with a vocabulary. */
export type SchemaVersion = '1' | '2';

/** A named ID of a version 2 vocabulary. */
export interface Term {
  id: string;
  name: string;
  description: string;
}

export interface DamageType extends Term {
  /** Enemy properties this damage type cannot damage. */
  ineffectiveAgainst: string[];
}

export type EffectKind = 'moveSpeed' | 'damageOverTime' | 'disable' | 'damageTaken' | 'custom';

/** A Profile-defined status effect: its bounds, duration limit, stacking and immunities. */
export interface StatusEffect {
  id: string;
  name: string;
  aliases: string[];
  kind: EffectKind;
  description: string;
  magnitude: { unit: string; min: number; max: number } | null;
  maxSeconds: number;
  stacking: {
    maxStacks: number;
    refresh: 'reset' | 'extend' | 'independent';
    /** Cap on the combined magnitude of all stacks. */
    maxMagnitude: number | null;
  };
  immune: string[];
}

export interface Vocabulary {
  enemyProperties: Term[];
  damageTypes: DamageType[];
  targeting: Term[];
  detection: Term[];
  statusEffects: StatusEffect[];
}

/** The numerical rules a unit is generated under. Only display fields are typed. */
export interface MechanicsDefinition {
  version: '1' | '2';
  id: string;
  revision: string;
  label: string;
  balanceStatus: string;
  progression: unknown;
  rules: unknown;
  /** Version 2 only. */
  vocabulary?: Vocabulary;
  profile: {
    currency: string;
    designPolicy?: { manualAbilityPath?: string | null } & Record<string, unknown>;
    referenceScale?: ReferenceScale;
    maxStatValue: number;
    maxChangesPerTier: number;
    earlyTierMaxChanges: number;
  } & Record<string, unknown>;
}

export interface Finding {
  id: string;
  method: 'deterministic' | 'model';
  category: string;
  severity: 'info' | 'warning' | 'error';
  outcome: 'pass' | 'fail' | 'unresolved' | 'not_checked';
  subject: string;
  rule: string;
  message: string;
  evidence: string[];
  action: string | null;
}

export interface CandidateTier {
  tier: number;
  name: string;
  status: Status;
  decisionRefs: string[];
  benefit: string;
  abilityIds: string[];
  evidence: string[];
}

export interface Ability {
  id: string;
  name: string;
  status: Status;
  decisionRefs: string[];
  description: string;
  availability: string;
  delivery: string;
  targeting: string;
  limitations: string;
  placement: 'innate' | 'upgrade' | 'conditional' | 'reserved' | 'omitted';
  pathId: string | null;
  tier: number | null;
  mechanicIds: string[];
  prerequisiteAbilityIds: string[];
  evidence: string[];
}

export interface Mechanic {
  id: string;
  name: string;
  behavior: string;
  status: 'specified' | 'unspecified' | 'proposed_extension' | 'unsupported';
  dependencies: string[];
  evidence: string[];
  requiredDecision: string | null;
}

export interface UnitCandidate {
  schemaVersion: string;
  character: Character;
  role: string;
  basicAttack: {
    name: string;
    status: Status;
    decisionRefs: string[];
    behavior: string;
    delivery: string;
    targeting: string;
    limitations: string;
    mechanicIds: string[];
    evidence: string[];
  };
  paths: { id: string; name: string; theme: string; tiers: CandidateTier[] }[];
  abilities: Ability[];
  mechanics: Mechanic[];
  sources: { documentId: string; claims: string[]; limitations: string }[];
  constraintCoverage: unknown[];
  representativeBuilds: {
    name: string;
    selections: { pathId: string; tier: number }[];
    rationale: string;
  }[];
  unresolvedQuestions: { id: string; question: string; affected: string; evidence: string[] }[];
  /** The typed mechanics; read through /api/v1/view, never interpreted here. */
  blueprint?: unknown;
}

export interface AuthorRequest {
  schemaVersion: SchemaVersion;
  task: string;
  deliverable?: string;
  operation?: string;
  character: Character;
  documents: ResolvedDocument[];
  constraints: { id: string; text: string }[];
  progression: Progression | null;
  mechanicsDefinition?: MechanicsDefinition;
  previous: { resultId: string; draft: UnitCandidate; findings: Finding[] } | null;
  feedback: string | null;
}

export interface PreparedRequest {
  schemaVersion: SchemaVersion;
  kind: 'prepared';
  inputHash: string;
  request: AuthorRequest;
}

export interface ModelUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
  costUsd: number | null;
  actualModel: string | null;
  provider: string | null;
  generationId: string | null;
}

export interface ModelFailure {
  code: string;
  message: string;
  provider?: string;
  httpStatus?: number;
  providerCode?: number;
  timeoutMs?: number;
  retryAfterSeconds?: number;
  stage?: 'draft' | 'review';
}

export interface ModelRun {
  id: string;
  modelId: string;
  startedAt: string;
  completedAt: string;
  usage?: ModelUsage;
  designPlan?: unknown;
  designEvaluation?: unknown;
  attempts?: { number: number; purpose: string; issues: string[]; usage?: ModelUsage }[];
}

export interface DraftArtifact {
  schemaVersion: SchemaVersion;
  kind: 'draft';
  prepared: PreparedRequest;
  candidate: UnitCandidate;
  run: ModelRun;
}

export interface CheckedArtifact {
  schemaVersion: SchemaVersion;
  kind: 'checked';
  draft: DraftArtifact;
  findings: Finding[];
}

export interface AuthorResult {
  schemaVersion: SchemaVersion;
  kind: 'result';
  id: string;
  prepared: PreparedRequest;
  candidate: UnitCandidate;
  findings: Finding[];
  reviewSummary: string;
  run: { draft: ModelRun; review: ModelRun };
}

export interface UnitProfile {
  schemaVersion: SchemaVersion;
  kind: 'profile';
  id: string;
  name: string;
  task: string;
  rules: ResolvedDocument;
  mechanicsDefinition: MechanicsDefinition;
}

/** An explicit document input before the server resolves it. */
export interface DocumentSpec {
  id: string;
  kind: 'source' | 'rules' | 'decisions';
  text?: string;
  file?: string;
  url?: string;
  sourceUrl?: string;
}

export type LabDocument = ResolvedDocument | DocumentSpec;

/** Editable inputs may be incomplete. Prepare validates their executable form. */
export type LabRequest = Omit<AuthorRequest, 'documents' | 'constraints' | 'progression'> & {
  documents: LabDocument[];
  constraints: unknown;
  progression: unknown;
  previousResultFile?: string;
};
export type LabArtifact = PreparedRequest | DraftArtifact | CheckedArtifact | AuthorResult;

/** Researched character sources, reusable under any Profile. */
export interface Sources {
  schemaVersion: '1';
  kind: 'sources';
  query: string;
  retrievedAt: string;
  character: Character;
  documents: ResolvedDocument[];
}
export type LabStage = 'prepare' | 'draft' | 'check' | 'review';

/** Local library metadata. Provider settings never belong in a saved artifact. */
export interface LibraryEntry {
  id: string;
  savedAt: string;
  kind: LabArtifact['kind'] | 'sources';
  character: Character;
  artifactId: string;
  portrait?: { url: string; caption: string; sourceUrl?: string };
}

export interface LibraryState {
  directory: string;
  entries: LibraryEntry[];
}

/** Bundled Profiles are read-only; saved Profiles live in the Profiles folder. */
export interface ProfileEntry {
  profile: UnitProfile;
  builtIn: boolean;
  /** The paths and tiers the Profile's Definition allows. */
  progression: Progression;
}

export interface ProfilesState {
  directory: string;
  profiles: ProfileEntry[];
}

export interface LibraryIcon {
  key: string;
  label: string;
  kind: 'portrait' | 'attack' | 'upgrade' | 'ability';
  description: string;
  path: string;
  dataUrl?: string;
  note?: string;
  /** Works in any image generator. */
  imagePrompt: string;
  /** Also tells a local Codex session to save the PNG at `path`. */
  codexPrompt: string;
}

export interface LibraryIconsResponse {
  directory: string;
  icons: LibraryIcon[];
  portrait?: VisualReference;
}

export type InspectedInput =
  | { kind: 'request'; artifact: LabRequest }
  | { kind: 'prepared'; artifact: PreparedRequest }
  | { kind: 'draft'; artifact: DraftArtifact }
  | { kind: 'checked'; artifact: CheckedArtifact }
  | { kind: 'result'; artifact: AuthorResult };

export interface LabError {
  error: { code: string; message: string; usage?: ModelUsage; details?: ModelFailure };
}

export interface KeyState {
  /** Present means a key is set, not that OpenRouter accepted it. Never the key itself. */
  configured: boolean;
  source: 'env' | 'env-file' | 'settings' | 'none';
  /** A masked fragment of a long key, such as sk-or-v1-abc...xyz. */
  hint: string | null;
}

export interface ProviderState {
  provider: 'openrouter' | 'codex';
  model: string;
  ready: boolean;
  images: { model: string; ready: boolean };
  key: KeyState;
  message: string;
}

export interface IconGenerationResponse {
  icons: LibraryIconsResponse;
  model: string;
  usage?: ModelUsage;
}

/**
 * One visible difference a purchase makes, from /api/v1/view. Version 2
 * status effects and detection traits come with their vocabulary label, the
 * unit of the number and the effect kind ('detection' for a trait).
 */
export interface StatChange {
  key: string;
  label?: string;
  unit?: string;
  kind?: EffectKind | 'detection';
  before?: number | string;
  after: number | string;
  improvement?: boolean;
}

export interface KitStats {
  /** The resolved base attack. */
  base: { name: string; cost: number; stats: Record<string, number> } & Record<string, unknown>;
  /** The version 2 base attack's status effects and detection traits. */
  baseEffects?: StatChange[];
  /** Keyed "path-N:T". */
  tiers: Record<string, { cost: number; changes: StatChange[] }>;
}

export interface UnitView {
  view: { kind: LabArtifact['kind']; designEvaluation?: unknown };
  stats?: KitStats;
}

export const tierStatKey = (pathId: string, tier: number) => `${pathId}:${tier}`;
