#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { requestFileSchema } from '../node/request-file.js';
import { startLab } from './server.js';
import { LabProvider } from './providers.js';
import { loadLocalEnvironment } from '../node/environment.js';

async function main() {
  loadLocalEnvironment();
  const { values } = parseArgs({
    options: {
      port: { type: 'string' },
      provider: { type: 'string' },
      model: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  });
  if (values.help) {
    process.stdout.write(
      'Usage: mardwerk-unit [--port 4317] [--provider openrouter|codex] [--model NAME]\n' +
        'Starts the local Unit app. Default: OpenRouter free models. Configure your key in Settings\n' +
        'or OPENROUTER_API_KEY. Use --provider codex for your existing local Codex login.\n',
    );
    return;
  }
  const port = Number(values.port ?? '4317');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('--port must be an integer from 1 to 65535.');
  }
  const example = requestFileSchema.parse(
    JSON.parse(
      await readFile(
        new URL('../../data/reference/dart-monkey.request.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  const provider = new LabProvider({
    provider: (values.provider as 'openrouter' | 'codex') ?? 'openrouter',
    ...(values.model ? { model: values.model } : {}),
  });
  const lab = await startLab({ provider, example, port });
  process.stdout.write(`mardwerk-unit is ready: ${lab.url}\nKeep this terminal open.\n`);
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    void lab.close().catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'Could not close mardwerk-unit.'}\n`,
      );
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `mardwerk-unit: ${error instanceof Error ? error.message : 'Could not start.'}\n`,
  );
  process.exitCode = 1;
});
