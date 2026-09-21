import { z } from 'zod';
import type { ModelUsage, UnitCandidate } from './schemas.js';
import {
  resolveBuild,
  type MechanicsDefinition,
  type BuildSelection,
  type Attack,
} from './mechanics/index.js';

export const unitRoles = [
  'basic_dps',
  'sniper',
  'rapid_fire',
  'splash',
  'slow',
  'support',
  'economy',
  'tank_killer',
  'status',
  'summoner',
] as const;
export const roleCriteria: Record<(typeof unitRoles)[number], string> = {
  basic_dps: 'Deals reliable direct damage without a stronger specialization in the other roles.',
  sniper: 'Prioritizes long-range, accurate, high-impact attacks against selected targets.',
  rapid_fire: 'Deals sustained damage through very frequent attacks or dense projectile volleys.',
  splash: 'Clears groups through explosions, area attacks, bouncing attacks, or chain damage.',
  slow: 'Primarily reduces movement speed or repeatedly pushes enemies backward.',
  support:
    'Primarily improves other units through buffs, detection, discounts, or cooldown reduction.',
  economy: 'Primarily generates money, resources, or recoverable economic value.',
  tank_killer:
    'Specializes in high-health enemies, armored enemies, bosses, or large single-target bursts.',
  status:
    'Primarily applies hard control or harmful effects such as stun, freeze, burn, poison, or damage vulnerability.',
  summoner:
    'Primarily deploys autonomous attackers, minions, or persistent traps that deal damage or control enemies.',
};
export const roleBuildIds = ['base', 'path1', 'path2', 'path3'] as const;
export type RoleBuildId = (typeof roleBuildIds)[number];
const probability = z.number().finite().min(0).max(1);
export const roleAnswerSchema = z
  .strictObject({
    role: z.enum(unitRoles),
    confidence: probability,
    probabilities: z.strictObject(
      Object.fromEntries(unitRoles.map((role) => [role, probability])) as Record<
        (typeof unitRoles)[number],
        typeof probability
      >,
    ),
  })
  .superRefine((answer, ctx) => {
    const values = Object.values(answer.probabilities);
    if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 0.01)
      ctx.addIssue({ code: 'custom', message: 'Role probabilities must sum to one.' });
    if (answer.probabilities[answer.role] + 1e-6 < Math.max(...values))
      ctx.addIssue({
        code: 'custom',
        message: 'Selected role must have the greatest probability.',
      });
  });
export type RoleAnswer = z.infer<typeof roleAnswerSchema>;
// Local numeric usage validation avoids a runtime cycle with artifact schemas.
const tokens = z.number().int().nonnegative().nullable();
const roleUsageSchema = z.strictObject({
  inputTokens: tokens,
  outputTokens: tokens,
  totalTokens: tokens,
  reasoningTokens: tokens,
  cachedInputTokens: tokens,
  costUsd: z.number().finite().nonnegative().nullable(),
  actualModel: z.string().nullable(),
  provider: z.string().nullable(),
  generationId: z.string().nullable(),
});
/** Safe accounting only. Provider error payloads and causes never become artifacts. */
export class RoleRankingError extends Error {
  declare readonly usage?: ModelUsage;
  declare readonly estimatedCostUsd?: number;

  constructor(usage?: unknown, estimatedCostUsd?: unknown) {
    super('Role ranking was unavailable.');
    this.name = 'RoleRankingError';
    const parsedUsage = roleUsageSchema.safeParse(usage);
    if (parsedUsage.success) this.usage = Object.freeze(parsedUsage.data);
    const parsedEstimate = z.number().finite().nonnegative().safeParse(estimatedCostUsd);
    if (parsedEstimate.success) this.estimatedCostUsd = parsedEstimate.data;
  }
}

export const roleRankingResponseSchema = z.strictObject({
  answers: z.strictObject({
    base: roleAnswerSchema,
    path1: roleAnswerSchema,
    path2: roleAnswerSchema,
    path3: roleAnswerSchema,
  }),
  usage: roleUsageSchema.optional(),
  estimatedCostUsd: z.number().finite().nonnegative().optional(),
});
export interface RoleBuildDescription {
  id: RoleBuildId;
  selection: BuildSelection;
  description: string;
}
export interface RoleRankingClient {
  readonly id: string;
  rank(
    builds: RoleBuildDescription[],
    signal?: AbortSignal,
  ): Promise<{
    answers: Record<RoleBuildId, RoleAnswer>;
    usage?: ModelUsage;
    estimatedCostUsd?: number;
  }>;
}
const buildRankingSchema = roleAnswerSchema.safeExtend({
  id: z.enum(roleBuildIds),
  selection: z.tuple([
    z.number().int().min(0).max(5),
    z.number().int().min(0).max(5),
    z.number().int().min(0).max(5),
  ]),
});
export const unitRoleRankingSchema = z
  .strictObject({
    status: z.enum(['completed', 'skipped', 'unavailable']),
    provider: z.string().nullable(),
    builds: z.array(buildRankingSchema),
    note: z.string(),
    usage: roleUsageSchema.optional(),
    estimatedCostUsd: z.number().finite().nonnegative().optional(),
  })
  .superRefine((result, ctx) => {
    if (result.status !== 'completed') {
      if (result.builds.length)
        ctx.addIssue({
          code: 'custom',
          message: 'Incomplete ranking cannot contain build answers.',
        });
      return;
    }
    const selections = { base: [0, 0, 0], path1: [5, 0, 0], path2: [0, 5, 0], path3: [0, 0, 5] };
    if (
      result.builds.length !== 4 ||
      new Set(result.builds.map((build) => build.id)).size !== 4 ||
      result.builds.some((build) =>
        build.selection.some((value, index) => value !== selections[build.id][index]),
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Completed ranking must contain each of the four exact build selections.',
      });
  });
export type UnitRoleRanking = z.infer<typeof unitRoleRankingSchema>;

function attackBehavior({ name: _name, ...attack }: Attack) {
  return attack;
}

/** Advisory roles for resolved base and pure tier-five builds. Never changes the kit. */
export async function rankUnitRoles(
  candidate: UnitCandidate,
  definition: MechanicsDefinition,
  client?: RoleRankingClient,
  signal?: AbortSignal,
): Promise<UnitRoleRanking> {
  signal?.throwIfAborted();
  const provider = client?.id ?? null;
  if (!candidate.blueprint || !client)
    return {
      status: 'skipped',
      provider,
      builds: [],
      note: !candidate.blueprint
        ? 'Role ranking requires a mechanical blueprint.'
        : 'Role ranking is off or unconfigured. Configure a Typesafe key or an explicit OpenRouter JEV model and key.',
    };
  let accounting: RoleRankingError | undefined;
  try {
    const selections: BuildSelection[] = [
      [0, 0, 0],
      [5, 0, 0],
      [0, 5, 0],
      [0, 0, 5],
    ];
    const builds = selections.map((selection, index): RoleBuildDescription => {
      const resolved = resolveBuild(candidate.blueprint!, selection, definition);
      return {
        id: roleBuildIds[index]!,
        selection,
        description: JSON.stringify({
          selection,
          baseAttack: attackBehavior(resolved.baseAttack),
          abilities: resolved.abilities.map(({ name: _name, boostedAttack, ...ability }) => ({
            ...ability,
            boostedAttack: attackBehavior(boostedAttack),
          })),
          cumulativeCost: resolved.cumulativeCost,
          rules: definition.rules,
          referenceScale: definition.profile.referenceScale ?? null,
        }),
      };
    });
    const raw = await client.rank(builds, signal);
    accounting = new RoleRankingError(raw.usage, raw.estimatedCostUsd);
    const response = roleRankingResponseSchema.parse(raw);
    signal?.throwIfAborted();
    return {
      status: 'completed',
      provider,
      builds: builds.map((build) => ({
        id: build.id,
        selection: build.selection,
        ...response.answers[build.id],
      })),
      note: 'Advisory roles describe only each purchased build. Confidence is provider-reported, not a balance or correctness guarantee. Proposals and reserved techniques were excluded.',
      ...(response.usage ? { usage: response.usage } : {}),
      ...(response.estimatedCostUsd !== undefined
        ? { estimatedCostUsd: response.estimatedCostUsd }
        : {}),
    };
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof Error && error.name === 'AbortError') throw error;
    const retained = error instanceof RoleRankingError ? error : accounting;
    return {
      status: 'unavailable',
      ...(retained?.usage ? { usage: retained.usage } : {}),
      ...(retained?.estimatedCostUsd !== undefined
        ? { estimatedCostUsd: retained.estimatedCostUsd }
        : {}),
      provider,
      builds: [],
      note: 'Role ranking was unavailable or returned invalid answers. The unit remains usable; check provider configuration and retry ranking. Usage may be unavailable for failed requests.',
    };
  }
}
