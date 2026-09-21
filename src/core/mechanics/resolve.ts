import {
  attackSchema,
  boostSchema,
  boostStatKeys,
  pathKeys,
  statKeys,
  tierKeys,
  mechanicsDefinitionSchema,
  defaultMechanicsDefinition,
  type Attack,
  type Boost,
  type BuildSelection,
  type Change,
  type EnemyProperty,
  type MechanicsDefinition,
  type MechanicsIssue,
  type UnitBlueprint,
} from './schemas.js';

export type ResolvedAbility = Boost & {
  path: (typeof pathKeys)[number];
  available: true;
  initiallyReady: true;
  boostedAttack: Attack;
};
export type TierDelta = {
  path: (typeof pathKeys)[number];
  tier: number;
  name: string;
  incrementalCost: number;
  cumulativeCost: number;
  changes: Change[];
  beforeAttack: Attack;
  afterAttack: Attack;
};
export type ResolvedBuild = {
  selection: BuildSelection;
  baseAttack: Attack;
  abilities: ResolvedAbility[];
  cumulativeCost: number;
  tierDeltas: TierDelta[];
};
type Purchase = {
  pathIndex: number;
  tier: number;
  upgrade: UnitBlueprint['paths']['path1']['tiers']['tier1'];
};
type NumericChange = { operation: 'set' | 'add' | 'multiply'; value: number };

export class MechanicsValidationError extends Error {
  constructor(public readonly issues: MechanicsIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'MechanicsValidationError';
  }
}

export function selectionIssues(
  selection: BuildSelection,
  definition: MechanicsDefinition,
): MechanicsIssue[] {
  if (
    !Array.isArray(selection) ||
    selection.length !== 3 ||
    selection.some((tier) => !Number.isInteger(tier) || tier < 0 || tier > 5)
  ) {
    return [
      { path: 'selection', message: 'A build must contain three integer tiers from 0 through 5.' },
    ];
  }
  const { maxPurchasedPaths, crosspathTier, maxAdvancedPaths } = definition.progression;
  if (
    selection.filter((tier) => tier > 0).length > maxPurchasedPaths ||
    selection.filter((tier) => tier > crosspathTier).length > maxAdvancedPaths
  ) {
    return [
      {
        path: 'selection',
        message: `At most ${maxPurchasedPaths} paths may be purchased and only ${maxAdvancedPaths} may exceed tier ${crosspathTier}.`,
      },
    ];
  }
  return [];
}

export function allLegalBuilds(
  definition: MechanicsDefinition = defaultMechanicsDefinition,
): BuildSelection[] {
  const parsed = mechanicsDefinitionSchema.parse(definition);
  const builds: BuildSelection[] = [];
  for (let a = 0; a <= 5; a++)
    for (let b = 0; b <= 5; b++)
      for (let c = 0; c <= 5; c++) {
        const selection: BuildSelection = [a, b, c];
        if (!selectionIssues(selection, parsed).length) builds.push(selection);
      }
  return builds;
}

// Canonical order is tier first, then path, then the declared change index.
// Numeric setters replace only the baseline; every purchased addition and multiplier survives.
export function purchases(blueprint: UnitBlueprint, selection: BuildSelection): Purchase[] {
  const result: Purchase[] = [];
  for (let tier = 1; tier <= 5; tier++) {
    pathKeys.forEach((path, pathIndex) => {
      if (selection[pathIndex]! >= tier)
        result.push({ pathIndex, tier, upgrade: blueprint.paths[path].tiers[tierKeys[tier - 1]!] });
    });
  }
  return result;
}

function calculate(initial: number, changes: NumericChange[]): number {
  let baseline = initial;
  let addition = 0;
  let multiplier = 1;
  for (const change of changes) {
    if (change.operation === 'set') baseline = change.value;
    else if (change.operation === 'add') addition += change.value;
    else multiplier *= change.value;
  }
  return (baseline + addition) * multiplier;
}

export function resolveUnchecked(
  blueprint: UnitBlueprint,
  selection: BuildSelection,
): Omit<ResolvedBuild, 'tierDeltas'> {
  const bought = purchases(blueprint, selection);
  const changes = bought.flatMap(({ upgrade }) => upgrade.changes);
  const attack = structuredClone(blueprint.baseAttack);
  for (const stat of statKeys) {
    attack.stats[stat] = calculate(
      attack.stats[stat],
      changes.filter(
        (change): change is Extract<Change, { kind: 'stat' }> =>
          change.kind === 'stat' && change.stat === stat,
      ),
    );
  }
  for (const change of changes) {
    if (change.kind === 'camo') attack.camo = change.value;
    if (change.kind === 'delivery') attack.delivery = change.value;
    if (change.kind === 'damageType') attack.damageType = change.value;
    if (change.kind === 'targeting') attack.targeting = change.value;
    if (change.kind === 'distribution') attack.distribution = change.value;
    if (change.kind === 'followUp' && change.target === 'base')
      attack.followUp = structuredClone(change.value);
  }
  const abilities: ResolvedAbility[] = [];
  pathKeys.forEach((path, pathIndex) => {
    const localChanges = bought
      .filter((purchase) => purchase.pathIndex === pathIndex)
      .flatMap(({ upgrade }) => upgrade.changes);
    const unlock = localChanges.find((change) => change.kind === 'unlockBoost');
    if (!unlock || unlock.kind !== 'unlockBoost') return;
    const boost = structuredClone(unlock.boost);
    for (const stat of boostStatKeys) {
      boost[stat] = calculate(
        boost[stat],
        localChanges.filter(
          (change): change is Extract<Change, { kind: 'modifyBoost' }> =>
            change.kind === 'modifyBoost' && change.stat === stat,
        ),
      );
    }
    const boostedAttack = structuredClone(attack);
    boostedAttack.stats.damage *= boost.damageMultiplier;
    boostedAttack.stats.intervalSeconds *= boost.intervalMultiplier;
    boostedAttack.stats.range += boost.rangeBonus;
    for (const change of localChanges)
      if (change.kind === 'followUp' && change.target === 'boost')
        boostedAttack.followUp = structuredClone(change.value);
    abilities.push({ ...boost, path, available: true, initiallyReady: true, boostedAttack });
  });
  return {
    selection: [...selection],
    baseAttack: attack,
    abilities,
    cumulativeCost:
      blueprint.baseAttack.cost + bought.reduce((sum, { upgrade }) => sum + upgrade.cost, 0),
  };
}

export function resolvedIssues(
  build: Omit<ResolvedBuild, 'tierDeltas'>,
  definition: MechanicsDefinition,
  prefix: string,
  blueprint?: UnitBlueprint,
): MechanicsIssue[] {
  const issues: MechanicsIssue[] = [];
  const add = (path: string, message: string) =>
    issues.push({ path: `${prefix}.${path}`, message });
  const checkAttack = (attack: Attack, path: string) => {
    const parsed = attackSchema.safeParse(attack);
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        const stat = issue.path[0] === 'stats' ? issue.path[1] : undefined;
        if (stat === 'projectiles' || stat === 'pierce') {
          const modifiers = blueprint
            ? purchases(blueprint, build.selection).flatMap(({ pathIndex, tier, upgrade }) =>
                upgrade.changes.flatMap((change, index) =>
                  change.kind === 'stat' && change.stat === stat
                    ? [
                        `paths.${pathKeys[pathIndex]}.tiers.tier${tier}.changes.${index}: ${change.operation} ${change.value}`,
                      ]
                    : [],
                ),
              )
            : [];
          add(
            `${path}.stats.${stat}`,
            `Resolved ${stat} is ${attack.stats[stat]}; must be a positive integer. ${modifiers.length ? `Purchased modifiers: ${modifiers.join('; ')}. ` : ''}${blueprint ? `Starting base ${blueprint.baseAttack.stats[stat]}. ` : ''}Correct the authored count changes so (last set or base + all adds) * all multipliers is integral in every legal build. Counts are never rounded.`,
          );
        } else add(`${path}.${issue.path.join('.')}`, issue.message);
      }
    for (const stat of statKeys)
      if (attack.stats[stat] > definition.profile.maxStatValue)
        add(`${path}.stats.${stat}`, 'Exceeds the Definition stat ceiling.');
    const stats = attack.stats;
    if (
      attack.distribution === 'distinct-targets' &&
      !definition.rules.attackExtensions?.includes('distinct-volley')
    )
      add(`${path}.distribution`, 'This Definition does not enable distinct-target volleys.');
    if (attack.followUp) {
      if (!definition.rules.attackExtensions?.includes('volley-follow-up'))
        add(`${path}.followUp`, 'This Definition does not enable volley follow-ups.');
      for (const [key, value] of Object.entries(attack.followUp))
        if (typeof value === 'number' && value > definition.profile.maxStatValue)
          add(`${path}.followUp.${key}`, 'Exceeds the Definition stat ceiling.');
      if (
        !Number.isFinite(stats.damage * attack.followUp.damageMultiplier) ||
        stats.damage * attack.followUp.damageMultiplier > definition.profile.maxStatValue
      )
        add(
          `${path}.followUp.damageMultiplier`,
          'Resolved secondary damage exceeds the Definition stat ceiling.',
        );
    }
    if (stats.slowPercent > 0 !== stats.slowSeconds > 0)
      add(`${path}.stats.slowSeconds`, 'Slow requires both a positive percent and duration.');
    if (stats.burnDamagePerSecond > 0 !== stats.burnSeconds > 0)
      add(
        `${path}.stats.burnSeconds`,
        'Burn requires both positive damage per second and duration.',
      );
    if (
      stats.damage === 0 &&
      stats.burnDamagePerSecond === 0 &&
      stats.slowPercent === 0 &&
      stats.stunSeconds === 0
    )
      add(path, 'An attack must supply damage, burn, slow or stun.');
    if (attack.delivery === 'area' && stats.splashRadius <= 0)
      add(`${path}.stats.splashRadius`, 'Area delivery requires a positive splash radius.');
    if (stats.splashRadius > 0 && stats.pierce < 2)
      add(
        `${path}.stats.splashRadius`,
        'Splash requires pierce of at least 2 because the primary target consumes one target slot.',
      );
  };
  checkAttack(build.baseAttack, 'baseAttack');
  build.abilities.forEach((ability, index) => {
    const {
      path: _path,
      available: _available,
      initiallyReady: _initiallyReady,
      boostedAttack,
      ...boost
    } = ability;
    const parsed = boostSchema.safeParse(boost);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        add(`abilities.${index}.${issue.path.join('.')}`, issue.message);
    for (const stat of boostStatKeys)
      if (boost[stat] > definition.profile.maxStatValue)
        add(`abilities.${index}.${stat}`, 'Exceeds the Definition stat ceiling.');
    if (boost.durationSeconds > boost.cooldownSeconds)
      add(
        `abilities.${index}.durationSeconds`,
        'Duration may not exceed cooldown in this Definition.',
      );
    if (JSON.stringify(boostedAttack) === JSON.stringify(build.baseAttack))
      add(`abilities.${index}`, 'The boost must change the resolved attack.');
    else if (
      boostedAttack.stats.damage <= build.baseAttack.stats.damage &&
      boostedAttack.stats.intervalSeconds >= build.baseAttack.stats.intervalSeconds &&
      boostedAttack.stats.range <= build.baseAttack.stats.range
    )
      add(
        `abilities.${index}`,
        'The boost must improve damage, attack interval or range over the purchased attack; tradeoffs are allowed.',
      );
    checkAttack(boostedAttack, `abilities.${index}.boostedAttack`);
  });
  if (!Number.isFinite(build.cumulativeCost))
    add('cumulativeCost', 'Cumulative cost must be finite.');
  return issues;
}

export function withTierDeltas(blueprint: UnitBlueprint, selection: BuildSelection): ResolvedBuild {
  const resolved = resolveUnchecked(blueprint, selection);
  const intermediate: BuildSelection = [0, 0, 0];
  let previous = resolveUnchecked(blueprint, intermediate);
  const tierDeltas = purchases(blueprint, selection).map(({ pathIndex, tier, upgrade }) => {
    intermediate[pathIndex] = tier;
    const next = resolveUnchecked(blueprint, intermediate);
    const delta: TierDelta = {
      path: pathKeys[pathIndex]!,
      tier,
      name: upgrade.name,
      incrementalCost: upgrade.cost,
      cumulativeCost: next.cumulativeCost,
      changes: structuredClone(upgrade.changes),
      beforeAttack: previous.baseAttack,
      afterAttack: next.baseAttack,
    };
    previous = next;
    return delta;
  });
  return { ...resolved, tierDeltas };
}

/** Static target eligibility, without simulating attacks, positions or enemy health. */
export function assessTarget(
  attack: Attack,
  target: { camo: boolean; obstructed: boolean; properties: EnemyProperty[] },
  definition: MechanicsDefinition = defaultMechanicsDefinition,
) {
  const rules = mechanicsDefinitionSchema.parse(definition).rules;
  const detected = !target.camo || attack.camo;
  const reachable = !target.obstructed;
  const eligible = detected && reachable;
  const immune = rules.damageImmunities[attack.damageType].some((property) =>
    target.properties.includes(property),
  );
  return {
    detected,
    reachable,
    canDamage:
      eligible && !immune && (attack.stats.damage > 0 || attack.stats.burnDamagePerSecond > 0),
    canSlow:
      eligible &&
      attack.stats.slowPercent > 0 &&
      !rules.slowImmune.some((property) => target.properties.includes(property)),
    canStun:
      eligible &&
      attack.stats.stunSeconds > 0 &&
      !rules.stunImmune.some((property) => target.properties.includes(property)),
  };
}
