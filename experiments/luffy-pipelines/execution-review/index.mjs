import {
  compileResolvedSelection,
  fingerprintUnitBuild,
  validateBuildSelection,
  validateUnitSpec
} from '../../../packages/definitions/dist/diagnostics.js';
import { representativeSelections } from '../../../packages/unit-lab/dist/benchmark.js';

const selectionOf = ({ upgradeIds, formIds = [] }) => ({
  upgradeIds: [...upgradeIds].sort(),
  formIds: [...formIds].sort()
});
const keyOf = (selection) => JSON.stringify(selectionOf(selection));
const timingOf = (action) => ({
  cooldownSeconds: action.timing.cooldownSeconds,
  trigger: structuredClone(action.trigger),
  effectiveIntervalSeconds: Math.max(action.trigger.intervalSeconds, action.timing.cooldownSeconds),
  windupSeconds: action.timing.windupSeconds,
  unlockedByDefault: action.unlockedByDefault
});
const inventory = (action) => ({
  actionId: action.id,
  trigger: structuredClone(action.trigger),
  scheduledAsPrimaryInterval: action.unlockedByDefault && action.trigger.type === 'interval',
  effectIds: action.effects.map((effect) => effect.id),
  effectTypes: [...new Set(action.effects.map((effect) => effect.type))].sort()
});

/** Deterministic execution facts, without a quality score or source interpretation. */
export function inspectExecution(unit) {
  const report = {
    protocolVersion: 'execution-review-0.1',
    status: 'unchecked',
    validationIssues: [],
    compilationIssues: [],
    findings: [],
    formInventory: [],
    coverage: {
      representativeSelections: [],
      compiledSelections: [],
      upgradeComparisons: [],
      formComparisons: [],
      excludedParents: [],
      excludedForms: [],
      cooldownReductionsOutsidePrimaryIntervalScope: []
    },
    mechanism: {
      expression: 'max(action.trigger.intervalSeconds, action.timing.cooldownSeconds)',
      scope:
        'Recurring scheduled attempts for actions enabled as primary interval actions in both compiled builds.',
      source: 'packages/definitions/src/classic/simulator.ts',
      symbols: ['actionPeriod', 'initial build.actions scheduling loop', "case 'action'"]
    },
    limits: [
      'A finding concerns the scheduled attempt period, not total upgrade value, successful attacks, DPS, source fidelity, or player preference.',
      'Windup delays resolution independently. Target availability, resource costs, conditions, state interactions, and scenario duration can change observed effects.',
      'Abilities use a separate cooldown rule; secondary actions and summons have separate invocation paths. A masked primary period does not establish inactivity through those paths.',
      'Non-interval or disabled actions are outside cadence findings. Newly enabled interval actions have a new schedule, not a before/after cadence comparison.',
      'Coverage samples representative builds and valid single-upgrade removals, plus single forms on representative upgrade selections. It does not enumerate every legal selection or form combination.',
      'Forms are compiled encounter selections. Their inventory does not prove runtime activation or satisfaction of runtime requirements.',
      'Primary targeting and collateral projectile pierce are separate simulator mechanisms. No combined target cap is inferred.'
    ]
  };
  const validation = validateUnitSpec(unit);
  report.validationIssues = validation.issues;
  if (!validation.valid) return { ...report, status: 'invalid-unit' };
  unit = validation.value;
  const cache = new Map();
  const compile = (choice) => {
    const selection = selectionOf(choice);
    const key = keyOf(selection);
    if (!cache.has(key)) {
      const result = compileResolvedSelection(unit, selection);
      cache.set(key, result);
      if (result.ok)
        report.coverage.compiledSelections.push({
          selection,
          buildFingerprint: fingerprintUnitBuild(result.build)
        });
      else report.compilationIssues.push({ selection, issues: result.issues });
    }
    return cache.get(key);
  };
  const evidence = (selection, build) => ({
    selection: selectionOf(selection),
    buildFingerprint: fingerprintUnitBuild(build)
  });
  const compare = (beforeSelection, afterSelection, change) => {
    const before = compile(beforeSelection),
      after = compile(afterSelection);
    if (!before.ok || !after.ok) return null;
    const edge = {
      change,
      before: evidence(beforeSelection, before.build),
      after: evidence(afterSelection, after.build)
    };
    const previous = new Map(before.build.actions.map((action) => [action.id, action]));
    for (const action of after.build.actions) {
      const parent = previous.get(action.id);
      if (!parent || action.timing.cooldownSeconds >= parent.timing.cooldownSeconds) continue;
      if (
        !parent.unlockedByDefault ||
        !action.unlockedByDefault ||
        parent.trigger.type !== 'interval' ||
        action.trigger.type !== 'interval'
      ) {
        report.coverage.cooldownReductionsOutsidePrimaryIntervalScope.push({
          ...edge,
          actionId: action.id
        });
        continue;
      }
      const beforeTiming = timingOf(parent),
        afterTiming = timingOf(action);
      const masked = beforeTiming.effectiveIntervalSeconds === afterTiming.effectiveIntervalSeconds;
      report.findings.push({
        code: masked ? 'COOLDOWN_REDUCTION_MASKED_BY_INTERVAL' : 'INTERVAL_SCHEDULE_PERIOD_CHANGED',
        actionId: action.id,
        change,
        before: { ...edge.before, ...beforeTiming },
        after: { ...edge.after, ...afterTiming },
        triggerUnchanged: JSON.stringify(parent.trigger) === JSON.stringify(action.trigger),
        scheduledPeriodDeltaSeconds:
          afterTiming.effectiveIntervalSeconds - beforeTiming.effectiveIntervalSeconds,
        scope: 'primary-interval-scheduled-attempts',
        statement: masked
          ? 'Cooldown decreased, but the primary interval schedule period is unchanged.'
          : 'Cooldown decreased and the primary interval schedule period changed.'
      });
    }
    return { edge, before: before.build, after: after.build };
  };

  const representatives = representativeSelections(unit).map(selectionOf);
  report.coverage.representativeSelections = representatives;
  // Form-free comparisons isolate an upgrade even when representatives select granted forms.
  const choices = new Map();
  for (const selection of representatives) {
    choices.set(keyOf(selection), selection);
    const withoutForms = selectionOf({ upgradeIds: selection.upgradeIds });
    choices.set(keyOf(withoutForms), withoutForms);
  }
  for (const child of choices.values()) {
    compile(child);
    for (const upgradeId of child.upgradeIds) {
      const parent = { ...child, upgradeIds: child.upgradeIds.filter((id) => id !== upgradeId) };
      const issues = validateBuildSelection(unit, parent);
      if (issues.length) {
        report.coverage.excludedParents.push({
          selection: parent,
          childSelection: child,
          removedUpgradeId: upgradeId,
          issues
        });
        continue;
      }
      const node = unit.upgradeGraph.nodes.find((node) => node.id === upgradeId);
      const result = compare(parent, child, {
        type: 'upgrade',
        upgradeId,
        operations: structuredClone(node.operations)
      });
      if (result) report.coverage.upgradeComparisons.push(result.edge);
    }
  }
  const upgradeSelections = new Map(
    representatives.map((selection) => {
      const choice = selectionOf({ upgradeIds: selection.upgradeIds });
      return [keyOf(choice), choice];
    })
  );
  for (const parent of upgradeSelections.values()) {
    for (const form of unit.forms) {
      const child = { ...parent, formIds: [form.id] };
      const issues = validateBuildSelection(unit, child);
      if (issues.length) {
        report.coverage.excludedForms.push({ selection: child, formId: form.id, issues });
        continue;
      }
      const result = compare(parent, child, {
        type: 'form',
        formId: form.id,
        operations: structuredClone(form.operations)
      });
      if (!result) continue;
      report.coverage.formComparisons.push(result.edge);
      const enabledBefore = result.before.actions.filter((action) => action.unlockedByDefault);
      const enabledAfter = result.after.actions.filter((action) => action.unlockedByDefault);
      const beforeIds = new Set(enabledBefore.map((action) => action.id));
      const afterIds = new Set(enabledAfter.map((action) => action.id));
      report.formInventory.push({
        formId: form.id,
        before: result.edge.before,
        after: result.edge.after,
        enabledBefore: enabledBefore.map(inventory),
        enabledAfter: enabledAfter.map(inventory),
        newlyEnabledActions: enabledAfter
          .filter((action) => !beforeIds.has(action.id))
          .map(inventory),
        disabledActionIds: [...beforeIds].filter((id) => !afterIds.has(id))
      });
    }
  }
  report.status = report.compilationIssues.length ? 'partial' : 'complete-sampled-inspection';
  return report;
}
