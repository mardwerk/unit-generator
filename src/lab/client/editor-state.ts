import type { LabDocument, LabRequest } from '../contracts.js';
import type { ResolvedDocument } from '../../core/index.js';
import {
  defaultConceptRules,
  defaultConceptDefinition,
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
  conceptDefinition?: string;
  conceptProfile?: string;
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
    ...(request.conceptDefinition
      ? {
          conceptDefinition: JSON.stringify(request.conceptDefinition, null, 2),
          conceptProfile: JSON.stringify(request.conceptProfile ?? null, null, 2),
        }
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
  let conceptDefinition = input.base.conceptDefinition;
  let conceptProfile = input.base.conceptProfile;
  if (input.conceptDefinition !== undefined) {
    try {
      conceptDefinition = JSON.parse(input.conceptDefinition);
      conceptProfile = JSON.parse(input.conceptProfile ?? 'null') ?? undefined;
    } catch {
      throw new Error('Concept Definition and Profile must contain valid JSON.');
    }
    if (!conceptDefinition) throw new Error('Concept Definition must be an explicit object.');
  }
  const contractEdited =
    JSON.stringify(conceptDefinition) !== JSON.stringify(input.base.conceptDefinition) ||
    JSON.stringify(conceptProfile) !== JSON.stringify(input.base.conceptProfile);
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
  const { conceptProfile: _previousProfile, ...base } = input.base;
  return {
    ...base,
    character: input.character,
    task: input.task,
    constraints,
    progression,
    ...(conceptRules ? { conceptRules } : {}),
    ...(conceptDefinition ? { conceptDefinition } : {}),
    ...(conceptProfile ? { conceptProfile } : {}),
    ...(contractEdited ? { progression: null, conceptRules: undefined } : {}),
    documents: input.documents
      .filter(
        (document) =>
          !contractEdited ||
          (!document.id.startsWith('concept-definition:') &&
            document.id !== defaultConceptProfile.id),
      )
      .map((document) => {
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
  const {
    mechanicsDefinition,
    conceptRules: _rules,
    conceptDefinition: _definition,
    conceptProfile: _profile,
    conceptSkill: _skill,
    ...base
  } = request;
  const documents = request.documents.filter(
    (doc) =>
      !/^default-td-profile-v[0-9]+$/.test(doc.id) &&
      doc.id !== defaultConceptProfile.id &&
      !doc.id.startsWith('concept-definition:') &&
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
      ? {
          conceptRules: structuredClone(defaultConceptRules),
          conceptDefinition: structuredClone(defaultConceptDefinition),
        }
      : { mechanicsDefinition: structuredClone(defaultAuthoringDefinition) }),
  });
}
