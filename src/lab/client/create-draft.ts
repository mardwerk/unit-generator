import { applyProfile, defaultUnitProfile, type UnitProfile } from '../../core/index.js';
import type { LabRequest } from '../contracts.js';
import { emptyRequest } from './artifacts.js';
import { editRequest, readEditor, type EditorInput } from './editor-state.js';

/** `profile` is null when imported inputs carry their own rules. */
export type CreateDraft = {
  name: string;
  input: EditorInput;
  edited: boolean;
  profile: UnitProfile | null;
};

/** True when a request already names the rules it is generated under. */
export function hasProfileRules(request: LabRequest): boolean {
  return Boolean(request.mechanicsDefinition || request.conceptDefinition || request.conceptRules);
}

/** The explicit request a draft generates: its own rules, or the selected Profile's. */
export function requestForDraft(draft: CreateDraft): LabRequest {
  const request = readEditor(draft.input);
  return draft.profile && !hasProfileRules(request)
    ? applyProfile(request, draft.profile)
    : request;
}

export function createDraft(
  request?: LabRequest,
  profile: UnitProfile = defaultUnitProfile,
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
