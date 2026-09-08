import { compileResolvedSelection, enumerateValidSelections } from './compiler.js';
import { validateUnitSpec } from './validation.js';
import { sortAndLimitIssues } from './schema-validation.js';
import { classicThreePathProfile, type ClassicProfile } from './profile.js';
import type { UnitSpec } from './schemas.js';
import type { UnitBuild, ValidationIssue } from './reports.js';
import type { NormalizedGenerationRequest } from './fixture.js';
const diagnostic = (code: string, path: string, message: string): ValidationIssue => ({
  code,
  path,
  message,
  category: 'mechanic'
});
const allows = (request: NormalizedGenerationRequest, mechanic: string) =>
  !request.constraints.excludedMechanics?.includes(mechanic) &&
  (!request.constraints.allowedMechanics ||
    request.constraints.allowedMechanics.includes(mechanic));
function usedMechanics(unit: UnitSpec): Set<string> {
  const effects = [
    ...unit.actions.flatMap((action) => action.effects),
    ...[...unit.upgradeGraph.nodes, ...unit.forms].flatMap((node) =>
      node.operations.flatMap((operation) =>
        operation.type === 'add-effect' ? [operation.effect] : []
      )
    )
  ];
  const used = new Set<string>(effects.map((effect) => effect.type));
  if (unit.resources.length) used.add('resource');
  if (unit.forms.length) used.add('form');
  if (unit.abilities.some((ability) => ability.type === 'active')) used.add('active-ability');
  if (unit.actions.some((action) => action.trigger.type === 'manual')) used.add('active-ability');
  if (unit.actions.some((action) => action.delivery.type.includes('projectile')))
    used.add('projectile');
  if (unit.actions.some((action) => action.delivery.type === 'beam')) used.add('beam');
  if (unit.actions.some((action) => action.targeting.maximumTargets > 1)) used.add('area');
  if (unit.statuses.some((status) => status.kind === 'slow' || status.kind === 'stun'))
    used.add('control');
  return used;
}
export function requestIssues(
  unit: UnitSpec,
  request: NormalizedGenerationRequest,
  profile: ClassicProfile = classicThreePathProfile
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const used = usedMechanics(unit);
  for (const mechanic of used)
    if (!allows(request, mechanic))
      issues.push(
        diagnostic(
          'CONSTRAINT_MECHANIC_DISALLOWED',
          '/',
          `Generated unit uses disallowed mechanic '${mechanic}'.`
        )
      );
  const activeCount = unit.abilities.filter((ability) => ability.type === 'active').length;
  if (
    request.constraints.nativeActiveLimit === 0 &&
    unit.actions.some((action) => action.trigger.type === 'manual')
  )
    issues.push(
      diagnostic(
        'CONSTRAINT_MANUAL_ACTION',
        '/actions',
        'Manually triggered actions are excluded by this request.'
      )
    );
  if (activeCount > (request.constraints.nativeActiveLimit ?? 1))
    issues.push(
      diagnostic(
        'CONSTRAINT_ACTIVE_LIMIT',
        '/abilities',
        'Unit exceeds the requested native active ability limit.'
      )
    );
  const prominentCount =
    unit.abilities.length +
    unit.forms.length +
    Number(used.has('control')) +
    Number(used.has('damage-over-time'));
  if (
    prominentCount >
    Math.min(
      request.constraints.complexity === 'low' ? 1 : profile.prominentMechanicLimit,
      request.constraints.prominentMechanicLimit ?? 3
    )
  )
    issues.push(
      diagnostic(
        'CONSTRAINT_COMPLEXITY_LIMIT',
        '/',
        'Unit exceeds the requested prominent mechanic limit.'
      )
    );
  for (const role of request.constraints.desiredRoles ?? [])
    if (!unit.roles.includes(role))
      issues.push(
        diagnostic('CONSTRAINT_ROLE_MISSING', '/roles', `Requested role '${role}' is absent.`)
      );
  for (const role of request.constraints.desiredRoles ?? []) {
    const supported =
      role === 'damage'
        ? used.has('damage')
        : role === 'control'
          ? used.has('control') || used.has('forced-movement')
          : role === 'economy'
            ? used.has('economy-change')
            : role === 'support'
              ? used.has('reveal') ||
                unit.statuses.some((status) => status.kind === 'vulnerability')
              : used.has('active-ability');
    if (!supported)
      issues.push(
        diagnostic(
          'CONSTRAINT_ROLE_UNSUPPORTED',
          '/roles',
          `Requested role '${role}' has no corresponding executable mechanic. Fixture mode offers damage and control roles; choose a configured model provider for another supported role.`
        )
      );
  }
  const band =
    profile.numericBands.placementCostCredits[request.constraints.placementCostBand ?? 'medium'];
  if (unit.economy.baseCostCredits < band[0] || unit.economy.baseCostCredits > band[1])
    issues.push(
      diagnostic(
        'CONSTRAINT_COST_BAND',
        '/economy/baseCostCredits',
        `Placement cost must be ${band[0]}..${band[1]} credits.`
      )
    );
  return issues;
}

function resolvedProfileIssues(
  build: UnitBuild,
  profile: ClassicProfile = classicThreePathProfile
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const inBand = (value: number, band: readonly [number, number], path: string) => {
    if (value < band[0] || value > band[1])
      issues.push(
        diagnostic(
          'PROFILE_NUMERIC_BAND',
          path,
          `Resolved value ${value} must be ${band[0]}..${band[1]} for build [${build.selection.join(', ')}]${build.selectedFormIds.length ? ` with form ${build.selectedFormIds.join(', ')}` : ''}.`
        )
      );
  };
  const bands = profile.numericBands;
  inBand(build.baseStats.rangeWorldUnits, bands.rangeWorldUnits, '/baseStats/rangeWorldUnits');
  for (const action of build.actions) {
    inBand(
      action.rangeWorldUnits ?? build.baseStats.rangeWorldUnits,
      action.targeting.type === 'self' ? bands.selfRangeWorldUnits : bands.rangeWorldUnits,
      `/actions/${action.id}/rangeWorldUnits`
    );
    // Interval is the scheduling floor; effective attack cadence also respects cooldown.
    if (action.trigger.type === 'interval')
      inBand(
        Math.max(action.trigger.intervalSeconds, action.timing.cooldownSeconds),
        bands.attackIntervalSeconds,
        `/actions/${action.id}/timing/cooldownSeconds`
      );
    for (const effect of action.effects)
      if ('durationSeconds' in effect)
        inBand(
          effect.durationSeconds,
          bands.effectDurationSeconds,
          `/actions/${action.id}/effects/${effect.id}/durationSeconds`
        );
    if (action.delivery.lifetimeSeconds !== undefined)
      inBand(
        action.delivery.lifetimeSeconds,
        bands.effectDurationSeconds,
        `/actions/${action.id}/delivery/lifetimeSeconds`
      );
  }
  return issues;
}

export function checkClassic(
  input: unknown,
  profile: ClassicProfile = classicThreePathProfile
): ValidationIssue[] {
  const validation = validateUnitSpec(input);
  if (!validation.valid || !validation.value) return validation.issues;
  const unit = validation.value;
  const issues: ValidationIssue[] = [];
  if (
    unit.abilities.filter((ability) => ability.type === 'active').length >
      profile.nativeActiveLimit ||
    (profile.nativeActiveLimit === 0 &&
      unit.actions.some((action) => action.trigger.type === 'manual'))
  )
    issues.push(
      diagnostic(
        'CLASSIC_MANUAL_LIMIT',
        '/abilities',
        'The definition manual-ability limit was exceeded.'
      )
    );
  const mechanics = usedMechanics(unit);
  if (
    unit.abilities.length +
      unit.forms.length +
      Number(mechanics.has('control')) +
      Number(mechanics.has('damage-over-time')) >
    profile.prominentMechanicLimit
  )
    issues.push(
      diagnostic(
        'CLASSIC_MECHANIC_LIMIT',
        '/',
        'The definition prominent-mechanic limit was exceeded.'
      )
    );
  for (const ability of unit.abilities) {
    if (
      ability.type === 'automatic' &&
      unit.actions.find((action) => action.id === ability.actionId)?.trigger.type !== 'interval'
    )
      issues.push(
        diagnostic(
          'CLASSIC_AUTOMATIC_TRIGGER',
          '/abilities',
          'Automatic abilities require interval-triggered actions.'
        )
      );
  }
  {
    if (unit.upgradeGraph.profile !== 'classic-three-path')
      issues.push(
        diagnostic(
          'PROFILE_MISMATCH',
          '/upgradeGraph/profile',
          'Generation requires the classic-three-path profile, including its declared identifier.'
        )
      );
    const rules = unit.upgradeGraph.selectionRules;
    if (
      rules.maximumPrimaryPathTier !== 5 ||
      rules.maximumCrossPathTier !== 2 ||
      rules.maximumCrossPaths !== 1 ||
      rules.maximumSelectedNodes !== 7
    )
      issues.push(
        diagnostic(
          'PROFILE_SELECTION_RULES',
          '/upgradeGraph/selectionRules',
          'classic-three-path requires primary tier 5, one crosspath through tier 2 and at most 7 purchased nodes.'
        )
      );
    if (unit.upgradeGraph.paths.length !== 3)
      issues.push(
        diagnostic(
          'PROFILE_PATH_COUNT',
          '/upgradeGraph/paths',
          'classic-three-path requires three paths.'
        )
      );
    for (const path of unit.upgradeGraph.paths) {
      const nodes = unit.upgradeGraph.nodes
        .filter((node) => node.path === path.id)
        .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
      if (nodes.length !== 5 || nodes.some((node, index) => node.tier !== index + 1))
        issues.push(
          diagnostic(
            'PROFILE_TIERS',
            '/upgradeGraph/nodes',
            `Path '${path.id}' requires five consecutive tiers.`
          )
        );
      if (
        nodes.some(
          (node, index) =>
            node.costCredits <= 0 ||
            (index > 0 && node.costCredits <= nodes[index - 1]!.costCredits)
        )
      )
        issues.push(
          diagnostic(
            'PROFILE_COST_ORDER',
            '/upgradeGraph/nodes',
            `Path '${path.id}' requires positive increasing costs.`
          )
        );
    }
  }
  for (const path of unit.upgradeGraph.paths) {
    const ownNodes = unit.upgradeGraph.nodes.filter((node) => node.path === path.id);
    const ownIds = new Set(ownNodes.map((node) => node.id));
    if (ownNodes.some((node) => node.prerequisites.some((id) => !ownIds.has(id))))
      issues.push(
        diagnostic(
          'PROFILE_PATH_DEPENDENCY',
          '/upgradeGraph/nodes',
          `Path '${path.id}' depends on an unpurchased crosspath.`
        )
      );
    const independent = compileResolvedSelection(unit, { upgradeIds: [...ownIds] });
    if (!independent.ok)
      issues.push(
        diagnostic(
          'PROFILE_PATH_NOT_INDEPENDENT',
          '/upgradeGraph/nodes',
          `Path '${path.id}' cannot reach tier 5 independently: ${independent.issues[0]?.message ?? 'illegal build'}`
        )
      );
  }
  if (issues.length) return issues;
  try {
    const selections = enumerateValidSelections(unit, 1000);
    for (const selection of selections) {
      const compiled = compileResolvedSelection(unit, selection);
      if (!compiled.ok) {
        issues.push(...compiled.issues);
        continue;
      }
      issues.push(...resolvedProfileIssues(compiled.build, profile));
    }
    if (issues.length) return sortAndLimitIssues(issues);
  } catch {
    issues.push(
      diagnostic('VALIDATION_INCOMPLETE', '/', 'Legal build enumeration did not complete.')
    );
  }
  return sortAndLimitIssues(issues);
}
