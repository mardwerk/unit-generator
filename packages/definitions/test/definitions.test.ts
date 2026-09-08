import { describe, it, expect } from 'vitest';
import { generate, validate, type ModelAdapter } from '@mardwerk/unit-core';
import {
  loadBundledDefinition,
  classicFixture,
  mergeFixture,
  attachClassic
} from '../src/index.js';
import { readFile } from 'node:fs/promises';
const model = (value: unknown): ModelAdapter => ({
  generate: async () => ({ value, mode: 'fixture' })
});
describe('interchangeable definitions', () => {
  it('includes conditional delivery requirements in model-facing schema feedback', async () => {
    const definition = await loadBundledDefinition();
    const input = { subject: 'Zone caster', kind: 'original' as const };
    const candidate = classicFixture(input);
    candidate.actions[0]!.delivery = {
      id: 'zone-delivery',
      type: 'zone',
      maximumTargetsPerProjectile: 1,
      radiusWorldUnits: 5
    };
    const report = await validate(definition, candidate, input);
    expect(report.structure.status).toBe('failed');
    expect(report.structure.issues.some((issue) => issue.message.includes('lifetimeSeconds'))).toBe(
      true
    );
  });
  it('generates a tower and a family through the same runner', async () => {
    const classic = await loadBundledDefinition();
    const merge = await loadBundledDefinition('merge-family-example');
    const input = { subject: 'Clockwork sentry', kind: 'original' as const };
    const [a, b] = await Promise.all([
      generate(classic, input, { model: model(classicFixture(input)) }),
      generate(merge, { brief: 'Sentinel' }, { model: model(mergeFixture()) })
    ]);
    expect(a.status).toBe('success');
    expect(b.status).toBe('success');
    expect(b.research).toEqual([]);
    expect(b.output).not.toHaveProperty('upgradeGraph');
    expect(a.validation.balance.status).toBe('not-tested');
  });
  it('rejects unresolved merge destinations and unknown recipe members', async () => {
    const definition = await loadBundledDefinition('merge-family-example');
    const candidate = mergeFixture();
    candidate.units[0]!.next = 'missing';
    candidate.recipes = [{ ingredients: ['nonexistent', 'sentinel-1'], result: 'sentinel-2' }];
    const report = await validate(definition, candidate, { brief: 'Sentinel' });
    expect(report.system.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['missing-destination', 'missing-recipe-unit'])
    );
  });
  it('resolves destinations using supplied roster context and respects rank constraints', async () => {
    const definition = await loadBundledDefinition('merge-family-example');
    const family = mergeFixture();
    const destination = family.units.pop()!;
    expect(
      (await validate(definition, family, { brief: 'Sentinel', context: { units: [destination] } }))
        .system.status
    ).toBe('passed');
    expect(
      (
        await validate(definition, mergeFixture(), {
          brief: 'Sentinel',
          constraints: { maxRank: 1 }
        })
      ).constraints.status
    ).toBe('failed');
  });
  it('checks default hard constraints and invalid crosspaths without combat simulation', async () => {
    const definition = await loadBundledDefinition();
    const input = { subject: 'Goblin cannon', kind: 'original' as const };
    const candidate = classicFixture(input);
    candidate.upgradeGraph.selectionRules.maximumCrossPaths = 2;
    expect((await validate(definition, candidate, input)).system.status).toBe('failed');
    const result = await generate(
      definition,
      { ...input, constraints: { allowedMechanics: ['imaginary'] } },
      { model: model(candidate) }
    );
    expect(result.error?.code).toBe('invalid-input');
    expect(result.metadata.modelCalls).toBe(0);
  });
  it('uses resolved editable numeric limits for instructions and validation', async () => {
    const original = await loadBundledDefinition();
    const edited = attachClassic({
      ...original,
      configuration: { maxRange: 20, maxManualAbilities: 0, maxProminentMechanics: 3 }
    });
    expect(edited.rules).toContain('"rangeWorldUnits":[8,20]');
    const input = { subject: 'Clockwork sentry', kind: 'original' as const };
    const manualCandidate = classicFixture(input);
    expect(
      (await validate(edited, manualCandidate)).system.issues.some(
        (i) => i.code === 'CLASSIC_MANUAL_LIMIT'
      )
    ).toBe(true);
    const candidate = classicFixture({ ...input, constraints: { noManualAbilities: true } });
    candidate.baseStats.rangeWorldUnits = 30;
    expect(
      (await validate(edited, candidate, input)).system.issues.some(
        (i) => i.code === 'PROFILE_NUMERIC_BAND'
      )
    ).toBe(true);
  });
  it('validates all bundled reference and held-out examples', async () => {
    const definition = await loadBundledDefinition();
    const held = JSON.parse(await readFile('definitions/classic-three-path/held-out.json', 'utf8'));
    for (const example of [...definition.examples!, ...held] as {
      request: unknown;
      output: unknown;
    }[]) {
      const report = await validate(definition, example.output, example.request);
      expect(report.system.issues).toEqual([]);
      expect(report.constraints.issues).toEqual([]);
    }
  }, 30000);
});
