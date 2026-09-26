import type { AuthorRequest, Finding, UnitCandidate, UnitProfile } from '../../core/index.js';
import type { LabArtifact, LabRequest, LabStage } from '../contracts.js';

export interface Revision {
  id: string;
  label: string;
  createdAt: string;
  request: LabRequest;
  artifact: LabArtifact | null;
  /** The Profile a name lookup runs under, until the lookup has prepared a request. */
  profile?: UnitProfile;
}

export function emptyRequest(): LabRequest {
  return {
    schemaVersion: '1',
    task: '',
    character: { name: '', work: '', scope: '' },
    documents: [],
    constraints: [],
    progression: null,
    previous: null,
    feedback: null,
  };
}

/** Selecting pending inputs never inherits the previously selected artifact's rules. */
export function inputForSelection(revision: Revision | undefined, pending: LabRequest | null) {
  const request = structuredClone(revision?.request ?? pending ?? emptyRequest());
  const dirty = revision
    ? revision.artifact
      ? JSON.stringify(request) !== JSON.stringify(requestOf(revision.artifact))
      : false
    : true;
  return { request, dirty };
}

export function sessionSnapshot(
  revisions: Revision[],
  selectedId: string | null,
  input: LabRequest,
  characterName: string,
  unrunInput: LabRequest | null,
) {
  return structuredClone({
    unitLabSession: 1,
    revisions,
    selectedId,
    input,
    characterName,
    unrunInput,
  });
}

export function requestOf(artifact: LabArtifact): AuthorRequest {
  if (artifact.kind === 'prepared') return artifact.request;
  return artifact.kind === 'checked' ? artifact.draft.prepared.request : artifact.prepared.request;
}

export function candidateOf(artifact: LabArtifact | null): UnitCandidate | null {
  if (!artifact || artifact.kind === 'prepared') return null;
  return artifact.kind === 'checked' ? artifact.draft.candidate : artifact.candidate;
}

export function findingsOf(artifact: LabArtifact): Finding[] {
  return artifact.kind === 'checked' || artifact.kind === 'result' ? artifact.findings : [];
}

export function nextStage(artifact: LabArtifact | null): LabStage | null {
  if (!artifact) return 'prepare';
  return { prepared: 'draft', draft: 'check', checked: 'review', result: null }[
    artifact.kind
  ] as LabStage | null;
}
