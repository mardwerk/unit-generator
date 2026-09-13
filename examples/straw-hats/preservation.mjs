import { isDeepStrictEqual } from 'node:util';

// Read-only constraint. Exact pointers authorize subtrees, never prefix matches.
export function preservationIssues(reference, candidate, allowedPaths = []) {
  const allowed = new Set(allowedPaths);
  for (const path of allowed) {
    if (typeof path !== 'string' || !/^\/(?:[^~]|~[01])*$/.test(path) || path === '/')
      throw new Error('Preservation allowances must be non-root JSON pointers.');
  }
  const issues = [];
  const escaped = (key) => String(key).replaceAll('~', '~0').replaceAll('/', '~1');
  const visit = (expected, actual, path) => {
    if (allowed.has(path) || isDeepStrictEqual(expected, actual)) return;
    if (
      expected &&
      actual &&
      typeof expected === 'object' &&
      typeof actual === 'object' &&
      Array.isArray(expected) === Array.isArray(actual)
    ) {
      for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
        const child = `${path}/${escaped(key)}`;
        if (allowed.has(child)) continue;
        if (Object.hasOwn(expected, key) && Object.hasOwn(actual, key))
          visit(expected[key], actual[key], child);
        else
          issues.push({
            code: 'refinement-preservation',
            path: child,
            message: Object.hasOwn(expected, key)
              ? `Restore the exact preserved field: ${JSON.stringify(expected[key])}`
              : 'Remove this unrequested added field; it is absent from the preserved unit.'
          });
      }
      return;
    }
    issues.push({
      code: 'refinement-preservation',
      path,
      message: `Restore the exact preserved value: ${JSON.stringify(expected)}`
    });
  };
  visit(reference, candidate, '');
  return issues;
}

export function preserveDefinition(definition, reference, allowedPaths) {
  preservationIssues(reference, reference, allowedPaths);
  return {
    ...definition,
    validation: {
      ...definition.validation,
      constraints: (candidate, input) => [
        ...(definition.validation.constraints?.(candidate, input) ?? []),
        ...preservationIssues(reference, candidate, allowedPaths)
      ]
    }
  };
}
