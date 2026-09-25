import type { InterpretationInput } from '../core/design.js';
import {
  checkedArtifactSchema,
  draftArtifactSchema,
  resultSchema,
  type Finding,
  type PreparedRequest,
  type UnitCandidate,
  type DesignEvaluation,
} from '../core/index.js';
import { summarizeUsage, type UsageSummary } from './usage.js';

export interface ArtifactView {
  kind: 'draft' | 'checked' | 'result';
  candidate: UnitCandidate;
  prepared: PreparedRequest;
  findings: Finding[];
  resultId: string | null;
  reviewSummary: string | null;
  usage: UsageSummary;
  designEvaluation?: DesignEvaluation;
  interpretation?: InterpretationInput;
}

export function readArtifactView(input: unknown): ArtifactView {
  const result = resultSchema.safeParse(input);
  if (result.success) {
    return {
      kind: 'result',
      candidate: result.data.candidate,
      prepared: result.data.prepared,
      findings: result.data.findings,
      resultId: result.data.id,
      reviewSummary: result.data.reviewSummary,
      usage: summarizeUsage(result.data),
      ...(result.data.run.draft.designEvaluation
        ? { designEvaluation: result.data.run.draft.designEvaluation }
        : {}),
      ...(result.data.run.draft.designPlan?.interpretation
        ? { interpretation: result.data.run.draft.designPlan.interpretation }
        : {}),
    };
  }
  const checked = checkedArtifactSchema.safeParse(input);
  if (checked.success) {
    return {
      kind: 'checked',
      candidate: checked.data.draft.candidate,
      prepared: checked.data.draft.prepared,
      findings: checked.data.findings,
      resultId: null,
      reviewSummary: null,
      usage: summarizeUsage(checked.data),
      ...(checked.data.draft.run.designEvaluation
        ? { designEvaluation: checked.data.draft.run.designEvaluation }
        : {}),
      ...(checked.data.draft.run.designPlan?.interpretation
        ? { interpretation: checked.data.draft.run.designPlan.interpretation }
        : {}),
    };
  }
  const draft = draftArtifactSchema.parse(input);
  return {
    kind: 'draft',
    candidate: draft.candidate,
    prepared: draft.prepared,
    findings: [],
    resultId: null,
    reviewSummary: null,
    usage: summarizeUsage(draft),
    ...(draft.run.designEvaluation ? { designEvaluation: draft.run.designEvaluation } : {}),
    ...(draft.run.designPlan?.interpretation
      ? { interpretation: draft.run.designPlan.interpretation }
      : {}),
  };
}

/** Candidate prose is text, never executable HTML, links or Markdown instructions. */
export function escapeMarkdown(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/[\\`*_[\]{}|#!]/g, '\\$&')
    .replace(/[\r\n]+/g, ' ');
}
