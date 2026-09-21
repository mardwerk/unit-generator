import type {
  AuthorResult,
  CheckedArtifact,
  DraftArtifact,
  PreparedRequest,
} from '../core/index.js';

type UsageArtifact = AuthorResult | CheckedArtifact | DraftArtifact | PreparedRequest;
type Run = DraftArtifact['run'];

export interface StageUsage {
  stage: 'Draft' | 'Review' | 'Role ranking';
  run: Pick<Run, 'modelId' | 'usage'> | null;
  status?: 'completed' | 'unavailable';
}

export interface UsageTotal {
  value: number | null;
  partial: boolean;
}

export interface UsageSummary {
  stages: StageUsage[];
  cost: UsageTotal;
  tokens: UsageTotal;
  roleCostEstimate: number | null;
}

/** Only this revision contributes. Estimates stay separate from reported charges. */
export function summarizeUsage(artifact: UsageArtifact): UsageSummary {
  const draft =
    artifact.kind === 'prepared'
      ? null
      : artifact.kind === 'checked'
        ? artifact.draft.run
        : artifact.kind === 'result'
          ? artifact.run.draft
          : artifact.run;
  const review = artifact.kind === 'result' ? artifact.run.review : null;
  const stages: StageUsage[] = [
    { stage: 'Draft', run: draft },
    { stage: 'Review', run: review },
  ];
  const roles =
    artifact.kind === 'prepared'
      ? undefined
      : artifact.kind === 'checked'
        ? artifact.draft.roles
        : artifact.roles;
  if (roles && roles.status !== 'skipped')
    stages.push({
      stage: 'Role ranking',
      status: roles.status,
      run: {
        modelId: roles.provider ?? 'unavailable',
        ...(roles.usage ? { usage: roles.usage } : {}),
      },
    });
  const completed = stages.filter(({ run }) => run !== null);
  return {
    stages,
    cost: total(completed.map(({ run }) => run?.usage?.costUsd ?? null)),
    tokens: total(completed.map(({ run }) => run?.usage?.totalTokens ?? null)),
    roleCostEstimate: roles?.estimatedCostUsd ?? null,
  };
}

function total(values: (number | null)[]): UsageTotal {
  const reported = values.filter((value): value is number => value !== null);
  return {
    value: reported.length ? reported.reduce((sum, value) => sum + value, 0) : null,
    partial: reported.length < values.length,
  };
}

export function formatCost(value: number | null): string {
  if (value === null) return 'Unavailable';
  if (value > 0 && value < 0.00000001) return `$${value.toExponential(3)} USD`;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} USD`;
}

/** One significant digit for estimates; exact provider charges stay in formatCost. */
export function formatEstimatedCost(value: number | null): string {
  if (value === null) return 'Unavailable';
  return `$${value.toLocaleString('en-US', { maximumSignificantDigits: 1 })} USD`;
}

function formatTokens(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Unavailable' : value.toLocaleString('en-US');
}

export function usageSummaryText(summary: UsageSummary): string {
  if (summary.cost.value === null && summary.tokens.value === null)
    return 'Cost and token usage unavailable.';
  const cost =
    summary.cost.value === null
      ? 'unavailable'
      : `${formatCost(summary.cost.value)}${summary.cost.partial ? ' (partial)' : ''}`;
  const tokens =
    summary.tokens.value === null
      ? 'Token usage unavailable'
      : `${formatTokens(summary.tokens.value)} tokens${summary.tokens.partial ? ' (partial)' : ''}`;
  const estimate =
    summary.roleCostEstimate === null
      ? ''
      : ` Role ranking estimate: ${formatEstimatedCost(summary.roleCostEstimate)} (not a reported charge).`;
  return `Reported cost for this revision: ${cost}; ${tokens}.${estimate}`;
}

export function stageUsageRows({ run, status }: StageUsage): [string, string][] {
  const usage = run?.usage;
  return [
    ['Status', status === 'unavailable' ? 'Unavailable' : run ? 'Completed' : 'No completed stage'],
    ['Reported cost', formatCost(usage?.costUsd ?? null)],
    ['Total tokens', formatTokens(usage?.totalTokens)],
    ['Input tokens', formatTokens(usage?.inputTokens)],
    ['Output tokens', formatTokens(usage?.outputTokens)],
    ['Reasoning tokens', formatTokens(usage?.reasoningTokens)],
    ['Cached input tokens', formatTokens(usage?.cachedInputTokens)],
    ['Actual model', usage?.actualModel?.trim() || 'Unavailable'],
    ['Provider', usage?.provider?.trim() || 'Unavailable'],
    ['Connection', run?.modelId ?? 'Unavailable'],
    ['Generation ID', usage?.generationId?.trim() || 'Unavailable'],
  ];
}
