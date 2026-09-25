import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { requestFileSchema } from '../dist/node/request-file.js';
import { resultSchema } from '../dist/core/index.js';

// Export committed JSON Schemas from the zod contracts. Run `pnpm build`
// first so dist matches src, then `pnpm schema`.
const target = new URL('../data/schema/', import.meta.url);
await mkdir(target, { recursive: true });
for (const [name, schema] of Object.entries({ request: requestFileSchema, result: resultSchema })) {
  const json = JSON.stringify(z.toJSONSchema(schema), null, 2);
  await writeFile(new URL(`${name}.schema.json`, target), `${json}\n`);
  console.log(`Wrote data/schema/${name}.schema.json`);
}
