import { z } from 'zod';
import { compileBlueprint } from './blueprint/compile.js';
import { validateBlueprintRequest } from './blueprint/validate.js';
import { checkDraft } from './check.js';
import {
  compactJsonSchema,
  compileCompactToBlueprint,
  compactPrompt,
  decodeCompact,
  funIssues,
  type CompactBlueprint,
} from './compact.js';
import { prepareRequest, freeze } from './prepare.js';
import { rankUnitRoles } from './roles.js';
import { pickSpine, tropeDocumentText, tropePacketForName } from './spines.js';
import {
  applyDefaultProfile,
  defaultProgression,
  defaultAuthoringDefinition,
  starterAuthoringTask,
} from './default-profile.js';
import {
  draftArtifactSchema,
  modelUsageSchema,
  preparedSchema,
  type CheckedArtifact,
  type DraftArtifact,
  type ModelUsage,
  type PreparedRequest,
} from './schemas.js';
import { stageFailure, type ModelClient } from './model.js';
import type { OperationOptions } from './draft.js';
import type { UnitBlueprint } from './mechanics/schemas.js';

const tropeDocumentId = 'trope-packet';

/** Offline name intake. No network, no canon claims, five verbatim trope lines. */
export async function prepareSpineRequest(name: string): Promise<PreparedRequest> {
  const character = z.string().trim().min(1).max(120).parse(name);
  const trope = tropePacketForName(character);
  const spine = pickSpine(trope);
  return prepareRequest(
    applyDefaultProfile({
      schemaVersion: '1',
      task: starterAuthoringTask,
      character: {
        name: character,
        work: trope.work,
        scope: `Adapt the name as a ${trope.archetype}. No source canon is claimed.`,
      },
      documents: [
        {
          id: tropeDocumentId,
          kind: 'source',
          text: tropeDocumentText(character, trope, spine),
          origin: {
            location: `mardwerk-unit:trope-packet:${spine.id}`,
            access: 'supplied',
            note: 'Code-built trope hint from the name alone. Not retrieved canon.',
          },
        },
      ],
      constraints: [],
      progression: structuredClone(defaultProgression),
      mechanicsDefinition: structuredClone(defaultAuthoringDefinition),
      previous: null,
      feedback: null,
    }),
  );
}

/** Verbatim anchor lines from retained source documents. Quotes must match exactly. */
export function sourceAnchors(request: PreparedRequest['request'], limit = 6): string[] {
  const lines: string[] = [];
  for (const document of request.documents) {
    if (document.kind !== 'source') continue;
    for (const sentence of document.text.split(/(?<=[.!?])\s+/)) {
      const clean = sentence.replace(/\s+/g, ' ').trim();
      if (clean.length >= 20 && !lines.includes(clean)) lines.push(clean);
      if (lines.length >= limit) return lines;
    }
  }
  if (!lines.length) throw new Error('Supply source text before drafting.');
  return lines;
}

interface CompactAttempt {
  compact: CompactBlueprint;
  usage?: ModelUsage;
}

/** One compact model call plus one bounded repair. Replaces the old plan route. */
export async function draftSpineUnit(
  input: PreparedRequest,
  model: ModelClient,
  options: OperationOptions = {},
): Promise<DraftArtifact> {
  const prepared = preparedSchema.parse(input);
  const request = prepared.request;
  if (!request.mechanicsDefinition) throw new Error('Supply a mechanics definition.');
  options.signal?.throwIfAborted();
  const trope = tropePacketForName(request.character.name);
  const spine = pickSpine(trope);
  const anchors = sourceAnchors(request);
  const context = {
    characterName: request.character.name,
    documentId:
      request.documents.find((doc) => doc.kind === 'source' && doc.id === tropeDocumentId)?.id ??
      request.documents.find((doc) => doc.kind === 'source')!.id,
    quotes: anchors,
    spine,
    constraintIds: request.constraints.map((constraint) => constraint.id),
  };
  const startedAt = new Date().toISOString();
  const attempts: NonNullable<DraftArtifact['run']['attempts']> = [];
  const maxRepairs = options.maxRepairAttempts ?? 1;

  const call = async (previous?: { compact: CompactBlueprint; issues: string[] }) => {
    const { system, prompt } = compactPrompt(
      request.character.name,
      trope,
      spine,
      anchors,
      previous ? { json: JSON.stringify(previous.compact), issues: previous.issues } : undefined,
    );
    let usage: ModelUsage | undefined;
    try {
      const response = await model.generate({
        system,
        prompt,
        schema: compactJsonSchema(),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      usage = response.usage === undefined ? undefined : modelUsageSchema.parse(response.usage);
      options.signal?.throwIfAborted();
      return { compact: decodeCompact(response.output), usage };
    } catch (error) {
      const invalid =
        error instanceof z.ZodError ||
        (error instanceof Error && error.message.startsWith('Invalid compact blueprint'));
      throw stageFailure(error, 'draft', usage, invalid);
    }
  };

  const check = (blueprint: UnitBlueprint): string[] => [
    ...validateBlueprintRequest(blueprint, request).map(
      (issue) => `${issue.path}: ${issue.message}`,
    ),
    ...funIssues(blueprint, request.mechanicsDefinition),
  ];

  let current: CompactAttempt = await call();
  attempts.push({
    number: 1,
    purpose: 'design',
    issues: [],
    ...(current.usage ? { usage: current.usage } : {}),
  });
  let blueprint = compileCompactToBlueprint(current.compact, context);
  let issues = check(blueprint);
  if (issues.length && maxRepairs > 0) {
    options.signal?.throwIfAborted();
    current = await call({ compact: current.compact, issues });
    attempts.push({
      number: 2,
      purpose: 'repair',
      issues,
      ...(current.usage ? { usage: current.usage } : {}),
    });
    blueprint = compileCompactToBlueprint(current.compact, context);
    issues = check(blueprint);
  }
  if (issues.length)
    throw stageFailure(
      new Error('Invalid compact blueprint:\n' + issues.slice(0, 12).join('\n')),
      'draft',
      current.usage,
      true,
    );
  const candidate = compileBlueprint(blueprint, request);
  const roles = await rankUnitRoles(
    candidate,
    request.mechanicsDefinition,
    options.roleRankingClient,
    options.signal,
  );
  return freeze(
    draftArtifactSchema.parse({
      schemaVersion: '1',
      kind: 'draft',
      prepared,
      candidate,
      run: {
        id: globalThis.crypto.randomUUID(),
        modelId: model.id,
        startedAt,
        completedAt: new Date().toISOString(),
        ...(current.usage === undefined ? {} : { usage: current.usage }),
        attempts,
      },
      roles,
    }),
  );
}

/** Name in, checked unit out. The full default pipeline in one call. */
export async function generateUnit(
  name: string,
  model: ModelClient,
  options: OperationOptions = {},
): Promise<CheckedArtifact> {
  return checkDraft(await draftSpineUnit(await prepareSpineRequest(name), model, options));
}
