import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { generate, type ModelAdapter } from '@mardwerk/unit-core';
import { loadBundledDefinition } from '../src/index.js';
import {
  btd6UnitV2Schema,
  createBtd6FixtureV2,
  consumeBtd6EndpointReference
} from '../src/btd6-derived/index.js';
describe('public tower defense Definition', () => {
  it('researches an original subject before drafting and validates the generated V2 contract', async () => {
    const definition = await loadBundledDefinition('tower-defense');
    const calls: { stage: string; input: unknown }[] = [];
    const model: ModelAdapter = {
      generate: async (call) => {
        calls.push({ stage: call.stage, input: call.input });
        return { value: createBtd6FixtureV2('Original sentry'), mode: 'fixture' };
      }
    };
    const result = await generate(
      definition,
      { subject: 'Original sentry', kind: 'original' },
      { model }
    );
    expect(result.status).toBe('success');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      stage: 'draft',
      input: {
        characterEvidence: [
          { knowledge: { identity: { status: 'resolved', name: 'Original sentry' } } }
        ]
      }
    });
    expect(result.output).toMatchObject({ schemaVersion: 'btd6-derived/0.2' });
  });
  it('does not draft an existing subject when required research cannot be acquired', async () => {
    const definition = await loadBundledDefinition('tower-defense');
    let calls = 0;
    const result = await generate(
      definition,
      { subject: 'Existing subject' },
      {
        model: {
          generate: async () => {
            calls++;
            return { value: createBtd6FixtureV2(), mode: 'fixture' };
          }
        }
      }
    );
    expect(result.status).toBe('failed');
    expect(calls).toBe(0);
    expect(result.output).toBeUndefined();
  });
  it('ships the actual localized V2 output schema', async () => {
    const disk = JSON.parse(
      await readFile(
        new URL('../definitions/tower-defense/output.schema.json', import.meta.url),
        'utf8'
      )
    );
    delete disk.$id;
    delete disk.$schema;
    expect(disk).toEqual(JSON.parse(JSON.stringify(btd6UnitV2Schema)));
    expect(JSON.stringify(disk)).not.toContain('"$ref":"Shared');
  });
});
describe('captured endpoint reference transport', () => {
  const reference = () => ({
    schemaVersion: 'btd6-derived.endpoint-reference/0.2',
    translatorVersion: 'btd6-field-projection/0.2',
    modelContract: 'btd6-derived.model/0.2',
    qualification: 'field-projection-only',
    model: createBtd6FixtureV2().base,
    endpoint: {
      family: 'Synthetic',
      model: 'Synthetic',
      category: 'regular',
      tiers: [0, 0, 0],
      cost: 100,
      appliedUpgrades: [],
      upgrades: []
    },
    mappings: [{ target: '/displayRange', sources: ['/range'] }],
    gaps: [{ code: 'source-context', pointer: '', reason: 'Synthetic transport test.' }],
    sourceFacts: {
      root: { $ref: '' },
      nodes: [
        {
          pointer: '',
          kind: 'object',
          type: null,
          fields: { range: 40, values: { $ref: '/values' } }
        },
        { pointer: '/values', kind: 'array', type: null, fields: { '0': 1 } }
      ]
    },
    provenance: {
      snapshotId: 'synthetic',
      sourceRootHash: '0'.repeat(64),
      sourceArtifact: 'synthetic.json',
      sourceSha256: '0'.repeat(64),
      sourceGameVersion: 'test',
      sourceBuildId: 'test',
      evaluationPartition: 'all-units-exposed',
      sourceVersionQualification: 'static-export-version-unverified'
    },
    evidence: {
      sourceIntegrity: 'verified',
      localExecution: 'not-run',
      liveGameParity: false,
      goldReference: false
    }
  });
  it('validates the same model contract while preserving facts, gaps and unverified source execution', () => {
    const source = reference(),
      consumed = consumeBtd6EndpointReference(source);
    expect(consumed.reference.sourceFacts).toEqual(source.sourceFacts);
    expect(consumed.evidence.sourceIntegrityRechecked).toBe(false);
    source.model!.displayRange = 1;
    expect(consumed.reference.model!.displayRange).toBe(40);
  });
  it('rejects incompatible targets, dangling graph references and unsupported records without reasons', () => {
    expect(() => consumeBtd6EndpointReference({ ...reference(), modelContract: 'future' })).toThrow(
      'Unsupported'
    );
    const broken = reference();
    broken.sourceFacts.nodes[0]!.fields.values = { $ref: '/absent' };
    expect(() => consumeBtd6EndpointReference(broken)).toThrow('Invalid source fact reference');
    expect(() =>
      consumeBtd6EndpointReference({
        ...reference(),
        qualification: 'unsupported',
        model: null,
        gaps: []
      })
    ).toThrow('explicit gaps');
  });
});
