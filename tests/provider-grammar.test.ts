import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { providerJsonSchema } from '../src/core/blueprint/model-output.js';

test('provider grammar omits expanding length bounds without changing runtime validation', () => {
  const runtime = z.strictObject({
    title: z.string().min(4).max(800),
    sources: z
      .array(z.enum(['source1:0', 'source1:1']))
      .min(1)
      .max(2),
    branches: z.array(z.strictObject({ description: z.string().max(800) })).length(3),
    disabledEffects: z.array(z.string()).max(0),
  });
  const before = z.toJSONSchema(runtime);
  const wire = providerJsonSchema(runtime);
  const objects: Record<string, unknown>[] = [];
  function inspect(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node.type === 'object') objects.push(node);
    if (node.type === 'string') {
      assert.equal(node.minLength, undefined);
      assert.equal(node.maxLength, undefined);
    }
    if (node.type === 'array' && node.maxItems !== 0) {
      assert.equal(node.minItems, undefined);
      assert.equal(node.maxItems, undefined);
    }
    Object.values(node).forEach(inspect);
  }
  inspect(wire);
  for (const object of objects) {
    assert.equal(object.additionalProperties, false);
    assert.deepEqual(object.required, Object.keys(object.properties as object));
  }
  const fields = wire.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(fields.sources!.items, { type: 'string', enum: ['source1:0', 'source1:1'] });
  assert.deepEqual(fields.disabledEffects!.items, { type: 'null' });
  assert.equal(fields.disabledEffects!.maxItems, 0);
  assert.deepEqual(z.toJSONSchema(runtime), before);
  const valid = {
    title: 'Valid title',
    sources: ['source1:0'],
    branches: [{ description: 'One' }, { description: 'Two' }, { description: 'Three' }],
    disabledEffects: [],
  };
  assert.ok(runtime.safeParse(valid).success);
  for (const patch of [
    { title: 'x' },
    { title: 'x'.repeat(801) },
    { sources: [] },
    { sources: ['source1:0', 'source1:0', 'source1:1'] },
    { sources: ['invented'] },
    { branches: [] },
    { disabledEffects: ['unexpected'] },
    { extra: true },
  ])
    assert.equal(runtime.safeParse({ ...valid, ...patch }).success, false, JSON.stringify(patch));
});
