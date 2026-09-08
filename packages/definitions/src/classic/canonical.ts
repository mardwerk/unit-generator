export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort((v as Record<string, unknown>)[k])])
          )
        : v;
  return JSON.stringify(sort(value)) + '\n';
}
