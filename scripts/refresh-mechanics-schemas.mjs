import { writeFile } from 'node:fs/promises';
import {
  btd6ModelV2Schema,
  btd6UnitV2Schema
} from '../packages/definitions/dist/btd6-derived/index.js';
import { mechanicalModelJsonSchema } from '../packages/definitions/dist/mechanics/index.js';
import { mangaUnitSchema } from '../packages/definitions/dist/manga-mayhem/index.js';

// Build @mardwerk/unit-definitions before running this script.
for (const [path, schema, id] of [
  [
    'packages/definitions/definitions/tower-defense/output.schema.json',
    btd6UnitV2Schema,
    'tower-defense-unit-0.2'
  ],
  [
    'packages/definitions/schemas/btd6-derived-model-0.2.json',
    btd6ModelV2Schema,
    'btd6-derived-model-0.2'
  ],
  [
    'packages/definitions/schemas/shared-mechanical-model-0.1.json',
    mechanicalModelJsonSchema,
    'shared-mechanical-model-0.1'
  ]
]) {
  await writeFile(
    new URL(`../${path}`, import.meta.url),
    `${JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `https://mardwerk.dev/schemas/${id}.json`, ...schema }, null, 2)}\n`
  );
}

for (const path of [
  'packages/definitions/definitions/manga-mayhem/output.schema.json',
  'packages/definitions/schemas/manga-mayhem-unit-0.1.json'
]) {
  await writeFile(
    new URL(`../${path}`, import.meta.url),
    `${JSON.stringify(mangaUnitSchema, null, 2)}\n`
  );
}
