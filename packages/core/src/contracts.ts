export type JsonSchema = Record<string, unknown>;
export interface Issue {
  code: string;
  path: string;
  message: string;
}
export type CheckStatus = 'passed' | 'failed' | 'not-provided' | 'not-completed';
export interface CheckReport {
  status: CheckStatus;
  checks: string[];
  issues: Issue[];
}
export interface ValidationReport {
  structure: CheckReport;
  system: CheckReport;
  constraints: CheckReport;
  uncheckedRules: string[];
  balance: { status: 'not-tested' };
}
export interface Source {
  id: string;
  url?: string;
  title: string;
  content: string;
  origin: 'supplied' | 'retrieved';
  status: 'read' | 'failed';
  truncated: boolean;
  omissions: string[];
  error?: string;
}
export interface Knowledge {
  subject: string;
  identity: {
    status: 'resolved' | 'ambiguous' | 'unresolved';
    name: string;
    continuity: string;
    explanation: string;
  };
  claims: {
    text: string;
    sourceIds: string[];
    kind: 'evidence' | 'unverified' | 'original-concept';
  }[];
  gaps: string[];
}
export interface SourceVisibility {
  sourceId: string;
  sha256: string;
  sourceCharacters: number;
  visibleCharacters: number;
  complete: boolean;
}
export interface ResearchInput {
  subject: string;
  continuity?: string;
  kind?: 'character' | 'original';
  guidance?: string;
  knowledge?: ResearchResult;
  sources?: (Source | string)[];
}
export interface ResearchResult {
  schemaVersion: '0.2';
  status: 'success' | 'failed' | 'cancelled';
  subject: string;
  sources: Source[];
  sourceVisibility?: SourceVisibility[];
  knowledge?: Knowledge;
  reused: boolean;
  grounding: 'grounded' | 'ungrounded' | 'original-concept';
  gaps: string[];
  error?: Failure;
  metadata?: Metadata;
}
export interface Failure {
  stage: string;
  code: string;
  message: string;
}
export interface DiscoveryCandidate {
  url: string;
  title: string;
  description: string;
}
export interface ResearchPolicy {
  network: 'deny' | 'allow';
  discovery: boolean;
  followLinks: boolean;
  allowUngrounded: boolean;
}
export interface Limits {
  maxModelCalls: number;
  maxResearchCalls: number;
  maxRepairs: number;
  timeoutMs: number;
  callTimeoutMs: number;
  maxInputBytes: number;
  maxOutputBytes: number;
  maxResultBytes: number;
  maxOutputTokens: number;
  maxSources: number;
  maxSourceBytes: number;
}
export interface ModelCall {
  stage: string;
  instructions: string;
  input: unknown;
  schema: JsonSchema;
  requireStructured?: boolean;
  maxOutputTokens?: number;
}
export interface ModelReply {
  value: unknown;
  mode: 'structured' | 'json' | 'fixture';
  model?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}
export interface ModelAdapter {
  generate(
    call: ModelCall & { signal: AbortSignal; maxOutputTokens: number; maxOutputBytes: number }
  ): Promise<ModelReply>;
}
export interface SourceAdapter {
  discover(
    subject: string,
    options: { signal: AbortSignal; limit: number }
  ): Promise<DiscoveryCandidate[]>;
  acquire(
    urls: string[],
    options: {
      subject: string;
      signal: AbortSignal;
      maxSources: number;
      maxSourceBytes: number;
      followLinks: boolean;
      onSource: (source: Source) => void;
    }
  ): Promise<void>;
}
export type ProgressEvent =
  | { type: 'progress'; stage: string; message: string }
  | { type: 'research'; result: ResearchResult };
export interface FidelityAttempt {
  review: unknown;
  reportValid: boolean;
  error?: { code: string; message: string };
}
export interface FidelityReport {
  status: 'checked' | 'insufficient-evidence' | 'original-concept';
  claims: {
    path: string;
    candidateQuote: string;
    sourceMechanic: string;
    relationship:
      'same-ability' | 'numerical-tuning' | 'delivery-abstraction' | 'game-rule' | 'unsupported';
    claim: string;
    status: 'supported' | 'adapted' | 'contradicted' | 'unresolved';
    sourceId: string;
    quote: string;
    passageId?: string;
    sourceSha256?: string;
    sourceRange?: { start: number; end: number };
    explanation: string;
  }[];
  gaps: string[];
}
export interface QualificationReport {
  schemaVersion: 'unit-qualification/0.1';
  definitionId: string;
  readiness: 'blocked' | 'review-required';
  findings: {
    code: string;
    dimension:
      | 'validity'
      | 'purchase-usefulness'
      | 'claim-effect'
      | 'source-fidelity'
      | 'coverage'
      | 'balance';
    severity: 'blocker' | 'warning' | 'info';
    message: string;
    location?: string;
    evidence?: Record<string, unknown>;
  }[];
  coverage: {
    legalBuilds: number;
    evaluatedBuilds: number;
    purchaseEdges: number;
    probes: number;
    unassessed: string[];
  };
}
export interface Execution {
  model?: ModelAdapter;
  sources?: SourceAdapter;
  policy?: Partial<ResearchPolicy>;
  limits?: Partial<Limits>;
  signal?: AbortSignal;
  onProgress?: (event: ProgressEvent) => void;
  reviewFidelity?: boolean;
  /** Called after deterministic validation with frozen, isolated candidate and evidence snapshots. */
  evaluate?: (context: {
    definitionId: string;
    candidate: unknown;
    research: ResearchResult[];
    signal: AbortSignal;
  }) => QualificationReport | Promise<QualificationReport>;
}
export interface Context {
  readonly signal: AbortSignal;
  readonly policy: Readonly<ResearchPolicy>;
  model(call: ModelCall): Promise<unknown>;
  research(input: ResearchInput): Promise<ResearchResult>;
  progress(stage: string, message: string): void;
}
export interface Definition {
  id: string;
  version: string;
  contractVersion: '0.2';
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  rules: string;
  instructions: string;
  examples?: unknown[];
  configuration?: Record<string, unknown>;
  fileDigest?: string;
  implementationVersion?: string;
  validation: {
    kind: 'schema-only' | 'trusted';
    checks: string[];
    uncheckedRules: string[];
    validate?: (
      candidate: unknown,
      input: unknown,
      signal: AbortSignal
    ) => Issue[] | Promise<Issue[]>;
    constraints?: (candidate: unknown, input: unknown) => Issue[];
  };
  preflight?: (input: unknown) => Issue[];
  run?: (input: unknown, context: Context) => Promise<{ candidate: unknown; design?: unknown }>;
  repair?: (
    candidate: unknown,
    issues: Issue[],
    input: unknown,
    context: Context,
    design?: unknown
  ) => Promise<unknown>;
  /** Shipped default is one repair. A custom workflow can make any bounded sequence of calls. */
  repairAttempts?: number;
}
export interface Metadata {
  modelCalls: number;
  repairs: number;
  /** One execution-wide retry for a malformed draft or repair response, when needed. */
  formatRetries?: number;
  elapsedMs: number;
  calls: {
    stage: string;
    mode?: ModelReply['mode'];
    model?: string;
    usage?: ModelReply['usage'];
    completed: boolean;
    errorCode?: string;
    outputSha256?: string;
    evidence?: { knowledgeSha256: string; sources: SourceVisibility[] }[];
  }[];
}
export interface RunResult {
  schemaVersion: '0.2';
  status: 'success' | 'failed' | 'cancelled';
  definition: {
    id: string;
    version: string;
    inputSchemaId?: string;
    outputSchemaId?: string;
    fileDigest?: string;
    implementationVersion?: string;
    configuration?: Record<string, unknown>;
  };
  input?: unknown;
  output?: unknown;
  candidate?: unknown;
  design?: unknown;
  research: ResearchResult[];
  validation: ValidationReport;
  qualification?: QualificationReport;
  fidelity?: FidelityReport;
  fidelityAttempts?: FidelityAttempt[];
  metadata: Metadata;
  error?: Failure;
}
