import { fidelityTargets } from '../src/fidelity.js';
import { describe, expect, it, vi } from 'vitest';
import {
  generate,
  reviewCandidateSources,
  RunError,
  type Definition,
  type ModelAdapter,
  type ResearchResult,
  type QualificationReport
} from '../src/index.js';
const captured =
  'Hero uses a wooden staff to protect allies. ' +
  'Additional evidence. '.repeat(1200) +
  'The final section says Hero cannot fly.';
const research: ResearchResult = {
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
      content: captured,
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
      continuity: 'Original story',
      explanation: 'Named source character.'
    },
    claims: [{ text: 'Uses a wooden staff.', sourceIds: ['s1'], kind: 'evidence' }],
    gaps: []
  }
};
const definition: Definition = {
  id: 'test',
  version: '1',
  contractVersion: '0.2',
  inputSchema: { type: 'object' },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['attack'],
    properties: { attack: { type: 'string' } }
  },
  rules: '',
  instructions: '',
  validation: { kind: 'trusted', checks: ['valid'], uncheckedRules: [], validate: () => [] },
  async run(_input, context) {
    await context.research({ subject: 'Hero', knowledge: research });
    return {
      candidate: await context.model({
        stage: 'draft',
        instructions: '',
        input: {},
        schema: this.outputSchema
      })
    };
  }
};
const checked = (claimStatus = 'supported', passageId = 'p0') => ({
  status: 'checked',
  claims: [
    {
      path: '/attack',
      sourceMechanic: 'Wooden staff combat',
      relationship: 'same-ability',
      claim: 'Hero uses a staff.',
      status: claimStatus,
      sourceId: 's1',
      passageId,
      explanation: 'The visible passage describes the weapon.'
    }
  ],
  gaps: []
});
describe('source review in the generation flow', () => {
  it.each(['', 'Present explanation', 2, false, null])(
    'copies the exact selected scalar field: %j',
    async (value) => {
      const review = {
        ...checked('unresolved'),
        claims: checked('unresolved').claims.map((claim) => ({
          ...claim,
          path: '/mechanic',
          sourceId: '',
          passageId: ''
        }))
      };
      const result = await reviewCandidateSources(
        { mechanic: value },
        { subject: 'Hero' },
        [research],
        {
          model: { generate: async () => ({ value: review, mode: 'fixture' }) }
        }
      );
      expect(result.error).toBeUndefined();
      expect(result.fidelity?.claims[0]?.candidateQuote).toBe(
        typeof value === 'string' ? value : JSON.stringify(value)
      );
      expect(result.fidelity?.claims[0]?.claim).toBe(review.claims[0]!.claim);
      expect(result.issues[0]?.code).toBe('source-unresolved');
      expect(result.metadata.modelCalls).toBe(1);
    }
  );
  it.each(['/missing', '/', '/mechanic'])(
    'rejects a missing or nonscalar field pointer: %s',
    async (path) => {
      const review = {
        ...checked(),
        claims: checked().claims.map((claim) => ({ ...claim, path }))
      };
      const result = await reviewCandidateSources(
        { mechanic: { hits: 2 } },
        { subject: 'Hero' },
        [research],
        {
          model: { generate: async () => ({ value: review, mode: 'fixture' }) }
        }
      );
      expect(result.error?.code).toBe('fidelity-review-invalid');
      expect(result.metadata.modelCalls).toBe(2);
    }
  );
  it('rejects the obsolete model-authored quote instead of silently correcting retained reports', async () => {
    const review = {
      ...checked(),
      claims: checked().claims.map((claim) => ({ ...claim, candidateQuote: 'staff' }))
    };
    const result = await reviewCandidateSources(
      { attack: 'staff' },
      { subject: 'Hero' },
      [research],
      {
        model: { generate: async () => ({ value: review, mode: 'fixture' }) }
      }
    );
    expect(result.error?.code).toBe('fidelity-review-invalid');
    expect(result.fidelityAttempts?.[0]?.review).toMatchObject({
      claims: [{ candidateQuote: 'staff' }]
    });
  });
  it('forwards full evidence, validates source quotes, and retains exact author visibility', async () => {
    const model: ModelAdapter = {
      generate: vi.fn(async (call) => ({
        value: call.stage.startsWith('fidelity-review') ? checked() : { attack: 'wooden staff' },
        mode: 'fixture'
      }))
    };
    const result = await generate(definition, {}, { model, reviewFidelity: true });
    expect(result.status).toBe('success');
    expect(result.fidelity?.claims[0]?.status).toBe('supported');
    const cited = result.fidelity!.claims[0]!;
    expect(cited.quote).toBe(captured.slice(cited.sourceRange!.start, cited.sourceRange!.end));
    expect(cited.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    for (const [call] of vi.mocked(model.generate).mock.calls) {
      expect(JSON.stringify(call.input)).toContain('The final section says Hero cannot fly.');
      expect(
        result.metadata.calls.find((entry) => entry.stage === call.stage)?.evidence?.[0]?.sources[0]
          ?.visibleCharacters
      ).toBe(captured.length);
    }
    expect(vi.mocked(model.generate).mock.calls[1]?.[0].maxOutputTokens).toBe(6000);
  });
  it('does not accept invented quotations or pointers', async () => {
    const result = await generate(
      definition,
      {},
      {
        reviewFidelity: true,
        model: {
          generate: async (call) => ({
            value: call.stage.startsWith('fidelity-review')
              ? checked('supported', 'Hero breathes fire.')
              : { attack: 'staff' },
            mode: 'fixture'
          })
        }
      }
    );
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('fidelity-review-invalid');
    expect(result.candidate).toEqual({ attack: 'staff' });
    expect(result.output).toBeUndefined();
  });
  it('repairs contradictions once, then reviews the repaired output again', async () => {
    let reviews = 0;
    const model: ModelAdapter = {
      generate: vi.fn(async (call) => ({
        value: call.stage.startsWith('fidelity-review')
          ? checked(++reviews === 1 ? 'contradicted' : 'supported')
          : { attack: call.stage === 'repair' ? 'wooden staff' : 'flight' },
        mode: 'fixture'
      }))
    };
    const result = await generate(definition, {}, { model, reviewFidelity: true });
    expect(result.status).toBe('success');
    expect(result.metadata.repairs).toBe(1);
    expect(result.metadata.modelCalls).toBe(4);
    expect(result.output).toEqual({ attack: 'wooden staff' });
  });
  it('retains known usage for a failed provider call', async () => {
    const result = await generate(
      definition,
      {},
      {
        model: {
          generate: async () => {
            throw Object.assign(new RunError('invalid-json', 'Incomplete JSON.'), {
              usage: { inputTokens: 100, outputTokens: 30 },
              provider: { model: 'reported-model' }
            });
          }
        }
      }
    );
    expect(result.metadata.calls[0]).toMatchObject({
      completed: false,
      errorCode: 'invalid-json',
      model: 'reported-model',
      usage: { inputTokens: 100, outputTokens: 30 }
    });
  });
  it('feeds deterministic qualification blockers into the existing bounded repair', async () => {
    const evaluate = ({ candidate }: { candidate: unknown }): QualificationReport => ({
      schemaVersion: 'unit-qualification/0.1',
      definitionId: 'test',
      readiness: (candidate as { attack: string }).attack === 'bad' ? 'blocked' : 'review-required',
      findings:
        (candidate as { attack: string }).attack === 'bad'
          ? [
              {
                code: 'effect-mismatch',
                dimension: 'claim-effect',
                severity: 'blocker',
                message: 'Use an actual staff effect.'
              }
            ]
          : [],
      coverage: { legalBuilds: 1, evaluatedBuilds: 1, purchaseEdges: 0, probes: 1, unassessed: [] }
    });
    const result = await generate(
      definition,
      {},
      {
        evaluate,
        model: {
          generate: async (call) => ({
            value: { attack: call.stage === 'repair' ? 'staff' : 'bad' },
            mode: 'fixture'
          })
        }
      }
    );
    expect(result.status).toBe('success');
    expect(result.metadata.repairs).toBe(1);
    expect(result.qualification?.readiness).toBe('review-required');
  });
});

it('corrects a malformed review once without modifying the candidate', async () => {
  const model: ModelAdapter = {
    generate: async (call) => ({
      value:
        call.stage === 'fidelity-review'
          ? checked('supported', 'Not a real quote.')
          : call.stage === 'fidelity-review-correction'
            ? checked()
            : { attack: 'wooden staff' },
      mode: 'fixture'
    })
  };
  const result = await generate(definition, {}, { model, reviewFidelity: true });
  expect(result.status).toBe('success');
  expect(result.metadata.repairs).toBe(0);
  expect(result.metadata.calls.map((call) => call.stage)).toEqual([
    'draft',
    'fidelity-review',
    'fidelity-review-correction'
  ]);
  expect(result.fidelityAttempts?.map((attempt) => attempt.reportValid)).toEqual([false, true]);
  expect(result.fidelityAttempts?.[0]?.review).toMatchObject({
    claims: [{ passageId: 'Not a real quote.' }]
  });
});

it('retains failed reviewer reports when the shared call limit prevents a correction', async () => {
  const result = await generate(
    definition,
    {},
    {
      reviewFidelity: true,
      limits: { maxModelCalls: 2 },
      model: {
        generate: async (call) => ({
          value:
            call.stage === 'draft'
              ? { attack: 'staff' }
              : checked('supported', 'Invented source quote.'),
          mode: 'fixture'
        })
      }
    }
  );
  expect(result.error?.code).toBe('model-call-limit');
  expect(result.fidelityAttempts?.[0]?.reportValid).toBe(false);
  expect(result.candidate).toEqual({ attack: 'staff' });
  expect(result.output).toBeUndefined();
});

it('keeps distinct mechanics with identical labels in the required review targets', () => {
  const targets = fidelityTargets({
    name: 'Hero',
    attacks: [
      { name: 'Fighting technique', description: 'An attack.', effect: { element: 'ice' } },
      {
        name: 'Fighting technique',
        description: 'An attack.',
        effect: { element: 'volcano', revive: true }
      }
    ]
  });
  expect(targets.map((target) => target.path)).toEqual(['/', '/attacks/0', '/attacks/1']);
});

it('checks edited content against retained sources without generating or modifying it', async () => {
  const candidate = { attack: 'wooden staff' };
  const model: ModelAdapter = {
    generate: vi.fn(async () => ({ value: checked(), mode: 'fixture' }))
  };
  const result = await reviewCandidateSources(candidate, { subject: 'Hero' }, [research], {
    model
  });
  expect(result.status).toBe('success');
  expect(result.candidateSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(candidate).toEqual({ attack: 'wooden staff' });
  expect(result.metadata.calls.map((call) => call.stage)).toEqual(['fidelity-review']);
  expect(result.metadata.repairs).toBe(0);
});
