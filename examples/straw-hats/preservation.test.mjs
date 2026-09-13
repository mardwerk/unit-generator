import assert from 'node:assert/strict';
import test from 'node:test';
import { preserveDefinition, preservationIssues } from './preservation.mjs';

test('allows only exact cost pointers and rejects missing burns, prose and added fields', () => {
  const original = {
    description: 'Keep',
    paths: [{ upgrades: [{ cost: 100, description: 'Keep too' }] }],
    forms: [{ techniques: [{ delivery: 'direct-contact', onHit: [{ kind: 'burn', damage: 4 }] }] }]
  };
  const candidate = structuredClone(original);
  candidate.paths[0].upgrades[0].cost = 50;
  const allow = ['/paths/0/upgrades/0/cost'];
  assert.deepEqual(preservationIssues(original, candidate, allow), []);
  delete candidate.forms[0].techniques[0].onHit;
  delete candidate.paths[0].upgrades[0].description;
  candidate.paths[0].upgrades[0].costExtra = 1;
  assert.deepEqual(
    preservationIssues(original, candidate, allow)
      .map((i) => i.path)
      .sort(),
    [
      '/forms/0/techniques/0/onHit',
      '/paths/0/upgrades/0/costExtra',
      '/paths/0/upgrades/0/description'
    ]
  );
  assert.equal(original.paths[0].upgrades[0].cost, 100);
  assert.equal(
    preservationIssues(original, { ...candidate, paths: [] }, allow).some(
      (i) => i.path === '/paths/0'
    ),
    true
  );
  assert.throws(() => preservationIssues(original, original, ['/']), /non-root/);
  assert.throws(() => preservationIssues(original, original, ['/bad~2']), /JSON pointers/);
});

test('composes the existing constraint hook without mutating a frozen definition', () => {
  const definition = Object.freeze({
    validation: Object.freeze({
      constraints: (_candidate, input) => [
        { code: input.code, path: '', message: 'Existing check' }
      ]
    })
  });
  const wrapped = preserveDefinition(definition, { name: 'Keep' }, []);
  assert.deepEqual(
    wrapped.validation.constraints({ name: 'Changed' }, { code: 'original' }).map((i) => i.code),
    ['original', 'refinement-preservation']
  );
  assert.notEqual(wrapped, definition);
});

test('core validation rejects optional-effect loss through the ordinary constraints report', async () => {
  const { validate } = await import('../../packages/core/dist/index.js');
  const original = { cost: 100, onHit: [{ kind: 'burn', damage: 4 }] };
  const definition = preserveDefinition(
    {
      contractVersion: '0.2',
      id: 'preservation-test',
      version: '1',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      validation: {
        kind: 'trusted',
        checks: ['synthetic-contract'],
        uncheckedRules: [],
        validate: () => []
      }
    },
    original,
    ['/cost']
  );
  const report = await validate(definition, { cost: 50 }, {});
  assert.equal(report.structure.status, 'passed');
  assert.equal(report.system.status, 'passed');
  assert.equal(report.constraints.status, 'failed');
  assert.equal(report.constraints.issues[0].path, '/onHit');
  const preserved = await validate(definition, { cost: 50, onHit: original.onHit }, {});
  assert.equal(preserved.constraints.status, 'passed');
});
