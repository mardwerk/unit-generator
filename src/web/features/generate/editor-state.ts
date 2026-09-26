import type { LabDocument, LabRequest } from '../../api/contract.js';
import type { ResolvedDocument } from '../../api/contract.js';
import { api } from '../../api/client.js';
import type { ProfileEntry } from '../../api/contract.js';

export interface DocumentInput {
  id: string;
  kind: LabDocument['kind'];
  mode: 'text' | 'url';
  text: string;
  url: string;
  sourceUrl?: string;
  missingFile?: string;
  original?: ResolvedDocument;
}
export interface EditorInput {
  base: LabRequest;
  character: LabRequest['character'];
  task: string;
  constraints: string;
  progression: string;
  documents: DocumentInput[];
}
export function editRequest(request: LabRequest): EditorInput {
  return {
    base: structuredClone(request),
    character: { ...request.character },
    task: request.task,
    constraints: JSON.stringify(request.constraints, null, 2),
    progression: JSON.stringify(request.progression, null, 2),
    documents: request.documents.map((document) => ({
      id: document.id,
      kind: document.kind,
      mode: 'url' in document && document.url && !document.text ? 'url' : 'text',
      text: document.text ?? '',
      url: 'url' in document ? (document.url ?? '') : '',
      ...('sourceUrl' in document && document.sourceUrl ? { sourceUrl: document.sourceUrl } : {}),
      ...('file' in document && document.file ? { missingFile: document.file } : {}),
      ...('origin' in document ? { original: document } : {}),
    })),
  };
}
export function readEditor(input: EditorInput): LabRequest {
  let constraints: unknown, progression: unknown;
  try {
    constraints = JSON.parse(input.constraints);
    progression = JSON.parse(input.progression);
  } catch {
    throw new Error('Constraints and progression must contain valid JSON.');
  }
  return {
    ...input.base,
    character: input.character,
    task: input.task,
    constraints,
    progression,
    documents: input.documents.map((document) => {
      if (document.mode === 'url')
        return {
          id: document.id,
          kind: document.kind,
          url: document.url,
          ...(document.sourceUrl ? { sourceUrl: document.sourceUrl } : {}),
        };
      const original = document.original;
      if (
        original &&
        original.id === document.id &&
        original.kind === document.kind &&
        original.text === document.text
      )
        return original;
      return {
        id: document.id,
        kind: document.kind,
        text: document.text,
        ...(original?.visualReferences ? { visualReferences: original.visualReferences } : {}),
        ...(original?.visualNotes ? { visualNotes: original.visualNotes } : {}),
        origin: {
          location: original?.origin.location ?? document.sourceUrl ?? 'Browser-supplied text',
          access: 'supplied',
          note: original
            ? 'Edited in mardwerk-unit. This text was supplied by the caller, not independently retrieved.'
            : document.sourceUrl
              ? 'Text supplied by the caller and attributed to this URL. The URL was not independently retrieved.'
              : null,
        },
      };
    }),
  };
}

/** Choosing a Profile replaces the rules and starts a new design; imported rules stay until then. */
export async function selectProfile(input: EditorInput, entry: ProfileEntry): Promise<EditorInput> {
  const {
    deliverable: _deliverable,
    operation: _operation,
    ...request
  } = await api<LabRequest>('profiles/apply', {
    request: readEditor(input),
    profileId: entry.profile.id,
  });
  return editRequest({ ...request, previous: null, feedback: null });
}
