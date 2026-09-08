import { Value, ValueErrorType, type ValueError } from '@sinclair/typebox/value';
import type { Static, TSchema } from '@sinclair/typebox';

import type { ValidationIssue, ValidationReport } from './reports.js';
import { VALIDATION_LIMITS } from './schemas.js';

const RANGE_ERRORS = new Set<ValueErrorType>([
  ValueErrorType.ArrayMaxItems,
  ValueErrorType.ArrayMinItems,
  ValueErrorType.IntegerExclusiveMaximum,
  ValueErrorType.IntegerExclusiveMinimum,
  ValueErrorType.IntegerMaximum,
  ValueErrorType.IntegerMinimum,
  ValueErrorType.NumberExclusiveMaximum,
  ValueErrorType.NumberExclusiveMinimum,
  ValueErrorType.NumberMaximum,
  ValueErrorType.NumberMinimum,
  ValueErrorType.ObjectMaxProperties,
  ValueErrorType.ObjectMinProperties,
  ValueErrorType.StringMaxLength,
  ValueErrorType.StringMinLength
]);

const TYPE_ERRORS = new Set<ValueErrorType>([
  ValueErrorType.Array,
  ValueErrorType.Boolean,
  ValueErrorType.Integer,
  ValueErrorType.Null,
  ValueErrorType.Number,
  ValueErrorType.Object,
  ValueErrorType.String
]);

const pointer = (path: string) => path || '/';
const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

export const VALIDATION_TRUNCATION_ISSUE: Readonly<ValidationIssue> = Object.freeze({
  code: 'VALIDATION_ISSUES_TRUNCATED',
  path: '/',
  message: `Validation stopped after ${VALIDATION_LIMITS.maximumIssues} issues.`,
  category: 'schema'
});

export function sortAndLimitIssues(
  issues: readonly ValidationIssue[],
  truncated = false
): ValidationIssue[] {
  const markerPresent =
    truncated || issues.some((entry) => entry.code === VALIDATION_TRUNCATION_ISSUE.code);
  const sorted = issues
    .filter((entry) => entry.code !== VALIDATION_TRUNCATION_ISSUE.code)
    .sort(
      (left, right) =>
        compareText(left.path, right.path) ||
        compareText(left.code, right.code) ||
        compareText(left.message, right.message)
    )
    .filter(
      (entry, index, values) =>
        index === 0 ||
        entry.path !== values[index - 1]?.path ||
        entry.code !== values[index - 1]?.code ||
        entry.message !== values[index - 1]?.message
    );
  const needsMarker = markerPresent || sorted.length > VALIDATION_LIMITS.maximumIssues;
  return needsMarker
    ? [...sorted.slice(0, VALIDATION_LIMITS.maximumIssues - 1), { ...VALIDATION_TRUNCATION_ISSUE }]
    : sorted;
}

function schemaCode(error: ValueError): string {
  if (error.type === ValueErrorType.ObjectRequiredProperty) return 'SCHEMA_REQUIRED';
  if (
    error.type === ValueErrorType.ObjectAdditionalProperties ||
    error.type === ValueErrorType.IntersectUnevaluatedProperties
  ) {
    return 'SCHEMA_UNEXPECTED_PROPERTY';
  }
  if (error.type === ValueErrorType.ArrayUniqueItems) return 'SCHEMA_DUPLICATE_ITEM';
  if (error.type === ValueErrorType.StringPattern) return 'SCHEMA_PATTERN';
  if (error.type === ValueErrorType.Literal || error.type === ValueErrorType.Union) {
    return 'SCHEMA_VARIANT';
  }
  if (RANGE_ERRORS.has(error.type)) return 'SCHEMA_RANGE';
  if (TYPE_ERRORS.has(error.type)) return 'SCHEMA_TYPE';
  return 'SCHEMA_INVALID';
}

export function schemaIssues(
  schema: TSchema,
  value: unknown,
  maximumCollectionItems: number = VALIDATION_LIMITS.maximumCollectionItems
): ValidationIssue[] {
  const preflight = finiteJsonIssues(value, '/', maximumCollectionItems);
  if (preflight.length > 0) return preflight;
  const issues: ValidationIssue[] = [];
  let truncated = false;
  for (const error of Value.Errors(schema, value)) {
    if (issues.length === VALIDATION_LIMITS.maximumIssues) {
      truncated = true;
      break;
    }
    issues.push({
      code: schemaCode(error),
      path: pointer(error.path),
      message: error.message,
      category: 'schema' as const
    });
  }
  return sortAndLimitIssues(issues, truncated);
}

export function validateSchema<T extends TSchema>(
  schema: T,
  value: unknown
): ValidationReport<Static<T>> {
  const issues = schemaIssues(schema, value);
  return issues.length === 0
    ? { valid: true, value: value as Static<T>, issues }
    : { valid: false, issues };
}

const escapePointer = (part: string) => part.replaceAll('~', '~0').replaceAll('/', '~1');
const childPointer = (path: string, part: string | number) =>
  `${path === '/' ? '' : path}/${escapePointer(String(part))}`;

interface VisitFrame {
  value: unknown;
  path: string;
  depth: number;
  exit?: object;
}

/** Reports values that cannot survive a JSON encode/decode round trip. */
export function finiteJsonIssues(
  value: unknown,
  basePath = '/',
  maximumCollectionItems: number = VALIDATION_LIMITS.maximumCollectionItems
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ancestors = new Set<object>();
  const stack: VisitFrame[] = [{ value, path: basePath || '/', depth: 0 }];
  let visitedNodes = 0;
  let truncated = false;
  const add = (entry: ValidationIssue): void => {
    if (issues.length < VALIDATION_LIMITS.maximumIssues) issues.push(entry);
    else truncated = true;
  };

  while (stack.length > 0 && !truncated) {
    const frame = stack.pop();
    if (frame === undefined) break;
    if (frame.exit !== undefined) {
      ancestors.delete(frame.exit);
      continue;
    }
    const { value: current, path, depth } = frame;
    visitedNodes += 1;
    if (visitedNodes > VALIDATION_LIMITS.maximumJsonNodes) {
      add({
        code: 'SCHEMA_JSON_NODE_LIMIT',
        path,
        message: `JSON values may contain at most ${VALIDATION_LIMITS.maximumJsonNodes} nodes.`,
        category: 'schema'
      });
      truncated = true;
      break;
    }
    if (depth > VALIDATION_LIMITS.maximumDepth) {
      add({
        code: 'SCHEMA_JSON_DEPTH_LIMIT',
        path,
        message: `JSON values may be nested at most ${VALIDATION_LIMITS.maximumDepth} levels.`,
        category: 'schema'
      });
      truncated = true;
      continue;
    }
    if (current === null || typeof current === 'string' || typeof current === 'boolean') {
      continue;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) {
        add({
          code: 'SCHEMA_NON_FINITE_NUMBER',
          path,
          message: 'JSON numbers must be finite.',
          category: 'schema'
        });
      }
      continue;
    }
    if (typeof current !== 'object') {
      add({
        code: 'SCHEMA_NON_JSON_VALUE',
        path,
        message: `JSON does not support values of type ${typeof current}.`,
        category: 'schema'
      });
      continue;
    }
    if (ancestors.has(current)) {
      add({
        code: 'SCHEMA_CYCLIC_VALUE',
        path,
        message: 'JSON values cannot contain cycles.',
        category: 'schema'
      });
      continue;
    }

    try {
      const isArray = Array.isArray(current);
      if (Object.getOwnPropertySymbols(current).length > 0) {
        add({
          code: 'SCHEMA_NON_JSON_VALUE',
          path,
          message: 'JSON values cannot contain symbol-keyed properties.',
          category: 'schema'
        });
        continue;
      }
      if (isArray) {
        const hasCustomKey = Object.getOwnPropertyNames(current).some(
          (key) =>
            key !== 'length' &&
            (!/^(?:0|[1-9][0-9]*)$/u.test(key) ||
              !Number.isSafeInteger(Number(key)) ||
              Number(key) >= current.length)
        );
        if (hasCustomKey) {
          add({
            code: 'SCHEMA_NON_JSON_VALUE',
            path,
            message: 'JSON arrays cannot contain non-index own properties.',
            category: 'schema'
          });
          continue;
        }
      } else {
        const prototype = Object.getPrototypeOf(current);
        if (prototype !== Object.prototype && prototype !== null) {
          add({
            code: 'SCHEMA_NON_JSON_VALUE',
            path,
            message: 'JSON objects must contain only string-keyed plain data.',
            category: 'schema'
          });
          continue;
        }
      }

      const keys: string[] = [];
      if (isArray) {
        if (current.length <= maximumCollectionItems) {
          for (let index = 0; index < current.length; index += 1) keys.push(String(index));
        }
      } else {
        for (const key in current) {
          if (!Object.hasOwn(current, key)) continue;
          keys.push(key);
          if (keys.length > maximumCollectionItems) break;
        }
        keys.sort(compareText);
      }
      if (
        (isArray && current.length > maximumCollectionItems) ||
        keys.length > maximumCollectionItems
      ) {
        add({
          code: 'SCHEMA_RANGE',
          path,
          message: `JSON collections may contain at most ${maximumCollectionItems} items.`,
          category: 'schema'
        });
        truncated = true;
        continue;
      }

      ancestors.add(current);
      stack.push({ value: undefined, path, depth, exit: current });
      for (let index = keys.length - 1; index >= 0; index -= 1) {
        const key = keys[index];
        if (key === undefined) continue;
        if (isArray && !(Number(key) in current)) {
          add({
            code: 'SCHEMA_NON_JSON_VALUE',
            path: childPointer(path, key),
            message: 'JSON arrays cannot contain empty slots.',
            category: 'schema'
          });
          continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (descriptor === undefined || !('value' in descriptor)) {
          add({
            code: 'SCHEMA_NON_JSON_VALUE',
            path: childPointer(path, key),
            message: 'JSON objects cannot contain accessor properties.',
            category: 'schema'
          });
          continue;
        }
        stack.push({ value: descriptor.value, path: childPointer(path, key), depth: depth + 1 });
      }
    } catch {
      add({
        code: 'SCHEMA_NON_JSON_VALUE',
        path,
        message: 'JSON values must be safely inspectable plain data.',
        category: 'schema'
      });
    }
  }

  return sortAndLimitIssues(issues, truncated);
}
