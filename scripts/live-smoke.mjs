import { readFile, writeFile } from 'node:fs/promises';
import { generate, research } from '../packages/core/dist/index.js';
import { loadBundledDefinition } from '../packages/definitions/dist/index.js';
import { createProvidersFromEnv } from '../packages/providers/dist/index.js';

try {
  process.loadEnvFile('.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const configured = createProvidersFromEnv();
if (!configured.execution.model)
  throw new Error('Configure a live model before running this opt-in check.');
const definition = await loadBundledDefinition();
const cases = JSON.parse(
  await readFile(new URL('../fixtures/smoke-source-material.json', import.meta.url), 'utf8')
);
const results = [];
const execution = {
  ...configured.execution,
  limits: {
    ...configured.execution.limits,
    timeoutMs: 900000,
    callTimeoutMs: 300000,
    maxModelCalls: 3,
    maxRepairs: 1
  },
  onProgress: (event) => {
    if (event.type === 'progress') process.stderr.write(JSON.stringify(event) + '\n');
  }
};
if (process.argv.includes('--discovery')) {
  const result = await research(
    { subject: 'Monkey D. Luffy' },
    {
      ...execution,
      policy: { network: 'allow', discovery: true, followLinks: false, allowUngrounded: false }
    }
  );
  results.push({ case: 'name-only-discovery', result });
  process.stdout.write(
    JSON.stringify({
      case: 'name-only-discovery',
      status: result.status,
      grounding: result.grounding,
      sourceBytes: result.sources.reduce((n, source) => n + Buffer.byteLength(source.content), 0),
      error: result.error
    }) + '\n'
  );
}
const selectedCase = process.argv.indexOf('--case');
for (const entry of cases.filter(
  (entry) => selectedCase < 0 || entry.subject === process.argv[selectedCase + 1]
)) {
  const { content, ...input } = entry;
  const source = {
    id: 'fixed-smoke-material',
    title: 'Supplied smoke-test character material',
    content,
    origin: 'supplied',
    status: 'read',
    truncated: false,
    omissions: []
  };
  const result = await generate(
    definition,
    { ...input, sources: [source] },
    { ...execution, policy: { network: 'deny', discovery: false, allowUngrounded: false } }
  );
  results.push({ case: entry.subject, result });
  process.stdout.write(
    JSON.stringify({
      case: entry.subject,
      status: result.status,
      error: result.error,
      calls: result.metadata.calls,
      issues: [
        result.validation.structure,
        result.validation.system,
        result.validation.constraints
      ].flatMap((report) => report.issues),
      summary: result.output?.summary,
      researchStatus: result.research[0]?.status
    }) + '\n'
  );
}
const outIndex = process.argv.indexOf('--out');
if (outIndex >= 0) {
  if (!process.argv[outIndex + 1]) throw new Error('--out requires a new file path.');
  await writeFile(process.argv[outIndex + 1], JSON.stringify(results, null, 2) + '\n', {
    flag: 'wx'
  });
}
if (results.some(({ result }) => result.status !== 'success')) process.exitCode = 1;
