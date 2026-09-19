import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { CodexModelClient } from '../node/codex.js';
import { requestFileSchema } from '../node/request-file.js';
import { startLab } from './server.js';

async function main() {
  const { values } = parseArgs({
    options: { port: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
    strict: true,
  });
  if (values.help) {
    process.stdout.write(
      'Usage: pnpm lab [--port 4317]\nStarts the local UnitLab using your configured Codex connection.\n',
    );
    return;
  }
  const port = Number(values.port ?? '4317');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('--port must be an integer from 1 to 65535.');
  }
  const example = requestFileSchema.parse(
    JSON.parse(
      await readFile(new URL('../../examples/mira.request.json', import.meta.url), 'utf8'),
    ),
  );
  const lab = await startLab({ model: new CodexModelClient(), example, port });
  process.stdout.write(
    `UnitLab is ready: ${lab.url}\nUses your existing Codex connection. Keep this terminal open.\n`,
  );
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    void lab.close().catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'Could not close UnitLab.'}\n`,
      );
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

main().catch((error: unknown) => {
  process.stderr.write(`UnitLab: ${error instanceof Error ? error.message : 'Could not start.'}\n`);
  process.exitCode = 1;
});
