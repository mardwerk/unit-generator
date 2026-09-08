import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileResolvedSelection,
  generateFixtureUnit,
  simulateBuild,
  validateUnitSpec
} from '../../../packages/definitions/dist/diagnostics.js';
import { inspectExecution } from './index.mjs';

function fixture(triggerIntervalSeconds = 2) {
  const unit = generateFixtureUnit({
    concept: 'Offline cadence fixture',
    seed: 17,
    constraints: { allowedMechanics: [] }
  });
  const action = unit.actions.find((action) => action.unlockedByDefault);
  action.trigger.intervalSeconds = triggerIntervalSeconds;
  action.timing.cooldownSeconds = 2;
  const node = unit.upgradeGraph.nodes.find((node) =>
    node.operations.some((operation) => operation.parameter === 'cooldownSeconds')
  );
  node.operations = [
    {
      type: 'modify-action',
      actionId: action.id,
      parameter: 'cooldownSeconds',
      operation: 'multiply',
      value: 0.5
    }
  ];
  return { unit, action, node };
}
const scenario = {
  schemaVersion: '0.1',
  id: 'offline-cadence',
  purpose: 'Count direct attacks with a continuously available target.',
  durationSeconds: 10,
  seed: 17,
  abilityPolicy: 'never',
  enemies: [
    {
      id: 'stationary',
      spawnSeconds: 0,
      startDistanceWorldUnits: 5,
      speedWorldUnitsPerSecond: 0,
      healthHitPoints: 100000,
      tags: [],
      resistances: {}
    }
  ]
};
function simulationPair(unit, node) {
  assert.equal(validateUnitSpec(unit).valid, true, JSON.stringify(validateUnitSpec(unit).issues));
  return [{ upgradeIds: [] }, { upgradeIds: [node.id] }].map((selection) => {
    const result = compileResolvedSelection(unit, selection);
    assert.equal(result.ok, true, JSON.stringify(result.issues));
    const simulation = simulateBuild(result.build, scenario);
    assert.deepEqual(simulation.warnings, []);
    return simulation;
  });
}
const firstEdge = (report, node) =>
  report.findings.find(
    (finding) =>
      finding.change.upgradeId === node.id && finding.before.selection.upgradeIds.length === 0
  );

test('masked cooldown upgrade produces identical real simulated attacks', () => {
  const { unit, action, node } = fixture();
  const original = structuredClone(unit);
  const review = inspectExecution(unit);
  assert.equal(review.status, 'complete-sampled-inspection');
  const finding = firstEdge(review, node);
  assert.equal(finding.code, 'COOLDOWN_REDUCTION_MASKED_BY_INTERVAL');
  assert.equal(finding.actionId, action.id);
  assert.equal(finding.before.cooldownSeconds, 2);
  assert.equal(finding.after.cooldownSeconds, 1);
  assert.equal(finding.before.trigger.intervalSeconds, 2);
  assert.equal(finding.after.trigger.intervalSeconds, 2);
  assert.equal(finding.before.effectiveIntervalSeconds, 2);
  assert.equal(finding.after.effectiveIntervalSeconds, 2);
  assert.notEqual(finding.before.buildFingerprint, finding.after.buildFingerprint);
  const [before, after] = simulationPair(unit, node);
  assert.equal(before.hits, 6);
  assert.equal(after.hits, 6);
  assert.equal(before.damageHitPoints, 6 * action.effects[0].amountHitPoints);
  const { buildFingerprint: beforeFingerprint, ...beforeBehavior } = before;
  const { buildFingerprint: afterFingerprint, ...afterBehavior } = after;
  assert.notEqual(beforeFingerprint, afterFingerprint);
  assert.deepEqual(afterBehavior, beforeBehavior);
  assert.deepEqual(unit, original, 'Inspection must not mutate the candidate');
});

test('lower trigger floor lets the same cooldown operation produce more simulated attacks', () => {
  const { unit, action, node } = fixture(0.05);
  const finding = firstEdge(inspectExecution(unit), node);
  assert.equal(finding.code, 'INTERVAL_SCHEDULE_PERIOD_CHANGED');
  assert.equal(finding.before.effectiveIntervalSeconds, 2);
  assert.equal(finding.after.effectiveIntervalSeconds, 1);
  const [before, after] = simulationPair(unit, node);
  assert.equal(before.hits, 6);
  assert.equal(after.hits, 11);
  assert.equal(
    after.damageHitPoints - before.damageHitPoints,
    5 * action.effects[0].amountHitPoints
  );
});

test('windup still delays resolution independently of the masked period', () => {
  const { unit, action, node } = fixture();
  action.timing.windupSeconds = 0.25;
  const finding = firstEdge(inspectExecution(unit), node);
  assert.equal(finding.code, 'COOLDOWN_REDUCTION_MASKED_BY_INTERVAL');
  assert.equal(finding.after.windupSeconds, 0.25);
  const [before, after] = simulationPair(unit, node);
  assert.equal(before.hits, 5);
  assert.equal(after.hits, 5);
  assert.equal(after.damageHitPoints, before.damageHitPoints);
  assert.equal(after.firstEffectSeconds, 0.25);
});

test('disabled actions have no primary cadence finding', () => {
  const { unit, action, node } = fixture();
  action.unlockedByDefault = false;
  const report = inspectExecution(unit);
  assert.equal(report.status, 'complete-sampled-inspection');
  assert.equal(firstEdge(report, node), undefined);
  assert.ok(
    report.coverage.cooldownReductionsOutsidePrimaryIntervalScope.some(
      (edge) => edge.actionId === action.id
    )
  );
});

test('form inventory reports actual enabled-set differences', () => {
  const { unit, action } = fixture();
  const disabled = unit.actions.find((action) => !action.unlockedByDefault);
  for (const node of unit.upgradeGraph.nodes)
    node.operations = node.operations.map((operation) =>
      operation.type === 'enable-action' && operation.actionId === disabled.id
        ? {
            type: 'modify-effect',
            actionId: disabled.id,
            effectId: disabled.effects[0].id,
            parameter: 'amountHitPoints',
            operation: 'multiply',
            value: 1.1
          }
        : operation
    );
  unit.forms = [
    {
      id: 'offline-form',
      name: 'Offline form',
      summary: 'Enable an additional action.',
      externallyUnlocked: true,
      requirements: [],
      activation: 'external',
      persistence: 'encounter',
      reversion: 'none',
      operations: [
        {
          type: 'modify-action',
          actionId: action.id,
          parameter: 'cooldownSeconds',
          operation: 'multiply',
          value: 0.9
        },
        { type: 'enable-action', actionId: disabled.id }
      ]
    }
  ];
  const report = inspectExecution(unit);
  assert.equal(report.status, 'complete-sampled-inspection', JSON.stringify(report));
  const base = report.formInventory.find((entry) => entry.before.selection.upgradeIds.length === 0);
  assert.deepEqual(
    base.newlyEnabledActions.map((entry) => entry.actionId),
    [disabled.id]
  );
  assert.deepEqual(base.newlyEnabledActions[0].effectTypes, ['damage']);
  assert.equal(base.newlyEnabledActions[0].scheduledAsPrimaryInterval, true);
  assert.ok(base.enabledBefore.some((entry) => entry.actionId === action.id));
  assert.ok(base.enabledAfter.some((entry) => entry.actionId === action.id));
  unit.forms[0].operations.push({ type: 'enable-action', actionId: action.id });
  const invalid = inspectExecution(unit);
  assert.equal(
    invalid.status,
    'invalid-unit',
    'Redundant enablement must keep failing real validation'
  );
  assert.deepEqual(invalid.formInventory, []);
});

test('invalid raw candidates stop before compilation without repair', () => {
  const report = inspectExecution({ actions: [] });
  assert.equal(report.status, 'invalid-unit');
  assert.ok(report.validationIssues.length > 0);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.coverage.compiledSelections, []);
});
