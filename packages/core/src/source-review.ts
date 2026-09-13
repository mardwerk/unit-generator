import { createHash } from 'node:crypto';
import type {
  Execution,
  FidelityAttempt,
  FidelityReport,
  Issue,
  Metadata,
  ResearchResult,
  Failure
} from './contracts.js';
import { createExecution, failure } from './execution.js';
import { reviewFidelity } from './fidelity.js';
import { jsonCopy, RunError } from './json.js';

export interface CandidateSourceReview {
  status: 'success' | 'failed' | 'cancelled';
  candidateSha256?: string;
  fidelity?: FidelityReport;
  fidelityAttempts?: FidelityAttempt[];
  issues: Issue[];
  metadata: Metadata;
  error?: Failure;
}
/** Checks an edited candidate against retained evidence. Never generates or edits unit content. */
export async function reviewCandidateSources(
  candidate: unknown,
  input: unknown,
  research: ResearchResult[],
  execution: Execution = {},
  gameRules = ''
): Promise<CandidateSourceReview> {
  let runtime: ReturnType<typeof createExecution> | undefined;
  const result: CandidateSourceReview = {
    status: 'failed',
    issues: [],
    metadata: { modelCalls: 0, repairs: 0, elapsedMs: 0, calls: [] }
  };
  try {
    runtime = createExecution({
      ...execution,
      policy: { ...execution.policy, network: 'deny', discovery: false, followLinks: false },
      limits: {
        ...execution.limits,
        maxModelCalls: Math.min(execution.limits?.maxModelCalls ?? 2, 2),
        maxRepairs: 0
      }
    });
    result.metadata = runtime.metadata;
    const retained = jsonCopy(candidate, runtime.limits.maxOutputBytes);
    const request = jsonCopy(input, runtime.limits.maxInputBytes);
    result.candidateSha256 = createHash('sha256').update(JSON.stringify(retained)).digest('hex');
    for (const evidence of jsonCopy(research, runtime.limits.maxInputBytes)) {
      const reused = await runtime.context.research({
        subject: evidence.subject,
        ...(evidence.grounding === 'original-concept' ? { kind: 'original' as const } : {}),
        knowledge: evidence
      });
      if (reused.status !== 'success')
        throw new RunError(
          reused.error?.code ?? 'fidelity-evidence-required',
          reused.error?.message ?? 'Retained evidence could not be reused.',
          'fidelity-review'
        );
    }
    const checked = await reviewFidelity(
      retained,
      request,
      runtime.researchResults,
      runtime.context,
      gameRules
    );
    result.fidelity = checked.report;
    result.issues = checked.issues;
    if (checked.attempts) result.fidelityAttempts = checked.attempts;
    result.status = checked.issues.length ? 'failed' : 'success';
  } catch (error) {
    const signal = runtime?.context.signal ?? execution.signal ?? new AbortController().signal;
    result.status = signal.aborted ? 'cancelled' : 'failed';
    result.error = failure(error, signal, 'fidelity-review');
    if (
      error &&
      typeof error === 'object' &&
      'fidelityAttempts' in error &&
      Array.isArray(error.fidelityAttempts)
    )
      result.fidelityAttempts = jsonCopy(
        error.fidelityAttempts,
        (runtime?.limits.maxOutputBytes ?? 2 * 1024 * 1024) * 2 + 16384
      );
  } finally {
    runtime?.close();
  }
  return result;
}
