import type { LabRequest, ProfileEntry } from '../../api/contract.js';
import { emptyRequest } from '../../api/artifacts.js';
import { editRequest, readEditor, type EditorInput } from './editor-state.js';

/**
 * `profile` is the Profile a new design is generated under; null means the
 * server's default, or rules the imported inputs already carry.
 */
export type CreateDraft = {
  name: string;
  input: EditorInput;
  edited: boolean;
  profile: ProfileEntry | null;
};

/** True when a request already names the rules it is generated under. */
export function hasProfileRules(request: LabRequest): boolean {
  return Boolean(request.mechanicsDefinition);
}

/**
 * The explicit request a draft generates. The server applies the selected
 * Profile (or its default) when the request carries no rules of its own.
 */
export function requestForDraft(draft: CreateDraft): LabRequest {
  return readEditor(draft.input);
}

export function createDraft(
  request?: LabRequest,
  profile: ProfileEntry | null = null,
): CreateDraft {
  const input = editRequest(request ?? emptyRequest());
  return {
    name: input.character.name,
    profile: request && hasProfileRules(request) ? null : profile,
    input,
    edited: Boolean(
      request &&
      (request.documents.length ||
        request.task.trim() ||
        request.character.work.trim() ||
        request.character.scope.trim() ||
        (Array.isArray(request.constraints)
          ? request.constraints.length
          : request.constraints != null) ||
        request.progression ||
        request.mechanicsDefinition),
    ),
  };
}
/** True when the create page holds nothing a user would lose by starting over. */
export function isEmptyCreateDraft(draft: Pick<CreateDraft, 'name' | 'edited'>): boolean {
  return !draft.name.trim() && !draft.edited;
}
export function nameCreateDraft(draft: CreateDraft, name: string): CreateDraft {
  return {
    ...draft,
    name,
    input: { ...draft.input, character: { ...draft.input.character, name } },
  };
}
export function generationView(modifiers: {
  ctrlKey: boolean;
  metaKey: boolean;
}): 'generate' | 'unit' {
  return modifiers.ctrlKey || modifiers.metaKey ? 'generate' : 'unit';
}

/** Validate before navigation or run state changes, then detach the run from future form edits. */
export function snapshotCreateDraft(draft: CreateDraft): CreateDraft {
  if (!draft.name.trim()) throw new Error('Enter a character name.');
  const snapshot = structuredClone(draft);
  if (snapshot.edited) readEditor(snapshot.input);
  return snapshot;
}
