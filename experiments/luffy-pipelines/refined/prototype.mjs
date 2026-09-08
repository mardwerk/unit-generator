import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RunError, schemaIssues, resolveDefinition } from '../../../packages/core/dist/index.js';
import {
  createPrototype as createCombined,
  feasibilitySchema,
  checkFeasibility
} from '../combined/prototype.mjs';

export function boundedFeasibilitySchema(claimCount) {
  if (!Number.isSafeInteger(claimCount) || claimCount < 0)
    throw new Error('Expected a nonnegative claim count.');
  const schema = structuredClone(feasibilitySchema);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.properties?.claimIndices) {
      const indices = value.properties.claimIndices;
      indices.items.maximum = Math.max(0, claimCount - 1);
      if (claimCount === 0) indices.maxItems = 0;
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(schema);
  return schema;
}

export function upgradeVocabulary(outputSchema) {
  const operations =
    outputSchema.properties.upgradeGraph.properties.nodes.items.properties.operations.items.anyOf;
  return {
    source: '/properties/upgradeGraph/properties/nodes/items/properties/operations/items/anyOf',
    operations: operations.map((operation) => ({
      type: operation.properties.type.const,
      ...(operation.properties.parameter
        ? { parameters: operation.properties.parameter.anyOf.map((item) => item.const) }
        : {}),
      ...(operation.properties.operation
        ? { numericOperations: operation.properties.operation.anyOf.map((item) => item.const) }
        : {})
    })),
    projectileSpeed: {
      declarationPath: '/actions/*/delivery/projectileSpeedWorldUnitsPerSecond',
      directlyModifiableByUpgrade: false,
      implementation:
        'A speed change needs a separately declared replacement action with a different projectileSpeedWorldUnitsPerSecond and a valid replace-action operation, or an honestly revised progression. Replacement must satisfy all existing reference, ownership and lifecycle rules.'
    },
    parameterMeaning: {
      cooldownSeconds:
        'Time gate between action invocations; recurring scheduling also uses trigger.intervalSeconds.',
      rangeWorldUnits: 'Reach, not travel speed.',
      emitterCount: 'Number of emitters, not travel speed.',
      projectilesPerCycle: 'Shots emitted per cycle, not projectile travel speed.',
      maximumTargetsPerProjectile: 'Collateral target/pierce limit, not projectile travel speed.'
    }
  };
}

const exactOperationInstructions = `The supplied upgradeVocabulary is extracted from the actual unchanged output schema. Use its exact operation types and mutable parameter enums. A plan must not promise a direct mutation of an unsupported field. Projectile travel speed is the action delivery field projectileSpeedWorldUnitsPerSecond; projectilesPerCycle changes shot count and maximumTargetsPerProjectile changes collateral target/pierce count. Neither implements a projectile speed upgrade. Setting a value to its existing value implements no numeric improvement. Distinguish faster projectile travel, shorter recurring attack period, extra shots and additional collateral targets in both plans and summaries. A separately declared replacement action may change fixed delivery fields when a valid replace-action operation and every original lifecycle/reference/ownership constraint permit it. Otherwise choose and describe an actually supported progression. During review, correct false promises or the executable change atomically; do not leave a speed summary attached to a shot/pierce operation.`;

export async function createPrototype({ artifactDir } = {}) {
  const combined = await createCombined({ artifactDir });
  const vocabulary = upgradeVocabulary(combined.outputSchema);
  const save = async (name, value) => {
    if (!artifactDir) return;
    await mkdir(artifactDir, { recursive: true });
    await writeFile(join(artifactDir, name + '.json'), JSON.stringify(value, null, 2) + '\n');
  };
  const augment = (call) => ({
    ...call,
    instructions: call.instructions + '\n\n' + exactOperationInstructions,
    input: { ...call.input, upgradeVocabulary: vocabulary }
  });
  return resolveDefinition({
    ...combined,
    implementationVersion: 'scratch/refined/0.1.0',
    repairAttempts: 1,
    async run(input, ctx) {
      const attempts = [];
      const wrapped = {
        ...ctx,
        async model(original) {
          if (original.stage !== 'feasibility') return ctx.model(augment(original));
          const schema = boundedFeasibilitySchema(input.knowledge.knowledge.claims.length);
          let previous, errors;
          for (let attempt = 0; attempt < 2; attempt++) {
            const call = augment({
              ...original,
              schema,
              stage: attempt === 0 ? 'feasibility' : 'feasibility-repair',
              instructions:
                original.instructions +
                (attempt === 0
                  ? ''
                  : '\n\nThis is the only feasibility correction. Fix the supplied schema and source-index errors in the previous public plan. Use the explicit numbered facts. Preserve valid design choices and all requested discrepancies. Return the complete corrected public feasibility artifact; do not draft UnitSpec or silently discard invalid citations.'),
              input: {
                ...original.input,
                ...(attempt ? { previousFeasibility: previous, feasibilityErrors: errors } : {})
              }
            });
            await save(`refined-feasibility-${attempt}-call`, call);
            const raw = await ctx.model(call);
            await save(`refined-feasibility-${attempt}-raw`, raw);
            errors = schemaIssues(schema, raw);
            if (!errors.length) {
              try {
                checkFeasibility(raw, input.knowledge.knowledge, original.input.effectiveLimits);
              } catch (error) {
                errors = [
                  { code: error.code ?? 'invalid-feasibility', path: '/', message: error.message }
                ];
              }
            }
            attempts.push({ attempt, stage: call.stage, issues: errors });
            await save(`refined-feasibility-${attempt}-issues`, errors);
            await save('refined-feasibility-attempts', attempts);
            if (!errors.length) return raw;
            previous = raw;
          }
          throw new RunError(
            'feasibility-repair-exhausted',
            'The public plan still fails schema or source-index checks after one correction. No unit draft was requested. See retained feasibility attempts.',
            'feasibility-repair'
          );
        }
      };
      await save('refined-upgrade-vocabulary', vocabulary);
      const result = await combined.run(input, wrapped);
      result.design = {
        ...result.design,
        prototype: 'refined',
        feasibilityAttempts: attempts,
        callBudget: { normal: 3, maximum: 5, feasibilityCorrections: 1, outerRepairs: 1 },
        upgradeVocabulary: vocabulary
      };
      return result;
    },
    async repair(candidate, issues, input, ctx, design) {
      return combined.repair(
        candidate,
        issues,
        input,
        { ...ctx, model: (call) => ctx.model(augment(call)) },
        design
      );
    }
  });
}
