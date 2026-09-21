import {
  checkedArtifactSchema,
  draftArtifactSchema,
  resultSchema,
  type Finding,
  type PreparedRequest,
  type UnitCandidate,
  type UnitRoleRanking,
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
  roles?: UnitRoleRanking;
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
      ...(result.data.roles ? { roles: result.data.roles } : {}),
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
      ...(checked.data.draft.roles ? { roles: checked.data.draft.roles } : {}),
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
    ...(draft.roles ? { roles: draft.roles } : {}),
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
