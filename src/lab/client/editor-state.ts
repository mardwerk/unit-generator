import type { LabDocument, LabRequest } from '../contracts.js';
import type { ResolvedDocument } from '../../core/index.js';
import {
  defaultConceptRules,
  defaultConceptProfile,
  conceptAuthoringTask,
} from '../../core/index.js';
import {
  defaultProfile,
  defaultProgression,
  defaultAuthoringDefinition,
  starterAuthoringTask,
} from '../../core/default-profile.js';

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
  conceptRules?: string;
  documents: DocumentInput[];
}
export function editRequest(request: LabRequest): EditorInput {
  return {
    base: structuredClone(request),
    character: { ...request.character },
    task: request.task,
    constraints: JSON.stringify(request.constraints, null, 2),
    progression: JSON.stringify(request.progression, null, 2),
    ...(request.conceptRules
      ? { conceptRules: JSON.stringify(request.conceptRules, null, 2) }
      : {}),
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
  let conceptRules: LabRequest['conceptRules'];
  try {
    constraints = JSON.parse(input.constraints);
    progression = JSON.parse(input.progression);
  } catch {
    throw new Error('Constraints and progression must contain valid JSON.');
  }
  if (input.base.deliverable === 'concept') {
    try {
      conceptRules = JSON.parse(input.conceptRules ?? '');
    } catch {
      throw new Error('Concept rules must contain a valid JSON object.');
    }
    if (!conceptRules || typeof conceptRules !== 'object' || Array.isArray(conceptRules))
      throw new Error('Concept rules must contain a valid JSON object.');
  }
  return {
    ...input.base,
    character: input.character,
    task: input.task,
    constraints,
    progression,
    ...(conceptRules ? { conceptRules } : {}),
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

/** Explicitly select a bundled preset; imported rules remain intact until the user switches. */
export function selectDeliverable(
  input: EditorInput,
  deliverable: 'concept' | 'mechanics',
): EditorInput {
  const request = readEditor(input);
  if (request.deliverable === deliverable) return input;
  const { mechanicsDefinition, conceptRules: _rules, ...base } = request;
  const documents = request.documents.filter(
    (doc) =>
      !/^default-td-profile-v[0-9]+$/.test(doc.id) &&
      doc.id !== defaultConceptProfile.id &&
      doc.id !== (mechanicsDefinition ? `mechanics:${mechanicsDefinition.id}` : ''),
  );
  return editRequest({
    ...base,
    deliverable,
    operation: 'generate',
    previous: null,
    feedback: null,
    task:
      !request.task ||
      request.task === starterAuthoringTask ||
      request.task === conceptAuthoringTask
        ? deliverable === 'concept'
          ? conceptAuthoringTask
          : starterAuthoringTask
        : request.task,
    progression: structuredClone(defaultProgression),
    documents: [
      ...documents,
      structuredClone(deliverable === 'concept' ? defaultConceptProfile : defaultProfile),
    ],
    ...(deliverable === 'concept'
      ? { conceptRules: structuredClone(defaultConceptRules) }
      : { mechanicsDefinition: structuredClone(defaultAuthoringDefinition) }),
  });
}
