import { z } from 'zod';
import { conceptRulesFor } from './concept-definition.js';
import {
  conceptAuthoringTask,
  defaultConceptDefinition,
  defaultConceptProfile,
} from './concept-profile.js';
import {
  defaultAuthoringDefinition,
  defaultProfile,
  starterAuthoringTask,
} from './default-profile.js';
import { mechanicsDefinitionSchema } from './mechanics/schemas.js';
import { definitionProgression } from './planned-v1/definition.js';
import { freeze, prepareRequest } from './prepare.js';
import {
  conceptDefinitionSchema,
  conceptProfileSchema,
  resolvedDocumentSchema,
  type AuthorRequest,
} from './schemas.js';

/**
 * A reusable generation configuration: exactly one Definition, its rules text and the task.
 * Progression is derived from the Definition, so the two can never disagree.
 */
export const unitProfileSchema = z
  .strictObject({
    schemaVersion: z.literal('1'),
    kind: z.literal('profile'),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'Use lowercase letters, digits and hyphens'),
    name: z.string().trim().min(1).max(120),
    task: z.string().trim().min(1),
    rules: resolvedDocumentSchema,
    mechanicsDefinition: mechanicsDefinitionSchema.optional(),
    conceptDefinition: conceptDefinitionSchema.optional(),
    conceptProfile: conceptProfileSchema.optional(),
  })
  .refine((profile) => profile.rules.kind === 'rules', 'The Profile rules document must be rules')
  .refine(
    (profile) => Boolean(profile.mechanicsDefinition) !== Boolean(profile.conceptDefinition),
    'A Profile needs exactly one mechanics or concept Definition',
  )
  .refine(
    (profile) => !profile.conceptProfile || Boolean(profile.conceptDefinition),
    'A concept Profile override needs a concept Definition',
  );

export type UnitProfile = z.infer<typeof unitProfileSchema>;

export const defaultUnitProfile: UnitProfile = freeze({
  schemaVersion: '1',
  kind: 'profile',
  id: 'default',
  name: 'Numerical unit (default)',
  task: starterAuthoringTask,
  rules: structuredClone(defaultProfile),
  mechanicsDefinition: structuredClone(defaultAuthoringDefinition),
});

export const qualitativeUnitProfile: UnitProfile = freeze({
  schemaVersion: '1',
  kind: 'profile',
  id: 'qualitative',
  name: 'Qualitative concept',
  task: conceptAuthoringTask,
  rules: structuredClone(defaultConceptProfile),
  conceptDefinition: structuredClone(defaultConceptDefinition),
});

/** Read-only Profiles shipped with the Tool; the first is the stable default. */
export const bundledProfiles: readonly UnitProfile[] = freeze([
  defaultUnitProfile,
  qualitativeUnitProfile,
]);

export function profileDeliverable(profile: UnitProfile): 'mechanics' | 'concept' {
  return profile.mechanicsDefinition ? 'mechanics' : 'concept';
}

export function profileProgression(
  profile: UnitProfile,
): NonNullable<AuthorRequest['progression']> {
  return profile.mechanicsDefinition
    ? definitionProgression(profile.mechanicsDefinition)!
    : structuredClone(profile.conceptDefinition!.progression);
}

/** Documents a Profile owns: bundled or saved rules, and evidence generated from a Definition. */
const profileDocument =
  /^(default-(td|concept)-profile-v[0-9]+|profile:.+|concept-definition:.+|mechanics:.+)$/;

/** The request fields a Profile replaces. Character, sources, decisions and revision context stay. */
interface ProfileTarget {
  task: string;
  documents: { id: string }[];
  deliverable?: 'concept' | 'mechanics' | undefined;
  progression?: unknown;
  mechanicsDefinition?: unknown;
  conceptRules?: unknown;
  conceptDefinition?: unknown;
  conceptProfile?: unknown;
  conceptSkill?: unknown;
}

/** Replace the rules a request is generated under with one Profile's complete content. */
export function applyProfile<R extends ProfileTarget>(request: R, profile: UnitProfile): R {
  const {
    mechanicsDefinition: _mechanics,
    conceptRules: _rules,
    conceptDefinition: _definition,
    conceptProfile: _profile,
    conceptSkill: _skill,
    ...base
  } = request;
  const shared = {
    ...base,
    task: profile.task,
    progression: profileProgression(profile),
    documents: [
      ...request.documents.filter((document) => !profileDocument.test(document.id)),
      structuredClone(profile.rules),
    ],
  };
  if (profile.mechanicsDefinition)
    return {
      ...shared,
      deliverable: 'mechanics',
      mechanicsDefinition: structuredClone(profile.mechanicsDefinition),
    } as unknown as R;
  const definition = profile.conceptDefinition!;
  return {
    ...shared,
    deliverable: 'concept',
    conceptRules: conceptRulesFor(definition, profile.conceptProfile),
    conceptDefinition: structuredClone(definition),
    ...(profile.conceptProfile ? { conceptProfile: structuredClone(profile.conceptProfile) } : {}),
  } as unknown as R;
}

/** A Profile is valid only if a request prepared under it passes the same checks as any other. */
export async function validateProfile(input: unknown): Promise<UnitProfile> {
  const profile = unitProfileSchema.parse(input);
  const placeholder: AuthorRequest = {
    schemaVersion: '1',
    task: profile.task,
    character: { name: 'Profile check', work: 'Profile check', scope: 'Profile check' },
    documents: [
      {
        id: 'profile-check-source',
        kind: 'source',
        text: 'Placeholder source text used only to validate a Profile.',
        origin: { location: 'profile-check', access: 'supplied', note: null },
      },
    ],
    constraints: [],
    progression: null,
    previous: null,
    feedback: null,
  };
  await prepareRequest(applyProfile(placeholder, profile));
  return profile;
}
