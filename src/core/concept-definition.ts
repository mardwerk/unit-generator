import { conceptDesignGuidance, conceptSkillVersion } from './concept-guidance.js';
import type { AuthorRequest, ConceptContract, ConceptRules } from './schemas.js';

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Resolve supported declarative variation once. Explicit conflicts never select a winner. */
export function resolveConceptRequest(request: AuthorRequest): AuthorRequest {
  if (request.deliverable !== 'concept') return request;
  const definition = request.conceptDefinition;
  if (request.conceptProfile && !definition)
    throw new Error('A concept Profile requires its complete conceptDefinition.');
  let resolved = request;
  if (definition) {
    const rules: ConceptRules = {
      id: definition.id,
      version: definition.version,
      ...structuredClone(definition.rules),
    };
    const profile = request.conceptProfile;
    if (profile) {
      if (!same(profile.definition, { id: definition.id, version: definition.version }))
        throw new Error('The concept Profile targets a different Definition revision.');
      const { earlySupport, manualActivationRequired } = profile.overrides;
      if (earlySupport !== undefined) {
        if (!definition.profileOptions.earlySupport.includes(earlySupport))
          throw new Error('The Definition does not permit this earlySupport Profile override.');
        rules.earlySupport = earlySupport;
      }
      if (manualActivationRequired !== undefined) {
        if (!definition.profileOptions.manualActivationRequired.includes(manualActivationRequired))
          throw new Error(
            'The Definition does not permit this manual activation Profile override.',
          );
        rules.manualActivation.required = manualActivationRequired;
      }
    }
    if (request.progression && !same(request.progression, definition.progression))
      throw new Error('Progression conflicts with the selected concept Definition.');
    if (request.conceptRules && !same(request.conceptRules, rules))
      throw new Error('Concept rules conflict with the resolved Definition and Profile.');
    const id = `concept-definition:${definition.id}`;
    const document = {
      id,
      kind: 'rules' as const,
      text: definition.guidance,
      origin: {
        location: `${id}@${definition.version}`,
        access: 'supplied' as const,
        note: 'Retained concept Definition guidance. Declaration is not Consumer implementation.',
      },
    };
    const retained = request.documents.find((entry) => entry.id === id);
    if (retained && !same(retained, document))
      throw new Error('Retained concept Definition guidance conflicts with its resolved content.');
    resolved = {
      ...request,
      progression: structuredClone(definition.progression),
      conceptRules: rules,
      documents: retained ? request.documents : [...request.documents, document],
    };
  }
  return {
    ...resolved,
    conceptSkill: request.conceptSkill ?? {
      version: conceptSkillVersion,
      text: conceptDesignGuidance,
    },
  };
}

/** The prior contract travels with revisions, including rules stored under unchanged version labels. */
export function conceptContract(request: AuthorRequest): ConceptContract | undefined {
  if (request.deliverable !== 'concept' || !request.progression || !request.conceptRules)
    return undefined;
  return {
    progression: request.progression,
    rules: request.conceptRules,
    ...(request.conceptDefinition ? { definition: request.conceptDefinition } : {}),
    ...(request.conceptProfile ? { profile: request.conceptProfile } : {}),
    ...(request.conceptSkill ? { skill: request.conceptSkill } : {}),
    documents: request.documents.filter((document) => document.kind !== 'source'),
    constraints: request.constraints,
  };
}

export function conceptContractChanges(request: AuthorRequest): string[] {
  const before = request.previous?.conceptContract;
  const after = conceptContract(request);
  if (!before || !after) return [];
  return (Object.keys(after) as (keyof ConceptContract)[])
    .filter((key) => !same(before[key], after[key]))
    .concat((Object.keys(before) as (keyof ConceptContract)[]).filter((key) => !(key in after)))
    .map((key) => `${key} changed`);
}

/** Saved requests are validated against their retained content, without adding today's defaults. */
export function validateConceptDefinition(request: AuthorRequest): void {
  if (request.deliverable !== 'concept') {
    if (request.conceptDefinition || request.conceptProfile || request.conceptSkill)
      throw new Error('Concept Definition, Profile and Skill require the concept Deliverable.');
    return;
  }
  if (request.conceptDefinition || request.conceptProfile) {
    const resolved = resolveConceptRequest(request);
    if (
      !same(resolved.progression, request.progression) ||
      !same(resolved.conceptRules, request.conceptRules) ||
      !same(resolved.documents, request.documents)
    )
      throw new Error(
        'The saved concept contract is not fully resolved. Prepare explicit inputs first.',
      );
  }
  if (conceptContractChanges(request).length && request.operation !== 'adapt')
    throw new Error(
      'Revision changes the retained concept contract. Use operation adapt and explicit feedback.',
    );
}
