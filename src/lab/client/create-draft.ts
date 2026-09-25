import type { LabRequest } from '../contracts.js';
import { emptyRequest } from './artifacts.js';
import { editRequest, readEditor, type EditorInput } from './editor-state.js';

export type CreateDraft = { name: string; input: EditorInput; edited: boolean };
export function createDraft(request?: LabRequest): CreateDraft {
  const input = editRequest(request ?? emptyRequest());
  return {
    name: input.character.name,
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
