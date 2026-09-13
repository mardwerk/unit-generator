/** Hoists repeated named schemas into local definitions for ordinary JSON Schema consumers. */
export function localizeNamedSchemas<T>(schema: T, names: ReadonlySet<string>): T {
  const definitions: Record<string, unknown> = {};
  const visit = (value: unknown, root = false): unknown => {
    if (Array.isArray(value)) return value.map((item) => visit(item));
    if (!value || typeof value !== 'object') return value;
    const source = value as Record<string, unknown>;
    const id = typeof source.$id === 'string' && names.has(source.$id) ? source.$id : undefined;
    if (id && !root) {
      if (!(id in definitions)) {
        definitions[id] = null;
        definitions[id] = visit(source, true);
      }
      return { $ref: `#/$defs/${id}` };
    }
    return Object.fromEntries(
      Object.entries(source)
        .filter(([key]) => key !== '$id' || !id)
        .map(([key, item]) => [
          key,
          key === '$ref' && typeof item === 'string' && names.has(item)
            ? `#/$defs/${item}`
            : visit(item)
        ])
    );
  };
  const result = visit(schema, true) as Record<string, unknown>;
  if (Object.keys(definitions).length)
    result.$defs = { ...((result.$defs as Record<string, unknown>) ?? {}), ...definitions };
  return result as T;
}

export function freezeSchema<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeSchema(child);
  }
  return value;
}
