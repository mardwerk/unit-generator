import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from '../../../packages/core/dist/index.js';
import { classicFixture, loadBundledDefinition } from '../../../packages/definitions/dist/index.js';
import { createPrototype } from './prototype.mjs';

const subject = 'Clockwork sentry';
const input = {
  subject,
  kind: 'original',
  knowledge: {
    schemaVersion: '0.2',
    status: 'success',
    subject,
    sources: [],
    reused: false,
    grounding: 'original-concept',
    gaps: [],
    knowledge: {
      subject,
      identity: {
        status: 'resolved',
        name: subject,
        continuity: 'Original',
        explanation: 'Offline fixture.'
      },
      claims: [{ text: 'A clockwork sentry.', sourceIds: [], kind: 'original-concept' }],
      gaps: []
    }
  }
};
const valid = classicFixture(input);
const critique = {
  preserve: ['Keep the clockwork concept.'],
  findings: [],
  uncertainties: ['No player preference evidence.']
};
async function runCase(values) {
  const artifactDir = await mkdtemp(fileURLToPath(new URL('./smoke-artifacts-', import.meta.url)));
  const definition = await createPrototype({ artifactDir });
  const stages = [];
  const result = await generate(definition, input, {
    limits: { maxModelCalls: 4, maxRepairs: 8 },
    model: {
      async generate(call) {
        stages.push(call.stage);
        assert.ok(values.length, 'Unexpected extra model call');
        return { mode: 'fixture', value: structuredClone(values.shift()) };
      }
    }
  });
  const artifact = async (name) =>
    JSON.parse(await readFile(join(artifactDir, name + '.json'), 'utf8'));
  return { result, stages, artifact, definition };
}
test('valid draft receives real diagnostics and exactly one revision', async () => {
  const { result, stages, artifact, definition } = await runCase([valid, critique, valid]);
  assert.equal(result.status, 'success', JSON.stringify(result.error));
  assert.deepEqual(stages, ['draft', 'critique', 'revision']);
  const report = await artifact('02-mechanical-review');
  assert.equal(report.status, 'complete');
  assert.ok(report.diagnostics);
  assert.ok(report.simulations.length > 0);
  assert.deepEqual(await artifact('01-draft'), valid);
  assert.deepEqual(await artifact('04-revision'), valid);
  const base = await loadBundledDefinition();
  assert.deepEqual(definition.outputSchema, base.outputSchema);
  assert.equal(definition.validation.validate.toString(), base.validation.validate.toString());
});
test('invalid draft skips diagnostics and revision repairs it without an extra call', async () => {
  const invalid = { id: 'broken-draft' };
  const { result, stages, artifact } = await runCase([invalid, critique, valid]);
  assert.equal(result.status, 'success', JSON.stringify(result.error));
  assert.deepEqual(stages, ['draft', 'critique', 'revision']);
  const report = await artifact('02-mechanical-review');
  assert.equal(report.status, 'unavailable');
  assert.equal(report.diagnostics, null);
  assert.equal(report.simulations, null);
  assert.equal(report.validation.structure.status, 'failed');
  assert.deepEqual(await artifact('01-draft'), invalid);
});
test('one mechanical repair is the fourth and final call even when still invalid', async () => {
  const invalid = { id: 'still-broken' };
  const { result, stages, artifact } = await runCase([invalid, critique, invalid, invalid]);
  assert.equal(result.status, 'failed');
  assert.equal(result.metadata.repairs, 1);
  assert.equal(result.metadata.modelCalls, 4);
  assert.deepEqual(stages, ['draft', 'critique', 'revision', 'repair']);
  assert.deepEqual(result.candidate, invalid);
  assert.deepEqual(await artifact('04-revision'), invalid);
  assert.deepEqual(await artifact('06-mechanical-repair'), invalid);
});
test('malformed critique fails without a retry and preserves the initial draft', async () => {
  const { result, stages, artifact } = await runCase([{ id: 'broken' }, {}]);
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'invalid-critique');
  assert.deepEqual(stages, ['draft', 'critique']);
  assert.deepEqual(await artifact('01-draft'), { id: 'broken' });
  assert.deepEqual(await artifact('03-critique'), {});
});
