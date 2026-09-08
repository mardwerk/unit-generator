import { describe, it, expect, vi } from 'vitest';
import {
  generate,
  validate,
  research,
  RunError,
  type Definition,
  type ModelAdapter,
  type SourceAdapter,
  type Source,
  type Knowledge
} from '../src/index.js';

const output = {
  type: 'object',
  additionalProperties: false,
  required: ['value'],
  properties: { value: { type: 'integer', minimum: 1 } }
};
const definition: Definition = {
  id: 'test',
  version: '1',
  contractVersion: '0.2',
  inputSchema: { type: 'object', additionalProperties: true },
  outputSchema: output,
  rules: 'Use positive numbers.',
  instructions: 'Return content.',
  validation: {
    kind: 'trusted',
    checks: ['even'],
    uncheckedRules: ['Enjoyment'],
    validate: (candidate) =>
      (candidate as { value: number }).value % 2
        ? [{ code: 'odd', path: '/value', message: 'Use an even number.' }]
        : []
  }
};
const fixture = (value: unknown): ModelAdapter => ({
  generate: vi.fn(async () => ({ value, mode: 'fixture' }))
});
const source: Source = {
  id: 'source-1',
  title: 'Hero',
  url: 'https://example.org/Hero',
  content: 'Hero protects allies. ' + 'Additional captured detail. '.repeat(1000),
  origin: 'retrieved',
  status: 'read',
  truncated: false,
  omissions: ['Navigation omitted.']
};
const knowledge: Knowledge = {
  subject: 'Hero',
  identity: {
    status: 'resolved',
    name: 'Hero',
    continuity: 'Original series',
    explanation: 'Source identifies this character.'
  },
  claims: [{ text: 'Protects allies.', sourceIds: ['source-1'], kind: 'evidence' }],
  gaps: []
};
function sources(): SourceAdapter {
  return {
    discover: vi.fn(async () => [{ url: source.url!, title: 'Hero', description: 'A character' }]),
    acquire: vi.fn(async (_urls, options) => {
      options.onSource(structuredClone(source));
    })
  };
}
describe('stateless definition runner', () => {
  it('enforces final semantic checks and repairs using the complete existing candidate', async () => {
    const model: ModelAdapter = {
      generate: vi.fn(async (call) => ({
        value: call.stage === 'repair' ? { value: 2 } : { value: 1 },
        mode: 'fixture'
      }))
    };
    const result = await generate(definition, {}, { model });
    expect(result.status).toBe('success');
    expect(result.output).toEqual({ value: 2 });
    expect(result.metadata.modelCalls).toBe(2);
    expect(result.metadata.repairs).toBe(1);
    expect(result.validation.balance.status).toBe('not-tested');
    expect(vi.mocked(model.generate).mock.calls[1]![0].input).toMatchObject({
      candidate: { value: 1 },
      issues: [{ code: 'odd' }]
    });
  });
  it('does not let workflow reports bypass validation and returns invalid candidates separately', async () => {
    const result = await generate(
      { ...definition, run: async () => ({ candidate: { value: 1 }, valid: true }) as never },
      {},
      { limits: { maxRepairs: 0 } }
    );
    expect(result.status).toBe('failed');
    expect(result.output).toBeUndefined();
    expect(result.candidate).toEqual({ value: 1 });
    expect(result.validation.system.status).toBe('failed');
  });
  it('permits a multi-stage workflow but reserves every call against one budget', async () => {
    const custom = {
      ...definition,
      run: async (_input: unknown, ctx: Parameters<NonNullable<Definition['run']>>[1]) => {
        for (let i = 0; i < 3; i++)
          await ctx.model({
            stage: `stage-${i}`,
            instructions: 'Draft',
            input: {},
            schema: output
          });
        return { candidate: { value: 2 } };
      }
    };
    expect(
      (await generate(custom, {}, { model: fixture({ value: 2 }), limits: { maxModelCalls: 3 } }))
        .status
    ).toBe('success');
    const model = fixture({ value: 2 });
    const limited = await generate(custom, {}, { model, limits: { maxModelCalls: 2 } });
    expect(limited.error?.code).toBe('model-call-limit');
    expect(model.generate).toHaveBeenCalledTimes(2);
  });
  it('uses no request cache for reused objects, clients, or concurrent calls', async () => {
    const model = fixture({ value: 2 });
    const request = {};
    const results = await Promise.all([
      generate(definition, request, { model }),
      generate(definition, request, { model })
    ]);
    await generate(definition, request, { model });
    expect(model.generate).toHaveBeenCalledTimes(3);
    expect(results.every((r) => r.metadata.modelCalls === 1)).toBe(true);
  });
  it('snapshots the input and effective schema before the first await', async () => {
    const request = { name: 'original' };
    const selected = structuredClone({
      ...definition,
      validation: { kind: 'schema-only', checks: [], uncheckedRules: [] }
    }) as Definition;
    const result = await generate(selected, request, {
      model: {
        generate: async () => {
          request.name = 'edited';
          (selected.outputSchema.properties as Record<string, unknown>).value = { type: 'string' };
          return { value: { value: 2 }, mode: 'fixture' };
        }
      }
    });
    expect(result.status).toBe('success');
    expect(result.input).toEqual({ name: 'original' });
  });
  it('reports schema-only rules honestly and missing original constraints as unchecked', async () => {
    const report = await validate(
      {
        ...definition,
        validation: { kind: 'schema-only', checks: [], uncheckedRules: ['All gameplay rules'] }
      },
      { value: 2 }
    );
    expect(report.system.status).toBe('not-provided');
    expect(report.constraints.status).toBe('not-provided');
    expect(report.uncheckedRules).toContain('All gameplay rules');
  });
  it('does not accept throwing or oversized validator reports', async () => {
    for (const validate of [
      () => {
        throw Error('secret');
      },
      () => Array.from({ length: 65 }, () => ({ code: 'x', path: '/', message: 'issue' }))
    ]) {
      const result = await generate(
        { ...definition, validation: { ...definition.validation, validate } },
        {},
        { model: fixture({ value: 2 }) }
      );
      expect(result.status).toBe('failed');
      expect(result.validation.system.status).toBe('not-completed');
      expect(result.output).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain('secret');
    }
  });
  it('uses the original schema for local references, unions, and meaningful nulls', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      required: ['value'],
      $defs: { nullable: { anyOf: [{ type: 'integer', minimum: 2 }, { type: 'null' }] } },
      properties: { value: { $ref: '#/$defs/nullable' } }
    };
    const selected = {
      ...definition,
      outputSchema: schema,
      validation: { kind: 'schema-only' as const, checks: [], uncheckedRules: [] }
    };
    expect((await generate(selected, {}, { model: fixture({ value: null }) })).output).toEqual({
      value: null
    });
    expect(
      (await generate(selected, {}, { model: fixture({ value: 1 }), limits: { maxRepairs: 0 } }))
        .status
    ).toBe('failed');
  });
});
describe('reusable research and partial results', () => {
  it('resolves name-only requests with authorized discovery and preserves full captured content', async () => {
    const adapter = sources();
    const model = fixture(knowledge);
    const result = await research(
      { subject: 'Hero' },
      { sources: adapter, model, policy: { network: 'allow', discovery: true } }
    );
    expect(result.status).toBe('success');
    expect(adapter.discover).toHaveBeenCalledTimes(1);
    expect(result.sources[0]!.content).toBe(source.content);
    const input = vi.mocked(model.generate).mock.calls[0]![0].input as {
      sources: { excerpt: string }[];
    };
    expect(input.sources[0]!.excerpt.length).toBe(12000);
    expect(result.sources[0]!.content.length).toBeGreaterThan(12000);
  });
  it('does not discover or fetch without permission and requires explicit ungrounded policy', async () => {
    const adapter = sources();
    const model = fixture(knowledge);
    const result = await research({ subject: 'Hero' }, { sources: adapter, model });
    expect(result.error?.code).toBe('research-not-authorized');
    expect(adapter.discover).not.toHaveBeenCalled();
    expect(model.generate).not.toHaveBeenCalled();
    const unknown = {
      ...knowledge,
      claims: [{ text: 'Model recollection.', sourceIds: [], kind: 'unverified' as const }]
    };
    expect(
      (
        await research(
          { subject: 'Hero' },
          { model: fixture(unknown), policy: { allowUngrounded: true } }
        )
      ).grounding
    ).toBe('ungrounded');
  });
  it('rejects ambiguous identity and nonexistent citations', async () => {
    for (const bad of [
      { ...knowledge, identity: { ...knowledge.identity, status: 'ambiguous' } },
      { ...knowledge, claims: [{ text: 'Claim', sourceIds: ['invented'], kind: 'evidence' }] }
    ]) {
      const result = await research(
        { subject: 'Hero', sources: [source] },
        { model: fixture(bad) }
      );
      expect(result.status).toBe('failed');
      expect(result.sources[0]!.content).toBe(source.content);
    }
  });
  it('preserves captured content when consolidation fails', async () => {
    const result = await research(
      { subject: 'Hero' },
      {
        sources: sources(),
        model: {
          generate: async () => {
            throw new RunError('provider-failed', 'Model unavailable.');
          }
        },
        policy: { network: 'allow', discovery: true }
      }
    );
    expect(result.status).toBe('failed');
    expect(result.sources[0]!.content).toBe(source.content);
  });
  it('preserves completed research when drafting fails and observers mutate or throw', async () => {
    const model: ModelAdapter = {
      generate: vi.fn(async (call) => {
        if (call.stage === 'research') return { value: knowledge, mode: 'fixture' };
        throw new RunError('provider-failed', 'Draft failed.');
      })
    };
    const selected = {
      ...definition,
      run: async (_input: unknown, ctx: Parameters<NonNullable<Definition['run']>>[1]) => {
        await ctx.research({ subject: 'Hero', sources: [source] });
        return {
          candidate: await ctx.model({
            stage: 'draft',
            instructions: 'Draft',
            input: {},
            schema: output
          })
        };
      }
    };
    const result = await generate(
      selected,
      {},
      {
        model,
        onProgress: (event) => {
          if (event.type === 'research') event.result.sources.length = 0;
          throw Error('observer');
        }
      }
    );
    expect(result.status).toBe('failed');
    expect(result.research[0]!.knowledge).toEqual(knowledge);
    expect(result.research[0]!.sources[0]!.content).toBe(source.content);
  });
  it('reuses research fifty times with network disabled and no consolidation calls', async () => {
    const saved = await research(
      { subject: 'Hero', sources: [source] },
      { model: fixture(knowledge) }
    );
    const model = fixture({ value: 2 });
    const adapter = sources();
    const selected = {
      ...definition,
      run: async (_input: unknown, ctx: Parameters<NonNullable<Definition['run']>>[1]) => {
        const reused = await ctx.research({ subject: 'Hero', knowledge: saved });
        if (reused.status !== 'success') throw Error('reuse');
        return {
          candidate: await ctx.model({
            stage: 'draft',
            instructions: 'Draft',
            input: {},
            schema: output
          })
        };
      }
    };
    for (let i = 0; i < 50; i++)
      expect((await generate(selected, {}, { model, sources: adapter })).status).toBe('success');
    expect(model.generate).toHaveBeenCalledTimes(50);
    expect(adapter.acquire).not.toHaveBeenCalled();
  });
  it('returns retained research on cooperative cancellation after acquisition', async () => {
    const controller = new AbortController();
    const result = await research(
      { subject: 'Hero', sources: [source] },
      {
        signal: controller.signal,
        model: {
          generate: async () => {
            controller.abort();
            throw Error('cancelled');
          }
        }
      }
    );
    expect(result.status).toBe('cancelled');
    expect(result.sources[0]!.content).toBe(source.content);
  });
});

it('shares source acquisition limits across concurrent research workflows', async () => {
  const result = await generate(
    {
      ...definition,
      run: async (_input, ctx) => {
        await Promise.all([
          ctx.research({ subject: 'Hero', sources: [source.url!] }),
          ctx.research({ subject: 'Hero', sources: [source.url!] })
        ]);
        return { candidate: { value: 2 } };
      }
    },
    {},
    {
      sources: {
        ...sources(),
        acquire: async (_urls, options) => {
          await Promise.resolve();
          options.onSource(structuredClone(source));
        }
      },
      model: fixture(knowledge),
      policy: { network: 'allow' },
      limits: { maxSources: 1 }
    }
  );
  expect(result.research.reduce((count, research) => count + research.sources.length, 0)).toBe(1);
  expect(result.research.some((research) => research.error?.code === 'source-limit')).toBe(true);
});

it('distinguishes deadline exhaustion from caller cancellation', async () => {
  const result = await generate(
    { ...definition, run: async () => new Promise(() => {}) },
    {},
    { limits: { timeoutMs: 10 } }
  );
  expect(result.error?.code).toBe('deadline');
  expect(result.output).toBeUndefined();
});

it('acquires explicitly supplied original-concept URLs only under authorized policy', async () => {
  const adapter = sources();
  const input = {
    subject: 'An invented sentinel',
    kind: 'original' as const,
    sources: [source.url!]
  };
  const denied = await research(input, { sources: adapter });
  expect(denied.error?.code).toBe('research-not-authorized');
  expect(adapter.acquire).not.toHaveBeenCalled();
  const allowed = await research(input, { sources: adapter, policy: { network: 'allow' } });
  expect(allowed.status).toBe('success');
  expect(allowed.sources[0]?.content).toBe(source.content);
  expect(adapter.discover).not.toHaveBeenCalled();
});

it('honors cancellation on standalone research and asynchronous validation', async () => {
  const cancelled = await research({ subject: 'Hero' }, { signal: AbortSignal.abort() });
  expect(cancelled.status).toBe('cancelled');
  expect(cancelled.error?.code).toBe('cancelled');
  const report = await validate(
    {
      ...definition,
      validation: { ...definition.validation, validate: async () => new Promise(() => {}) }
    },
    { value: 2 },
    {},
    AbortSignal.timeout(10)
  );
  expect(report.system.status).toBe('not-completed');
  expect(report.system.issues[0]?.code).toBe('cancelled');
});
