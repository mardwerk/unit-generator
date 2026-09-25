import { checkDraft, type DraftArtifact } from '../../core/index.js';
import type { LabArtifact, LabStage } from '../contracts.js';

/** Explicit predecessors let a stage rerun without mutating the retained revision. */
export async function inputBeforeStage(
  artifact: LabArtifact | null,
  stage: LabStage,
): Promise<LabArtifact | null> {
  if (stage === 'prepare') return null;
  if (!artifact) throw new Error('Prepare the inputs first.');
  const prepared =
    artifact.kind === 'prepared'
      ? artifact
      : artifact.kind === 'checked'
        ? artifact.draft.prepared
        : artifact.prepared;
  if (stage === 'draft') return prepared;
  if (artifact.kind === 'prepared') throw new Error('Create a draft first.');
  const draft: DraftArtifact =
    artifact.kind === 'draft'
      ? artifact
      : artifact.kind === 'checked'
        ? artifact.draft
        : {
            schemaVersion: '1',
            kind: 'draft',
            prepared,
            candidate: artifact.candidate,
            run: artifact.run.draft,
          };
  if (stage === 'check') return draft;
  if (artifact.kind === 'draft') throw new Error('Check the draft first.');
  return artifact.kind === 'checked' ? artifact : checkDraft(draft);
}
