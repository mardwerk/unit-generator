import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBundledDefinition } from '../../../packages/definitions/dist/index.js';
import { RunError, schemaIssues } from '../../../packages/core/dist/index.js';
import { evaluateCandidate } from './evaluate.mjs';

const findingSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['priority', 'candidatePaths', 'sourceClaimIndices', 'observation', 'revision'],
  properties: {
    priority: { type: 'integer', minimum: 1, maximum: 3 },
    candidatePaths: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    sourceClaimIndices: { type: 'array', items: { type: 'integer', minimum: 0 }, maxItems: 8 },
    observation: { type: 'string', maxLength: 1200 },
    revision: { type: 'string', maxLength: 1200 }
  }
};
export const critiqueSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['preserve', 'findings', 'uncertainties'],
  properties: {
    preserve: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    findings: { type: 'array', items: findingSchema, maxItems: 5 },
    uncertainties: { type: 'array', items: { type: 'string' }, maxItems: 6 }
  }
};

export async function createPrototype({ artifactDir } = {}) {
  const base = await loadBundledDefinition();
  const save = async (name, data) => {
    if (!artifactDir) return;
    await mkdir(artifactDir, { recursive: true });
    await writeFile(join(artifactDir, name + '.json'), JSON.stringify(data, null, 2) + '\n');
  };
  const instructions = [base.rules, base.instructions].join('\n\n');
  return {
    ...base,
    implementationVersion: 'scratch/critique/0.1.0',
    repairAttempts: 1,
    preflight(input) {
      return [
        ...(base.preflight?.(input) ?? []),
        ...(!input.knowledge || input.knowledge.status !== 'success'
          ? [
              {
                code: 'shared-research-required',
                path: '/knowledge',
                message: 'This prototype requires successful shared ResearchResult knowledge.'
              }
            ]
          : [])
      ];
    },
    async run(input, ctx) {
      const research = await ctx.research({
        subject: input.subject,
        knowledge: input.knowledge,
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.continuity ? { continuity: input.continuity } : {})
      });
      if (research.status !== 'success')
        throw new RunError(
          'research-failed',
          research.error?.message ?? 'Shared research reuse failed.',
          'research'
        );
      const request = {
        subject: input.subject,
        intent: input.intent ?? '',
        constraints: input.constraints ?? {},
        context: input.context ?? null
      };
      const draft = await ctx.model({
        stage: 'draft',
        schema: base.outputSchema,
        instructions,
        input: { request, knowledge: research.knowledge, examples: base.examples ?? [] }
      });
      await save('01-draft', draft);
      const review = await evaluateCandidate(draft, { research, input });
      await save('02-mechanical-review', review);
      // Keep raw simulations on disk; the existing diagnostics already cite their measured facts.
      const modelReview = {
        ...review,
        simulations:
          review.simulations === null
            ? null
            : {
                completedBuilds: review.simulations.length,
                completedScenarios: review.simulations.reduce(
                  (sum, row) => sum + row.scenarios.length,
                  0
                ),
                evidenceLocation:
                  'Measured scenario findings are in diagnostics.evidence; full reports are retained in the mechanical-review artifact.'
              }
      };
      const critique = await ctx.model({
        stage: 'critique',
        schema: critiqueSchema,
        instructions: [
          instructions,
          'Review the supplied draft against the supplied source claims, the request, and completed mechanical evidence. Return concise public design findings, not hidden reasoning. Cite zero-based sourceClaimIndices and JSON pointers into the candidate. Evidence claims are facts; unverified claims and gaps remain uncertain. Describe concrete mismatches or missed opportunities without inventing facts or requirements. Prioritize mechanical failures, then fidelity, readable gameplay and distinct path tradeoffs. Preserve successful identity choices. At most five actionable findings. Unavailable simulation is missing evidence, never zero performance. Do not optimize a synthetic index or claim measured fun, balance, or user preference.'
        ].join('\n\n'),
        input: { request, knowledge: research.knowledge, draft, review: modelReview }
      });
      await save('03-critique', critique);
      const errors = schemaIssues(critiqueSchema, critique);
      if (errors.length)
        throw new RunError(
          'invalid-critique',
          'Critique did not match its public artifact schema. No retry.',
          'critique'
        );
      if (
        critique.findings.some((f) =>
          f.sourceClaimIndices.some((i) => i >= (research.knowledge?.claims.length ?? 0))
        )
      )
        throw new RunError(
          'invalid-critique-reference',
          'Critique cites a nonexistent source claim. No retry.',
          'critique'
        );
      const candidate = await ctx.model({
        stage: 'revision',
        schema: base.outputSchema,
        instructions: [
          instructions,
          'Make one targeted revision of the draft using the supplied critique and mechanical report. Verify each proposed change against the source facts and rules. Keep successful design choices and correct all reported mechanical failures, including equivalent occurrences. Avoid unrelated redesign and extra systems. Return the complete unchanged output schema. No new facts. Missing simulation evidence does not imply zero performance.'
        ].join('\n\n'),
        input: { request, knowledge: research.knowledge, draft, critique, review: modelReview }
      });
      await save('04-revision', candidate);
      return {
        candidate,
        design: {
          prototype: 'critique',
          critique,
          draftValidation: review.validation,
          diagnosticStatus: review.status,
          limits: review.limits
        }
      };
    },
    async repair(candidate, issues, input, ctx, design) {
      await save('05-before-mechanical-repair', { candidate, issues });
      const repaired = await ctx.model({
        stage: 'repair',
        schema: base.outputSchema,
        instructions: [
          instructions,
          'Repair the specific errors in the candidate. Preserve its defining gameplay identity, requested constraints and source connection. Never weaken the rules. Return the complete corrected JSON.'
        ].join('\n\n'),
        input: {
          request: input,
          candidate,
          issues,
          design: design ?? null,
          research: input.knowledge?.knowledge ?? null
        }
      });
      await save('06-mechanical-repair', repaired);
      return repaired;
    }
  };
}
