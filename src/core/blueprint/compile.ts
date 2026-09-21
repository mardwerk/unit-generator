import { candidateSchema, type AuthorRequest, type UnitCandidate } from '../schemas.js';
import { authorEvidence, evidenceSpans, historicalTechniqueContext } from './evidence.js';
import { pathSummary, unitSummary } from './kit-summary.js';
import { definitionDocument } from './definition.js';
import { resolveBuild, allLegalBuilds } from '../mechanics/index.js';
import {
  pathKeys,
  tierKeys,
  type UnitBlueprint,
  type Attack,
  type Boost,
  type Change,
  type BuildSelection,
  type FollowUp,
} from '../mechanics/schemas.js';

const labels: Record<string, string> = {
  damage: 'damage',
  intervalSeconds: 'attack interval (s)',
  range: 'range (map units)',
  pierce: 'pierce (targets)',
  projectiles: 'projectiles per attack',
  splashRadius: 'splash radius (map units)',
  slowPercent: 'slow (%)',
  slowSeconds: 'slow duration (s)',
  burnDamagePerSecond: 'burn damage/s',
  burnSeconds: 'burn duration (s)',
  stunSeconds: 'stun duration (s)',
  durationSeconds: 'active duration (s)',
  cooldownSeconds: 'cooldown (s)',
  damageMultiplier: 'active damage multiplier',
  intervalMultiplier: 'active attack interval multiplier',
  rangeBonus: 'active range bonus',
};
const number = (value: number) => Number(value.toFixed(4)).toString();
const selections = (index: number, tier: number): BuildSelection =>
  [0, 1, 2].map((i) => (i === index ? tier : 0)) as BuildSelection;

export function attackDescription(attack: Attack): string {
  const s = attack.stats;
  const hit = attack.delivery === 'projectile' ? 'projectile' : 'pulse';
  const effects = [
    `${number(s.damage)} damage every ${number(s.intervalSeconds)} s`,
    `${number(s.range)} map-unit range`,
    attack.distribution === 'distinct-targets'
      ? `up to ${s.projectiles} ${hit}(s) per attack aimed at distinct detected targets in range; one primary hit per target, unused shots are lost`
      : `${s.projectiles} ${hit}(s) per attack aimed at the selected primary target`,
    `${s.pierce} target(s) per ${hit}, including primary and splash targets`,
    s.splashRadius ? `${number(s.splashRadius)} map-unit splash radius` : '',
    s.slowPercent ? `${number(s.slowPercent)}% slow for ${number(s.slowSeconds)} s` : '',
    s.burnDamagePerSecond
      ? `${number(s.burnDamagePerSecond)} burn damage/s for ${number(s.burnSeconds)} s`
      : '',
    s.stunSeconds ? `${number(s.stunSeconds)} s stun` : '',
    attack.followUp ? followUpDescription(attack.followUp) : '',
  ];
  return `${effects.filter(Boolean).join('; ')}.`;
}

export function followUpDescription(effect: FollowUp): string {
  return `${effect.name}: after a primary volley hits, strike up to ${effect.count} other detected enemies within ${number(effect.radius)} map units of the primary impact, nearest first, once each for ${number(effect.damageMultiplier)}x the purchased hit damage. Excludes every enemy hit by the primary volley. ${effect.inheritStatuses ? 'Inherits purchased burn, slow and stun.' : 'No inherited burn, slow or stun.'} Same damage type and clear-path requirement; no inherited splash, pierce, additional volleys or recursive follow-ups`;
}

export function boostDescription(boost: Boost): string {
  return `For ${number(boost.durationSeconds)} s, multiply the purchased attack's damage by ${number(boost.damageMultiplier)} and its interval by ${number(boost.intervalMultiplier)}, and add ${number(boost.rangeBonus)} range. Cooldown: ${number(boost.cooldownSeconds)} s from activation. Ready on purchase; cannot reactivate while active.`;
}

function operationDescription(change: {
  operation: 'add' | 'multiply' | 'set';
  value: number;
}): string {
  return change.operation === 'add'
    ? `${change.value >= 0 ? '+' : ''}${number(change.value)}`
    : change.operation === 'multiply'
      ? `multiply by ${number(change.value)}`
      : `set baseline to ${number(change.value)}`;
}

function changeDescriptions(
  changes: Change[],
  before: ReturnType<typeof resolveBuild>,
  after: ReturnType<typeof resolveBuild>,
): string[] {
  const groups = new Map<string, Change[]>();
  for (const change of changes) {
    const key =
      change.kind === 'stat' || change.kind === 'modifyBoost'
        ? `${change.kind}.${change.stat}`
        : `${change.kind}.${change.target}`;
    const group = groups.get(key) ?? [];
    group.push(change);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const change = group.at(-1)!;
    const effects = group
      .flatMap((entry) =>
        entry.kind === 'stat' || entry.kind === 'modifyBoost' ? [operationDescription(entry)] : [],
      )
      .join(', ');
    if (change.kind === 'stat') {
      const label =
        change.stat === 'projectiles' && after.baseAttack.delivery !== 'projectile'
          ? 'pulses per attack'
          : labels[change.stat];
      return `${label} ${number(before.baseAttack.stats[change.stat])} to ${number(after.baseAttack.stats[change.stat])} (${effects})`;
    }
    if (change.kind === 'unlockBoost') return `Unlock ${change.boost.name}`;
    if (change.kind === 'followUp')
      return `${change.target === 'boost' ? 'While the manual boost is active only: ' : ''}${followUpDescription(change.value)}`;
    if (change.kind === 'distribution')
      return change.value === 'distinct-targets'
        ? 'Volley now targets distinct detected enemies in range, primary first then nearest to the primary; one projectile per target, unused shots are lost'
        : 'All projectiles now target the same primary enemy';
    if (change.kind === 'modifyBoost') {
      const prior = before.abilities[0]!;
      const next = after.abilities[0]!;
      return `${labels[change.stat]} ${number(prior[change.stat])} to ${number(next[change.stat])} (${effects})`;
    }
    if (change.kind === 'camo')
      return change.value
        ? 'Detect camo enemies; delivery still requires a clear path'
        : 'Remove camo detection';
    return `${change.kind} ${before.baseAttack[change.kind]} to ${after.baseAttack[change.kind]}`;
  });
}

/** IDs, unlock joins, purchase deltas and build selections belong to code, not model prose. */
export function compileBlueprint(blueprint: UnitBlueprint, request: AuthorRequest): UnitCandidate {
  const definition = request.mechanicsDefinition;
  if (!definition) throw new Error('A mechanics definition is required to compile a blueprint.');
  const rule = definitionDocument(definition).id;
  const sourceIds = [...new Set(blueprint.sourceFacts.map((fact) => fact.documentId))];
  const evidence = [...sourceIds, rule];
  const availableEvidence = evidenceSpans(request);
  const selectedEvidence = authorEvidence(request);
  const activeSourceIds = [
    ...new Set(
      pathKeys.flatMap((key) =>
        blueprint.paths[key].sourceFactIndices.map(
          (index) => blueprint.sourceFacts[index]!.documentId,
        ),
      ),
    ),
  ];
  const historicalSources = activeSourceIds.flatMap((id) => {
    const context = historicalTechniqueContext(request, id);
    return context ? [context] : [];
  });
  const abilities: UnitCandidate['abilities'] = [];
  const paths = pathKeys.map((key, index) => {
    const path = blueprint.paths[key];
    const pathId = `path-${index + 1}`;
    const pathEvidence = [
      ...new Set(path.sourceFactIndices.map((i) => blueprint.sourceFacts[i]!.documentId)),
      rule,
    ];
    const tiers = tierKeys.map((tierKey, tierIndex) => {
      const tier = path.tiers[tierKey];
      const level = tierIndex + 1;
      const before = resolveBuild(blueprint, selections(index, tierIndex), definition);
      const after = resolveBuild(blueprint, selections(index, level), definition);
      const abilityIds: string[] = [];
      for (const change of tier.changes) {
        if (change.kind !== 'unlockBoost') continue;
        const id = `${pathId}-active`;
        abilityIds.push(id);
        abilities.push({
          id,
          name: change.boost.name,
          status: 'proposed',
          decisionRefs: [],
          description: `At tier ${level}: ${boostDescription(change.boost)} Later upgrades modify the fields stated in their tier benefits.`,
          availability: `${path.name}, tier ${level}. Manual activation.`,
          delivery: "Modifies this Unit's purchased base attack.",
          targeting: "Uses the purchased attack's targeting.",
          limitations:
            'No independent attack, extra actor, obstruction bypass or unpurchased upgrade is granted.',
          placement: 'upgrade',
          pathId,
          tier: level,
          mechanicIds: ['dsl-boost'],
          prerequisiteAbilityIds: [],
          evidence: pathEvidence,
        });
      }
      return {
        tier: level,
        name: tier.name,
        status: 'proposed' as const,
        decisionRefs: [],
        benefit: `${number(tier.cost)} ${definition.profile.currency}. ${changeDescriptions(tier.changes, before, after).join('; ')}.`,
        abilityIds,
        evidence: pathEvidence,
      };
    });
    return {
      id: pathId,
      name: path.name,
      theme: pathSummary(
        blueprint.baseAttack,
        resolveBuild(blueprint, selections(index, 5), definition),
      ),
      tiers,
    };
  });
  for (const [index, technique] of blueprint.reservedTechniques.entries()) {
    abilities.push({
      id: `reserved-${index + 1}`,
      name: technique.name,
      description: technique.reason,
      status: 'proposed',
      decisionRefs: [],
      availability: 'Not granted by any build.',
      delivery: 'Not implemented.',
      targeting: 'Not applicable.',
      limitations: 'Reserved for a later definition or design revision.',
      placement: 'reserved',
      pathId: null,
      tier: null,
      mechanicIds: [],
      prerequisiteAbilityIds: [],
      evidence: sourceIds,
    });
  }
  const mechanics: UnitCandidate['mechanics'] = [
    {
      id: 'dsl-attack',
      name: 'Attack and upgrade composition',
      status: 'specified',
      dependencies: [],
      evidence: [rule],
      requiredDecision: null,
      behavior:
        'Only purchased upgrades apply. Set operations replace the baseline; all additions then multipliers compose in canonical order. Detection and clear delivery are separate. Immunities and effect stacking follow the supplied definition. Upgrade before/after examples show the main path alone; crosspaths compose over the same base. All values are proposals.',
    },
  ];
  if (abilities.some((ability) => ability.placement === 'upgrade'))
    mechanics.push({
      id: 'dsl-boost',
      name: 'Manual attack boost',
      status: 'specified',
      dependencies: ['dsl-attack'],
      evidence: [rule],
      requiredDecision: null,
      behavior:
        'Ready on purchase; cooldown starts at activation. No reactivation while active. The boost applies to the purchased attack and expires without erasing its upgrades.',
    });
  for (const [index, proposal] of blueprint.proposals.entries())
    mechanics.push({
      id: `proposal-${index + 1}`,
      name: proposal.name,
      behavior: proposal.reason,
      status: 'proposed_extension',
      dependencies: [],
      evidence: sourceIds,
      requiredDecision:
        'Specify and approve a definition extension before including this behavior in a build.',
    });
  const builds = allLegalBuilds(definition).filter((build) => build.includes(5));
  return candidateSchema.parse({
    schemaVersion: '1',
    character: request.character,
    role: unitSummary(blueprint.baseAttack, definition),
    basicAttack: {
      name: blueprint.baseAttack.name,
      status: 'proposed',
      decisionRefs: [],
      behavior: `Placement: ${number(blueprint.baseAttack.cost)} ${definition.profile.currency}. ${attackDescription(blueprint.baseAttack)}`,
      delivery: `${blueprint.baseAttack.delivery}; ${blueprint.baseAttack.damageType} damage; clear delivery path required.`,
      targeting: `${blueprint.baseAttack.targeting}; ${blueprint.baseAttack.camo ? 'detects camo' : 'cannot detect camo'}.`,
      limitations:
        'Numeric values are proposed on the supplied starter scale. No Unit HP. Runtime integration and balance testing remain required.' +
        (historicalSources.length
          ? ' This draft includes a historical skill subset; current source-period availability is not established.'
          : ''),
      mechanicIds: ['dsl-attack'],
      evidence,
    },
    paths,
    abilities,
    mechanics,
    sources: sourceIds.map((id) => ({
      documentId: id,
      claims: blueprint.sourceFacts
        .filter((fact) => fact.documentId === id)
        .map((fact) => fact.quote),
      limitations: [
        request.documents.find((doc) => doc.id === id)?.origin.note ??
          'Supplied evidence supports character claims; game adaptations and values remain proposals.',
        `Authoring context included ${selectedEvidence.filter((span) => span.documentId === id).length} of ${availableEvidence.filter((span) => span.documentId === id).length} source passages. Full text remains in the request; selection does not establish exhaustive canon coverage.`,
      ].join(' '),
    })),
    constraintCoverage: blueprint.constraintCoverage,
    representativeBuilds: builds.map((selection) => ({
      name: selection.join('-'),
      selections: selection.map((tier, index) => ({ pathId: `path-${index + 1}`, tier })),
      rationale: `Total investment: ${number(resolveBuild(blueprint, selection, definition).cumulativeCost)} ${definition.profile.currency}. Computed from the purchased tiers; not a balance rating.`,
    })),
    unresolvedQuestions: historicalSources.map((source, index) => ({
      id: `source-period-${index + 1}`,
      question: `${source.technique} is listed under "Former" in its character source. This draft adapts that historical skill. Which source period should this Unit use? Current availability is not established.`,
      affected: `${source.technique} and the selected character scope`,
      evidence: [source.documentId],
    })),
    blueprint,
  });
}
