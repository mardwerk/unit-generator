import { describe, expect, it } from 'vitest';
import { compileSchema, schemaIssues } from '../src/json.js';

describe('bounded compiled schema reuse', () => {
  it('reuses equal schema contents and observes mutations to an existing schema object', () => {
    const schema = { type: 'number', minimum: 1, title: 'cache mutation regression' };
    const original = compileSchema(schema);
    expect(compileSchema(structuredClone(schema))).toBe(original);
    expect(schemaIssues(schema, 2)).toEqual([]);
    schema.minimum = 3;
    expect(compileSchema(schema)).not.toBe(original);
    expect(schemaIssues(schema, 2)).toMatchObject([{ code: 'schema-minimum' }]);
    expect(original(2)).toBe(true);
  });
  it('evicts old schemas after sixteen distinct compiled entries', () => {
    const first = { type: 'integer', const: 900, title: 'bounded cache first' };
    const compiled = compileSchema(first);
    for (let index = 0; index < 16; index++)
      compileSchema({ type: 'integer', const: index, title: `bounded cache ${index}` });
    expect(compileSchema(first)).not.toBe(compiled);
    expect(schemaIssues(first, 899)).toMatchObject([{ code: 'schema-const' }]);
  });
});
