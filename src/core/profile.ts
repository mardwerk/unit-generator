import { z } from 'zod';
import {
  defaultAuthoringDefinition,
  defaultProfile,
  starterAuthoringTask,
} from './default-profile.js';
import { mechanicsDefinitionSchema } from './mechanics/schemas.js';
import { definitionProgression } from './planned-v1/definition.js';
import { freeze, prepareRequest } from './prepare.js';
import { resolvedDocumentSchema, type AuthorRequest } from './schemas.js';

/**
 * A reusable generation configuration: one mechanics Definition, its rules text and the task.
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
    mechanicsDefinition: mechanicsDefinitionSchema,
  })
  .refine((profile) => profile.rules.kind === 'rules', 'The Profile rules document must be rules');

export type UnitProfile = z.infer<typeof unitProfileSchema>;

export const defaultUnitProfile: UnitProfile = freeze({
  schemaVersion: '1',
  kind: 'profile',
  id: 'default',
  name: 'BTD6-inspired (default)',
  task: starterAuthoringTask,
  rules: structuredClone(defaultProfile),
  mechanicsDefinition: structuredClone(defaultAuthoringDefinition),
});

/** The single read-only Profile shipped with the Tool: BTD6-inspired 3×5 with Dart Monkey scale. */
export const bundledProfiles: readonly UnitProfile[] = freeze([defaultUnitProfile]);

export function profileProgression(
  profile: UnitProfile,
): NonNullable<AuthorRequest['progression']> {
  return definitionProgression(profile.mechanicsDefinition);
}

/** Documents a Profile owns: bundled or saved rules, and evidence generated from its Definition. */
const profileDocument = /^(default-td-profile-v[0-9]+|profile:.+|mechanics:.+)$/;

/** The request fields a Profile replaces. Character, sources, decisions and revision context stay. */
interface ProfileTarget {
  task: string;
  documents: { id: string }[];
  progression?: unknown;
  mechanicsDefinition?: unknown;
}

/** Replace the rules a request is generated under with one Profile's complete content. */
export function applyProfile<R extends ProfileTarget>(request: R, profile: UnitProfile): R {
  return {
    ...request,
    task: profile.task,
    progression: profileProgression(profile),
    mechanicsDefinition: structuredClone(profile.mechanicsDefinition),
    documents: [
      ...request.documents.filter((document) => !profileDocument.test(document.id)),
      structuredClone(profile.rules),
    ],
  };
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
