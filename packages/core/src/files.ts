import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { Definition } from './contracts.js';
import { jsonCopy, RunError } from './json.js';
import { resolveDefinition } from './validate.js';

export async function readText(filename: string, maximum = 4 * 1024 * 1024): Promise<string> {
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maximum)
      throw new RunError('file-limit', 'Input must be a bounded regular file.', 'input');
    const buffer = Buffer.alloc(maximum + 1);
    let count = 0;
    while (count <= maximum) {
      const read = await file.read(buffer, count, maximum + 1 - count, null);
      if (!read.bytesRead) break;
      count += read.bytesRead;
    }
    if (count > maximum) throw new RunError('file-limit', 'Input exceeds the file limit.', 'input');
    return buffer.subarray(0, count).toString('utf8');
  } finally {
    await file.close();
  }
}
export async function readJson(filename: string, maximum?: number): Promise<unknown> {
  return jsonCopy(JSON.parse(await readText(filename, maximum)), maximum);
}
export type Implementation = (definition: Definition) => Definition;
export async function loadDefinition(
  directory: string,
  implementations: Record<string, Implementation> = {}
): Promise<Definition> {
  const root = await realpath(directory);
  const manifest = (await readJson(path.join(root, 'definition.json'), 64 * 1024)) as Record<
    string,
    unknown
  >;
  const allowed = [
    'id',
    'version',
    'contractVersion',
    'inputSchema',
    'outputSchema',
    'rules',
    'instructions',
    'examples',
    'configuration',
    'implementation',
    'validation',
    'repairAttempts'
  ];
  if (!manifest || Object.keys(manifest).some((key) => !allowed.includes(key)))
    throw new RunError('invalid-definition', 'Unknown definition manifest field.', 'definition');
  const digest = createHash('sha256');
  digest.update(JSON.stringify(manifest));
  const read = async (name: unknown) => {
    if (
      typeof name !== 'string' ||
      path.isAbsolute(name) ||
      name.split(/[\\/]/).some((p) => p === '..' || p === '')
    )
      throw new RunError(
        'definition-path',
        'Definition files must have safe relative paths.',
        'definition'
      );
    const filename = path.resolve(root, name);
    const actual = await realpath(filename);
    if (!actual.startsWith(root + path.sep))
      throw new RunError('definition-path', 'Definition file escapes its directory.', 'definition');
    const text = await readText(filename, 2 * 1024 * 1024);
    digest.update(name);
    digest.update(text);
    return text;
  };
  const data: Definition = {
    id: manifest.id as string,
    version: manifest.version as string,
    contractVersion: manifest.contractVersion as '0.2',
    inputSchema: JSON.parse(await read(manifest.inputSchema)),
    outputSchema: JSON.parse(await read(manifest.outputSchema)),
    rules: await read(manifest.rules),
    instructions: await read(manifest.instructions),
    examples: manifest.examples ? JSON.parse(await read(manifest.examples)) : [],
    configuration: manifest.configuration as Definition['configuration'],
    validation: manifest.validation as Definition['validation'],
    repairAttempts: manifest.repairAttempts as number | undefined
  };
  // Undefined fields are omitted before the strict JSON snapshot.
  for (const key of Object.keys(data) as (keyof Definition)[])
    if (data[key] === undefined) delete data[key];
  data.fileDigest = digest.digest('hex');
  const implementation = manifest.implementation;
  if (implementation !== undefined) {
    if (typeof implementation !== 'string' || !Object.hasOwn(implementations, implementation))
      throw new RunError(
        'untrusted-definition',
        'Definition requests an implementation not configured by the caller.',
        'definition'
      );
    return resolveDefinition(implementations[implementation]!(data));
  }
  return resolveDefinition(data);
}
/** Explicit local module selection is trusted code execution; never expose this through HTTP input. */
export async function loadTrustedModule(filename: string): Promise<Definition> {
  const module = await import(pathToFileURL(await realpath(filename)).href);
  return resolveDefinition(module.default);
}
