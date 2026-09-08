import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createLunaExecution, assertLunaReply } from './execution-policy.mjs';

test('command configuration cannot bypass the authorized HTTP model', async (t) => {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        model: 'gpt-5.6-luna',
        choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }]
      })
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const execution = createLunaExecution(
    {
      UNIT_PROVIDER: 'command',
      UNIT_COMMAND_EXECUTABLE: '/must-not-execute',
      UNIT_COMMAND_ARGS: 'invalid configuration that must not be parsed',
      UNIT_OPENAI_MODEL: 'unauthorized-model',
      UNIT_OPENAI_ENDPOINT: `http://127.0.0.1:${server.address().port}/v1/chat/completions`
    },
    { effort: 'high', streaming: false }
  );
  const reply = await execution.model.generate({
    stage: 'offline-http-test',
    instructions: 'Return the fixture.',
    input: {},
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok'],
      properties: { ok: { type: 'boolean' } }
    },
    maxOutputTokens: 100,
    maxOutputBytes: 10000,
    signal: AbortSignal.timeout(5000)
  });
  assertLunaReply(reply);
  assert.deepEqual(reply.value, { ok: true });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].model, 'gpt-5.6-luna');
  assert.equal(requests[0].reasoning_effort, 'high');
});

test('missing HTTP configuration and unknown reply identities fail closed', () => {
  assert.throws(
    () =>
      createLunaExecution(
        {
          UNIT_PROVIDER: 'command',
          UNIT_COMMAND_EXECUTABLE: '/must-not-execute'
        },
        { effort: 'medium' }
      ),
    /No configured Luna HTTP provider/
  );
  assert.throws(() => assertLunaReply({}), /different model/);
  assert.throws(() => assertLunaReply({ model: 'another-model' }), /different model/);
  assert.doesNotThrow(() => assertLunaReply({ model: 'gpt-5.6-luna' }));
});
