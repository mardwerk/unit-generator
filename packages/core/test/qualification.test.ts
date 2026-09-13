import { describe, expect, it, vi } from 'vitest';
import {
  generate,
  research,
  reviewCandidateSources,
  validate,
  RunError,
  type Definition,
  type Execution,
  type QualificationReport,
  type ResearchResult
} from '../src/index.js';

const definition: Definition = {
  id: 'assessment-order',
  version: '1',
  contractVersion: '0.2',
  inputSchema: { type: 'object' },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['value'],
    properties: { value: { type: 'integer', minimum: 1 } }
  },
  rules: 'Use positive even numbers.',
  instructions: '',
  validation: {
    kind: 'trusted',
    checks: ['even'],
    uncheckedRules: [],
    validate: (candidate) =>
      (candidate as { value: number }).value % 2
        ? [{ code: 'odd', path: '/value', message: 'Use an even number.' }]
        : []
  },
  run: async () => ({ candidate: { value: 2 } })
};
const qualified = (): QualificationReport => ({
  schemaVersion: 'unit-qualification/0.1',
  definitionId: definition.id,
  readiness: 'review-required',
  findings: [],
  coverage: { legalBuilds: 1, evaluatedBuilds: 1, purchaseEdges: 0, probes: 1, unassessed: [] }
});
const evidence: ResearchResult = {
  schemaVersion: '0.2',
  status: 'success',
  subject: 'Hero',
  reused: false,
  grounding: 'grounded',
  gaps: [],
  sources: [
    {
      id: 's1',
      title: 'Hero',
      content: 'Hero fights using a wooden staff.',
      origin: 'supplied',
      status: 'read',
      truncated: false,
      omissions: []
    }
  ],
  knowledge: {
    subject: 'Hero',
    identity: {
      status: 'resolved',
      name: 'Hero',
      continuity: 'Story',
      explanation: 'Named character.'
    },
    claims: [{ text: 'Uses a staff.', sourceIds: ['s1'], kind: 'evidence' }],
    gaps: []
  }
};
const sourced = (value = 2): Definition => ({
  ...definition,
  run: async (_input, context) => {
    await context.research({ subject: 'Hero', knowledge: evidence });
    return { candidate: { value } };
  }
});
const review = () => ({
  status: 'checked',
  gaps: [],
  claims: [
    {
      path: '/value',
      sourceMechanic: 'Staff combat',
      relationship: 'numerical-tuning',
      claim: 'Staff damage is game tuning.',
      status: 'adapted',
      sourceId: 's1',
      passageId: 'p0',
      explanation: 'The source supports staff combat; its damage is game tuning.'
    }
  ]
});

describe('assessment ownership and ordering', () => {
  it('isolates evaluator arguments and its returned report, including mutations after return', async () => {
    let supplied: Parameters<NonNullable<Execution['evaluate']>>[0] | undefined;
    const report = qualified();
    const result = await generate(
      sourced(),
      {},
      {
        evaluate: (context) => {
          supplied = context;
          expect(Reflect.set(context.candidate as object, 'value', -2)).toBe(false);
          expect(Reflect.set(context.research[0]!.sources[0]!, 'content', 'Altered evidence')).toBe(
            false
          );
          return report;
        }
      }
    );
    expect(Reflect.set(supplied!.candidate as object, 'value', -4)).toBe(false);
    expect(Reflect.set(supplied!.research[0]!.sources[0]!, 'content', 'Late rewrite')).toBe(false);
    report.coverage.probes = 999;
    expect(result.status).toBe('success');
    expect(result.output).toEqual({ value: 2 });
    expect((await validate(definition, result.output)).structure.status).toBe('passed');
    expect(result.research[0]!.sources[0]!.content).toBe(evidence.sources[0]!.content);
    expect(result.qualification?.coverage.probes).toBe(1);
  });

  it('fails closed if an evaluator tries to write a checked candidate', async () => {
    const result = await generate(
      definition,
      {},
      {
        evaluate: ({ candidate }) => {
          (candidate as { value: number }).value = -2;
          return qualified();
        }
      }
    );
    expect(result.status).toBe('failed');
    expect(result.output).toBeUndefined();
    expect(result.candidate).toEqual({ value: 2 });
    expect(result.metadata.repairs).toBe(0);
  });

  it.each([
    { ...qualified(), coverage: undefined },
    { ...qualified(), findings: [null] },
    { ...qualified(), findings: [{ severity: 'BLOCKER', code: 'broken' }] },
    {
      ...qualified(),
      findings: [
        { severity: 'warning', code: 'broken', dimension: 'unknown', message: 'Invalid dimension' }
      ]
    },
    {
      ...qualified(),
      findings: [
        {
          severity: 'warning',
          code: 'broken',
          dimension: 'coverage',
          message: 'Invalid evidence',
          evidence: []
        }
      ]
    },
    { ...qualified(), coverage: { ...qualified().coverage, probes: -1 } },
    { ...qualified(), coverage: { ...qualified().coverage, probes: NaN } },
    { ...qualified(), coverage: { ...qualified().coverage, evaluatedBuilds: 0.5 } },
    { ...qualified(), definitionId: 'different' },
    null
  ])('rejects malformed evaluator reports without repairing the candidate: %j', async (report) => {
    const repair = vi.fn(async () => ({ value: 2 }));
    const result = await generate(
      { ...definition, repair },
      {},
      { evaluate: () => report as QualificationReport }
    );
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('invalid-qualification');
    expect(result.qualification).toBeUndefined();
    expect(result.candidate).toEqual({ value: 2 });
    expect(repair).not.toHaveBeenCalled();
  });

  it('repairs an invalid structure before calling an evaluator that requires valid structure', async () => {
    const seen: unknown[] = [];
    const result = await generate(
      {
        ...definition,
        run: async () => ({ candidate: { value: 'wrong' } }),
        repair: async () => {
          seen.push('repair');
          return { value: 2 };
        }
      },
      {},
      {
        evaluate: ({ candidate }) => {
          if (typeof (candidate as { value: unknown }).value !== 'number')
            throw Error('Invalid evaluator input');
          seen.push(candidate);
          return qualified();
        }
      }
    );
    expect(result.status).toBe('success');
    expect(seen).toEqual(['repair', { value: 2 }]);
    expect(result.metadata.repairs).toBe(1);
  });

  it('repairs declared rule failures before an unavailable source reviewer runs', async () => {
    const stages: string[] = [];
    const result = await generate(
      {
        ...sourced(1),
        repair: async () => {
          stages.push('repair');
          return { value: 2 };
        }
      },
      {},
      {
        evaluate: () => {
          stages.push('qualification');
          return qualified();
        },
        reviewFidelity: true,
        model: {
          generate: async (call) => {
            stages.push(call.stage);
            throw new RunError('provider-http', 'Reviewer unavailable.');
          }
        }
      }
    );
    expect(stages).toEqual(['repair', 'qualification', 'fidelity-review']);
    expect(result.error?.code).toBe('provider-http');
    expect(result.candidate).toEqual({ value: 2 });
    expect(result.metadata).toMatchObject({ repairs: 1, modelCalls: 1 });
  });

  it('repairs qualification blockers before source review and keeps one shared repair budget', async () => {
    const stages: string[] = [];
    const evaluate: NonNullable<Execution['evaluate']> = ({ candidate }) => {
      const value = (candidate as { value: number }).value;
      stages.push(`qualify-${value}`);
      const report = qualified();
      if (value === 2) {
        report.readiness = 'blocked';
        report.findings = [
          {
            code: 'job-failed',
            dimension: 'claim-effect',
            severity: 'blocker',
            message: 'Expected four damage.'
          }
        ];
      }
      return report;
    };
    const result = await generate(
      {
        ...sourced(),
        repair: async () => {
          stages.push('repair');
          return { value: 4 };
        }
      },
      {},
      {
        evaluate,
        reviewFidelity: true,
        model: {
          generate: async (call) => {
            stages.push(call.stage);
            return { value: review(), mode: 'fixture' };
          }
        }
      }
    );
    expect(stages).toEqual(['qualify-2', 'repair', 'qualify-4', 'fidelity-review']);
    expect(result.status).toBe('success');
    expect(result.metadata).toMatchObject({ repairs: 1, modelCalls: 1 });
    expect(result.output).toEqual({ value: 4 });

    stages.length = 0;
    const exhausted = await generate(
      { ...sourced(1), repair: async () => ({ value: 2 }) },
      {},
      {
        evaluate,
        reviewFidelity: true,
        model: {
          generate: async () => {
            throw Error('Must not review a blocked candidate');
          }
        }
      }
    );
    expect(exhausted.status).toBe('failed');
    expect(exhausted.metadata).toMatchObject({ repairs: 1, modelCalls: 0 });
    expect(exhausted.qualification?.readiness).toBe('blocked');
  });

  it('clears old reports when a fidelity repair creates a new invalid candidate', async () => {
    const contradicted = review();
    contradicted.claims[0]!.status = 'contradicted';
    const result = await generate(
      { ...sourced(), repair: async () => ({ value: -2 }) },
      {},
      {
        evaluate: () => qualified(),
        reviewFidelity: true,
        model: { generate: async () => ({ value: contradicted, mode: 'fixture' }) }
      }
    );
    expect(result.status).toBe('failed');
    expect(result.candidate).toEqual({ value: -2 });
    expect(result.qualification).toBeUndefined();
    expect(result.fidelity).toBeUndefined();
    expect(result.fidelityAttempts).toHaveLength(1);
    expect(result.metadata.repairs).toBe(1);
  });

  it('does not repair missing evidence or an incomplete source assessment', async () => {
    const repair = vi.fn(async () => ({ value: 4 }));
    const absent = await generate({ ...definition, repair }, {}, { reviewFidelity: true });
    expect(absent.validation.system.issues[0]?.code).toBe('fidelity-evidence-required');
    expect(absent.metadata).toMatchObject({ repairs: 0, modelCalls: 0 });
    const incomplete = {
      ...review(),
      status: 'insufficient-evidence',
      gaps: ['Continuity cannot be assessed.']
    };
    const result = await generate(
      { ...sourced(), repair },
      {},
      {
        reviewFidelity: true,
        model: { generate: async () => ({ value: incomplete, mode: 'fixture' }) }
      }
    );
    expect(result.status).toBe('failed');
    expect(
      result.validation.system.issues.some((issue) => issue.code === 'fidelity-evidence-incomplete')
    ).toBe(true);
    expect(result.metadata).toMatchObject({ repairs: 0, modelCalls: 1 });
    expect(repair).not.toHaveBeenCalled();
  });

  it('does not repair or review a candidate when trusted validation did not complete', async () => {
    const repair = vi.fn(async () => ({ value: 2 }));
    const evaluate = vi.fn(() => qualified());
    const result = await generate(
      {
        ...definition,
        repair,
        validation: {
          ...definition.validation,
          validate: () => {
            throw Error('Validator unavailable');
          }
        }
      },
      {},
      { evaluate, reviewFidelity: true }
    );
    expect(result.validation.system.status).toBe('not-completed');
    expect(result.metadata).toMatchObject({ repairs: 0, modelCalls: 0 });
    expect(repair).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
  });
});

describe('original-concept source review', () => {
  it('preserves original kind when reviewing an edited candidate without a model', async () => {
    const original = await research({ subject: 'Clockwork sentry', kind: 'original' });
    const result = await reviewCandidateSources({ name: 'Edited sentry' }, {}, [original]);
    expect(result.status).toBe('success');
    expect(result.fidelity?.status).toBe('original-concept');
    expect(result.metadata.modelCalls).toBe(0);
  });

  it('still reviews mixed evidence and does not trust a changed original-concept flag', async () => {
    const original = await research({ subject: 'Clockwork sentry', kind: 'original' });
    for (const retained of [
      [original, evidence],
      [{ ...evidence, grounding: 'original-concept' as const }]
    ]) {
      const result = await reviewCandidateSources({ value: 2 }, {}, retained, {
        model: { generate: async () => ({ value: review(), mode: 'fixture' }) }
      });
      expect(result.status).toBe('success');
      expect(result.fidelity?.status).toBe('checked');
      expect(result.metadata.modelCalls).toBe(1);
    }
  });
});
