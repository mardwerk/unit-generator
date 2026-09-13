// Local test transports. Replies are synthetic fixtures, never real-model quality evidence.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createBundledFixture } from '@mardwerk/unit-definitions';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('UNIT_'))
);
const requests = [];
const model = createServer(async (request, response) => {
  if (request.method === 'GET') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(request.url === '/requests' ? requests : { status: 'fixture' }));
    return;
  }
  try {
    let body = '';
    for await (const chunk of request) body += chunk;
    const call = JSON.parse(body);
    const prompt = JSON.parse(call.messages.find((message) => message.role === 'user').content);
    const wrapped = prompt.input;
    const input = wrapped.characterEvidence ? wrapped.request : wrapped;
    const subject = input.subject ?? input.request?.subject ?? 'Fixture unit';
    requests.push({ model: call.model, reasoningEffort: call.reasoning_effort, subject });
    if (subject === 'Failing transport') {
      response.writeHead(503).end('Synthetic endpoint failure');
      return;
    }
    const schema = prompt.outputSchema ?? call.response_format?.json_schema?.schema;
    let value;
    if (schema?.properties?.identity) {
      const source = input.sources[0];
      value = {
        subject,
        identity: {
          status: 'resolved',
          name: subject,
          continuity: input.continuity,
          explanation: 'Synthetic research reply used only by browser tests.'
        },
        claims: [{ text: source.content, sourceIds: [source.id], kind: 'evidence' }],
        gaps: []
      };
    } else if (schema?.properties?.status && schema?.properties?.claims) {
      const source = wrapped.characterEvidence[0].sources[0];
      value = {
        status: 'checked',
        claims: input.reviewTargets.map((target) => {
          const base = target.path === '/' ? '' : target.path;
          const object = base
            .split('/')
            .slice(1)
            .reduce(
              (value, key) => value[key.replaceAll('~1', '/').replaceAll('~0', '~')],
              input.candidate
            );
          const field =
            typeof object.name === 'string'
              ? 'name'
              : typeof object.displayName === 'string'
                ? 'displayName'
                : 'description';
          return {
            path: `${base}/${field}`,
            sourceMechanic: 'Precise bolts',
            relationship: 'game-rule',
            claim: target.name || target.description,
            status: 'adapted',
            sourceId: source.id,
            passageId: source.passages[0].id,
            explanation:
              'Synthetic source-review reply for UI transport verification. This fixture does not assess source fidelity.'
          };
        }),
        gaps: []
      };
    } else {
      const id = String(schema?.$id ?? '');
      const definition = id.includes('manga-mayhem')
        ? 'manga-mayhem'
        : id.includes('btd6-derived')
          ? id.includes('0.2')
            ? 'tower-defense'
            : 'btd6-derived'
          : 'classic-three-path';
      value = createBundledFixture(definition, { subject, kind: 'original' });
    }
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        model: call.model,
        choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 200 }
      })
    );
  } catch (error) {
    console.error('Fixture endpoint failed:', error);
    response.writeHead(500).end('Fixture endpoint failed');
  }
});
await new Promise((resolve) => model.listen(port + 1, '127.0.0.1', resolve));
const processes = ['unconfigured', 'configured', 'invalid'].map((configuration) => {
  const appPort = port + (configuration === 'configured' ? 2 : configuration === 'invalid' ? 3 : 0);
  const configured = configuration === 'configured';
  const env = {
    ...cleanEnv,
    HOST: '127.0.0.1',
    PORT: String(appPort),
    ORIGIN: `http://127.0.0.1:${appPort}`,
    ...(configuration === 'invalid' ? { UNIT_PROVIDER: 'missing-connection' } : {}),
    UNIT_COMMAND_EXECUTABLE: process.execPath,
    UNIT_COMMAND_ARGS: JSON.stringify([
      fileURLToPath(new URL('./slow-model.mjs', import.meta.url))
    ]),
    ...(configured
      ? {
          UNIT_OPENAI_ENDPOINT: `http://127.0.0.1:${port + 1}/v1/chat/completions`,
          UNIT_MODEL_STRUCTURED: 'false'
        }
      : {})
  };
  return spawn(process.execPath, ['start.mjs'], { env, stdio: 'inherit' });
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill('SIGTERM');
  model.close();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
for (const child of processes) child.on('exit', () => stop());
