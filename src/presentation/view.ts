import {
  checkedArtifactSchema,
  draftArtifactSchema,
  resultSchema,
  type Finding,
  type PreparedRequest,
  type UnitCandidate,
} from '../core/index.js';

export interface ArtifactView {
  kind: 'draft' | 'checked' | 'result';
  candidate: UnitCandidate;
  prepared: PreparedRequest;
  findings: Finding[];
  resultId: string | null;
  reviewSummary: string | null;
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
