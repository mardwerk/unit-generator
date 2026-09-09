import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { distance, type Point } from './geometry.js';

const identifier = Type.String({ minLength: 1, maxLength: 256 });
const choices = <const T extends string>(values: T[]) =>
  Type.Union(values.map((value) => Type.Literal(value)));
const collection = choices(['tags', 'properties', 'mutators', 'behaviors', 'areaTypes']);
const identity = choices(['id', 'baseId', 'ownerId', 'parentId', 'towerSet']);
const booleanFact = choices([
  'concealed',
  'invulnerable',
  'on-screen',
  'on-track',
  'has-weapon',
  'paused'
]);
const numericFact = choices(['health', 'path-progress', 'strength', 'tier-1', 'tier-2', 'tier-3']);
const comparison = choices(['eq', 'lt', 'lte', 'gt', 'gte']);
const finiteNumber = Type.Number({ minimum: -1e12, maximum: 1e12 });
const ids = Type.Array(identifier, { minItems: 1, maxItems: 64, uniqueItems: true });
const strict = { additionalProperties: false };

/** This describes normalized predicates, not source class-name dispatch. Source enum mapping,
 * filter composition and source-specific callbacks remain the adapter's responsibility.
 */
export const targetPredicateSchema = Type.Recursive(
  (Self) =>
    Type.Union([
      Type.Object({ kind: Type.Literal('constant'), value: Type.Boolean() }, strict),
      Type.Object(
        {
          kind: choices(['all', 'any']),
          predicates: Type.Array(Self, { minItems: 1, maxItems: 32 })
        },
        strict
      ),
      Type.Object({ kind: Type.Literal('not'), predicate: Self }, strict),
      Type.Object(
        {
          kind: Type.Literal('membership'),
          field: collection,
          values: ids,
          mode: choices(['any', 'all'])
        },
        strict
      ),
      Type.Object({ kind: Type.Literal('identity'), field: identity, values: ids }, strict),
      Type.Object(
        {
          kind: Type.Literal('source-relation'),
          field: choices(['id', 'ownerId', 'parentId']),
          sourceField: choices(['id', 'ownerId'])
        },
        strict
      ),
      Type.Object(
        { kind: Type.Literal('boolean'), fact: booleanFact, value: Type.Boolean() },
        strict
      ),
      Type.Object(
        { kind: Type.Literal('numeric'), fact: numericFact, comparison, value: finiteNumber },
        strict
      ),
      Type.Object(
        {
          kind: Type.Literal('range'),
          minimum: Type.Number({ minimum: 0, maximum: 1e12 }),
          maximum: Type.Number({ minimum: 0, maximum: 1e12 })
        },
        strict
      ),
      Type.Object(
        {
          kind: Type.Literal('cone'),
          degrees: Type.Number({ minimum: 0, maximum: 360 }),
          offsetDegrees: finiteNumber
        },
        strict
      ),
      Type.Object({ kind: Type.Literal('line-of-sight') }, strict)
    ]),
  { $id: 'SharedTargetPredicate' }
);

export const targetSelectionSchema = Type.Object(
  {
    filter: Type.Optional(targetPredicateSchema),
    preferences: Type.Optional(Type.Array(targetPredicateSchema, { maxItems: 16 })),
    order: Type.Array(
      Type.Object(
        {
          by: choices(['distance', 'path-progress', 'strength', 'health']),
          direction: choices(['asc', 'desc'])
        },
        strict
      ),
      { minItems: 1, maxItems: 4 }
    ),
    tieBreak: Type.Literal('id-ascending'),
    limit: Type.Integer({ minimum: 1, maximum: 10000 })
  },
  strict
);

/** Hoist the recursive predicate once when serializing schemas containing repeated policies. */
export function localizeTargetingSchema<T>(schema: T): T {
  const key = 'SharedTargetPredicate';
  const reference = `#/$defs/${key}`;
  let found = false;
  const visit = (value: unknown, definitionRoot = false): unknown => {
    if (Array.isArray(value)) return value.map((entry) => visit(entry));
    if (!value || typeof value !== 'object') return value;
    const entry = value as Record<string, unknown>;
    if (entry.$id === key && !definitionRoot) {
      found = true;
      return { $ref: reference };
    }
    const result: Record<string, unknown> = {};
    for (const [name, child] of Object.entries(entry)) {
      if (name === '$id' && child === key) continue;
      if (name === '$ref' && child === key) {
        found = true;
        result[name] = reference;
      } else result[name] = visit(child);
    }
    return result;
  };
  const result = visit(JSON.parse(JSON.stringify(schema))) as Record<string, unknown>;
  if (found)
    result.$defs = {
      ...(result.$defs as Record<string, unknown> | undefined),
      [key]: visit(JSON.parse(JSON.stringify(targetPredicateSchema)), true)
    };
  return result as T;
}

export const targetSelectionJsonSchema = localizeTargetingSchema(targetSelectionSchema);

export type TargetPredicate = Static<typeof targetPredicateSchema>;
export type TargetSelection = Static<typeof targetSelectionSchema>;
export type TargetNumericFact = Static<typeof numericFact>;
export type TargetBooleanFact = Static<typeof booleanFact>;

/** CombatTarget and support actors can both supply these fields. Missing means unknown;
 * adapters must explicitly supply [] or false when those are established facts.
 */
export interface TargetEntity extends Point {
  id: string;
  health?: number;
  concealed?: boolean;
  invulnerable?: boolean;
  tags?: readonly string[];
  properties?: readonly string[];
  mutators?: readonly string[];
  behaviors?: readonly string[];
  areaTypes?: readonly string[];
  baseId?: string;
  ownerId?: string;
  parentId?: string;
  towerSet?: string;
}

export interface TargetContext<T extends TargetEntity = TargetEntity> {
  origin?: Point;
  source?: TargetEntity;
  headingDegrees?: number;
  numericFact?: (entity: T, fact: TargetNumericFact) => number | undefined;
  booleanFact?: (entity: T, fact: TargetBooleanFact) => boolean | undefined;
  lineOfSight?: (origin: Point, target: T) => boolean | undefined;
}

export interface TargetMatch {
  matches: boolean;
  missingFacts: string[];
}

export class MissingTargetFactsError extends Error {
  constructor(
    readonly targetId: string,
    readonly missingFacts: string[]
  ) {
    super(`Target ${targetId} requires facts: ${missingFacts.join(', ')}.`);
    this.name = 'MissingTargetFactsError';
  }
}

/** Check size and cycles before recursive schema validation. */
function boundedInput(input: unknown) {
  let nodes = 0;
  const ancestors = new Set<object>();
  const visit = (value: unknown, depth: number) => {
    if (++nodes > 4096 || depth > 40)
      throw new Error('Target policy exceeds its size or depth limit.');
    if (!value || typeof value !== 'object') return;
    if (ancestors.has(value)) throw new Error('Target policy cannot contain cycles.');
    ancestors.add(value);
    for (const child of Object.values(value)) visit(child, depth + 1);
    ancestors.delete(value);
  };
  visit(input, 0);
}

function validatePredicate(predicate: TargetPredicate, depth = 0): void {
  if (depth > 16) throw new Error('Target predicate nesting exceeds 16.');
  if (predicate.kind === 'range' && predicate.minimum > predicate.maximum)
    throw new Error('Target range minimum exceeds maximum.');
  if (predicate.kind === 'all' || predicate.kind === 'any')
    predicate.predicates.forEach((child) => validatePredicate(child, depth + 1));
  if (predicate.kind === 'not') validatePredicate(predicate.predicate, depth + 1);
}

const known = (matches: boolean): TargetMatch => ({ matches, missingFacts: [] });
const missing = (fact: string): TargetMatch => ({ matches: false, missingFacts: [fact] });
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const pointKnown = (point: Point | undefined): point is Point =>
  !!point && finite(point.x) && finite(point.y);
const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function numericValue<T extends TargetEntity>(
  entity: T,
  fact: TargetNumericFact,
  context: TargetContext<T>
) {
  // A supplied callback owns its result, including an explicit unresolved result.
  return context.numericFact
    ? context.numericFact(entity, fact)
    : fact === 'health'
      ? entity.health
      : undefined;
}

function evaluate<T extends TargetEntity>(
  predicate: TargetPredicate,
  entity: T,
  context: TargetContext<T>
): TargetMatch {
  switch (predicate.kind) {
    case 'constant':
      return known(predicate.value);
    case 'all':
    case 'any': {
      const results = predicate.predicates.map((child) => evaluate(child, entity, context));
      const missingFacts = [...new Set(results.flatMap((result) => result.missingFacts))];
      // Evaluate every branch. Negation or a passing alternative cannot hide an unknown input.
      if (missingFacts.length) return { matches: false, missingFacts };
      return known(
        predicate.kind === 'all' ? results.every((r) => r.matches) : results.some((r) => r.matches)
      );
    }
    case 'not': {
      const result = evaluate(predicate.predicate, entity, context);
      return result.missingFacts.length ? result : known(!result.matches);
    }
    case 'membership': {
      const values = entity[predicate.field];
      if (!Array.isArray(values) || !values.every((value) => typeof value === 'string'))
        return missing(predicate.field);
      return known(
        predicate.mode === 'all'
          ? predicate.values.every((value) => values.includes(value))
          : predicate.values.some((value) => values.includes(value))
      );
    }
    case 'identity': {
      const value = entity[predicate.field];
      return typeof value === 'string'
        ? known(predicate.values.includes(value))
        : missing(predicate.field);
    }
    case 'source-relation': {
      const own = entity[predicate.field];
      const source = context.source?.[predicate.sourceField];
      const absent = [
        typeof own !== 'string' ? predicate.field : '',
        typeof source !== 'string' ? `source.${predicate.sourceField}` : ''
      ].filter(Boolean);
      return absent.length ? { matches: false, missingFacts: absent } : known(own === source);
    }
    case 'boolean': {
      const value = context.booleanFact
        ? context.booleanFact(entity, predicate.fact)
        : predicate.fact === 'concealed' || predicate.fact === 'invulnerable'
          ? entity[predicate.fact]
          : undefined;
      return typeof value === 'boolean'
        ? known(value === predicate.value)
        : missing(predicate.fact);
    }
    case 'numeric': {
      const value = numericValue(entity, predicate.fact, context);
      if (!finite(value)) return missing(predicate.fact);
      switch (predicate.comparison) {
        case 'eq':
          return known(value === predicate.value);
        case 'lt':
          return known(value < predicate.value);
        case 'lte':
          return known(value <= predicate.value);
        case 'gt':
          return known(value > predicate.value);
        case 'gte':
          return known(value >= predicate.value);
      }
      break;
    }
    case 'range': {
      if (!pointKnown(context.origin)) return missing('origin');
      if (!pointKnown(entity)) return missing('position');
      const radius = distance(context.origin, entity);
      return known(radius >= predicate.minimum && radius <= predicate.maximum);
    }
    case 'cone': {
      if (!pointKnown(context.origin)) return missing('origin');
      if (!pointKnown(entity)) return missing('position');
      if (!finite(context.headingDegrees)) return missing('headingDegrees');
      const dx = entity.x - context.origin.x,
        dy = entity.y - context.origin.y;
      if (dx === 0 && dy === 0) return known(true);
      const heading = context.headingDegrees + predicate.offsetDegrees;
      const bearing = (Math.atan2(dy, dx) * 180) / Math.PI;
      const angle = ((((bearing - heading) % 360) + 540) % 360) - 180;
      return known(Math.abs(angle) <= predicate.degrees / 2);
    }
    case 'line-of-sight': {
      if (!pointKnown(context.origin)) return missing('origin');
      if (!pointKnown(entity)) return missing('position');
      const value = context.lineOfSight?.(context.origin, entity);
      return typeof value === 'boolean' ? known(value) : missing('line-of-sight');
    }
  }
  throw new Error('Unsupported target predicate.');
}

export function compileTargetPredicate(input: unknown) {
  boundedInput(input);
  if (!Value.Check(targetPredicateSchema, input)) throw new Error('Invalid target predicate.');
  validatePredicate(input);
  const predicate = structuredClone(input);
  return {
    evaluate<T extends TargetEntity>(entity: T, context: TargetContext<T> = {}): TargetMatch {
      return evaluate(predicate, entity, context);
    },
    test<T extends TargetEntity>(entity: T, context: TargetContext<T> = {}): boolean {
      const result = evaluate(predicate, entity, context);
      if (result.missingFacts.length)
        throw new MissingTargetFactsError(entity.id, result.missingFacts);
      return result.matches;
    }
  };
}

export function compileTargetSelection(input: unknown) {
  boundedInput(input);
  if (!Value.Check(targetSelectionSchema, input))
    throw new Error('Invalid target selection policy.');
  const policy = structuredClone(input);
  const filter = policy.filter ? compileTargetPredicate(policy.filter) : undefined;
  const preferences = (policy.preferences ?? []).map(compileTargetPredicate);
  return {
    select<T extends TargetEntity>(targets: readonly T[], context: TargetContext<T> = {}): T[] {
      const ids = new Set<string>();
      const candidates: { target: T; preferences: boolean[]; values: number[] }[] = [];
      for (const target of targets) {
        const targetId = target.id;
        if (typeof target.id !== 'string' || !target.id || ids.has(target.id))
          throw new Error('Target selection requires unique, nonempty entity IDs.');
        ids.add(target.id);
        if (filter && !filter.test(target, context)) continue;
        const preferred = preferences.map((predicate) => predicate.test(target, context));
        const values = policy.order.map((order) => {
          if (order.by === 'distance') {
            if (!pointKnown(context.origin))
              throw new MissingTargetFactsError(target.id, ['origin']);
            if (!pointKnown(target)) throw new MissingTargetFactsError(targetId, ['position']);
            const value = distance(context.origin, target);
            if (!finite(value)) throw new MissingTargetFactsError(targetId, ['distance']);
            return value;
          }
          const value = numericValue(target, order.by, context);
          if (!finite(value)) throw new MissingTargetFactsError(target.id, [order.by]);
          return value;
        });
        candidates.push({ target, preferences: preferred, values });
      }
      candidates.sort((a, b) => {
        for (let i = 0; i < preferences.length; i++)
          if (a.preferences[i] !== b.preferences[i]) return a.preferences[i] ? -1 : 1;
        for (let i = 0; i < policy.order.length; i++) {
          const difference = a.values[i]! - b.values[i]!;
          if (difference) return policy.order[i]!.direction === 'asc' ? difference : -difference;
        }
        return compareIds(a.target.id, b.target.id);
      });
      return candidates.slice(0, policy.limit).map(({ target }) => target);
    }
  };
}
