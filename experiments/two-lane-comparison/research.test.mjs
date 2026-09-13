import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearch } from './research.mjs';

function fixture() {
  const calls = [];
  return {
    calls,
    async discover(query) {
      calls.push(['search', query]);
      return [{ title: 'Monkey D. Luffy', url: 'https://en.wikipedia.org/wiki/Monkey_D._Luffy' }];
    },
    async acquire(urls, options) {
      calls.push(['read', urls[0]]);
      options.onSource({
        id: 'source-1',
        url: urls[0],
        title: 'Monkey D. Luffy',
        content: 'a'.repeat(13000) + 'Haki and Gear evidence',
        origin: 'retrieved',
        status: 'read',
        truncated: false,
        omissions: []
      });
    }
  };
}
test('baseline discovers and reads evidence with the actual standard excerpt limit', async () => {
  const adapter = fixture();
  const session = createResearch({ sourceAdapter: adapter }).createSession({});
  const research = await session.baseline();
  assert.equal(research.sources[0].excerpt.length, 12000);
  assert.equal(research.sources[0].excerptTruncated, true);
  assert.equal(session.snapshot().sources[0].content.includes('Haki'), true);
  assert.equal(adapter.calls.length, 2);
});
test('integrated research can request evidence after the baseline excerpt without hidden inventory', async () => {
  const adapter = fixture();
  const session = createResearch({ sourceAdapter: adapter }).createSession({});
  await session.execute('search_sources', { query: 'Monkey D. Luffy powers' });
  const source = await session.execute('read_source', {
    url: 'https://en.wikipedia.org/wiki/Monkey_D._Luffy',
    offset: 13000,
    maxCharacters: 1000
  });
  assert.equal(source.excerpt, 'Haki and Gear evidence');
  assert.equal(source.id, 'source-1');
  assert.equal(session.snapshot().sources.length, 1);
});
test('rejects arbitrary URLs, bounds requests, and isolates attempt evidence', async () => {
  const adapter = fixture();
  const research = createResearch({ sourceAdapter: adapter, limits: { maxRequests: 2 } });
  const session = research.createSession({});
  await assert.rejects(
    session.execute('read_source', { url: 'http://127.0.0.1/private' }),
    /scope/
  );
  await session.execute('search_sources', { query: 'Luffy' });
  await assert.rejects(session.execute('search_sources', { query: 'Luffy' }), /limit/);
  assert.equal(research.createSession({}).snapshot().events.length, 0);
});
