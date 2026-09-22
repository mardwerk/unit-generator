import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareCharacter } from '../src/node/character-source.js';
import { defaultProfile, defaultProgression } from '../src/node/default-profile.js';

function page(
  pageid: number,
  title: string,
  extract: string,
  description = 'Fictional character from Example',
  index = 1,
) {
  return { pageid, title, extract, index, pageprops: { 'wikibase-shortdesc': description } };
}

type Page = ReturnType<typeof page>;
function wikipedia(search: Page[], full: Page[] = search): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://en.wikipedia.org');
    assert.equal(url.pathname, '/w/api.php');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    assert.equal(url.searchParams.get('formatversion'), '2');
    const id = url.searchParams.get('pageids');
    return Response.json({
      query: { pages: id ? full.filter((entry) => entry.pageid === Number(id)) : search },
    });
  };
}

const luffy = page(
  1,
  'Monkey D. Luffy',
  'Luffy is a fictional character. His body stretches.',
  'Fictional character from One Piece',
);

test('character name resolves to canonical identity with retrieved provenance and the explicit starter profile', async () => {
  const result = await prepareCharacter(' Luffy ', { fetch: wikipedia([luffy]) });
  assert.equal(result.kind, 'prepared');
  if (result.kind !== 'prepared') return;
  assert.equal(result.request.character.name, 'Monkey D. Luffy');
  assert.equal(result.request.character.work, 'One Piece');
  assert.deepEqual(result.request.progression, defaultProgression);
  assert.deepEqual(result.request.documents[1], defaultProfile);
  assert.equal(result.request.documents[0]?.text, luffy.extract);
  assert.equal(
    result.request.documents[0]?.origin.location,
    'https://en.wikipedia.org/wiki/Monkey_D._Luffy',
  );
  assert.equal(result.request.documents[0]?.origin.access, 'retrieved');
  assert.match(
    result.request.documents[0]!.origin.note!,
    /not exhaustive or independently verified canon/,
  );
  assert.equal(result.request.previous, null);
});

test('concept name intake selects qualitative rules without numerical profile evidence', async () => {
  const result = await prepareCharacter('Luffy', {
    fetch: wikipedia([luffy]),
    deliverable: 'concept',
  });
  assert.equal(result.kind, 'prepared');
  if (result.kind !== 'prepared') return;
  assert.equal(result.request.deliverable, 'concept');
  assert.equal(result.request.mechanicsDefinition, undefined);
  assert.equal(result.request.conceptRules?.id, 'public-concept');
  assert.ok(
    !result.request.documents.some(
      (document) =>
        document.id.startsWith('mechanics:') || document.id.startsWith('default-td-profile-'),
    ),
  );
});

test('ambiguity returns named choices and only accepts a current matching choice', async () => {
  const castlevania = page(
    2,
    'Alucard (Castlevania)',
    'A fictional character with a sword.',
    'Fictional character in Castlevania',
    2,
  );
  const hellsing = page(
    3,
    'Alucard (Hellsing)',
    'A fictional character with regeneration.',
    'Fictional character from Hellsing',
    1,
  );
  const disambiguation = {
    ...page(4, 'Alucard', 'A fictional character may refer to several things.'),
    pageprops: { 'wikibase-shortdesc': 'Disambiguation', disambiguation: '' },
  };
  const fetch = wikipedia([castlevania, disambiguation, hellsing]);
  const choices = await prepareCharacter('Alucard', { fetch });
  assert.equal(choices.kind, 'choices');
  if (choices.kind !== 'choices') return;
  assert.deepEqual(
    choices.choices.map(({ id, name }) => ({ id, name })),
    [
      { id: 3, name: 'Alucard (Hellsing)' },
      { id: 2, name: 'Alucard (Castlevania)' },
    ],
  );
  const selected = await prepareCharacter('Alucard', { fetch, choice: 3 });
  assert.equal(selected.kind, 'prepared');
  if (selected.kind === 'prepared') assert.equal(selected.request.character.work, 'Hellsing');
  await assert.rejects(
    prepareCharacter('Alucard', { fetch, choice: 4 }),
    /no longer in the search results/,
  );
  await assert.rejects(
    prepareCharacter('Alucard', { fetch, choice: 99 }),
    /no longer in the search results/,
  );
});

test('character entries cover list references without including the next character', async () => {
  const title = 'List of That Time I Got Reincarnated as a Slime characters';
  const full = page(
    10,
    title,
    [
      'Characters from That Time I Got Reincarnated as a Slime.',
      '== Main characters ==',
      'Rimuru Tempest (リムル・テンペスト, Rimuru Tenpesuto)',
      'Voiced by: Example actor',
      'Rimuru absorbs creatures and acquires their abilities.',
      'Veldora Tempest (ヴェルドラ, Berudora)',
      'Voiced by: Another actor',
      'Veldora has UNRELATED_DRAGON_POWER.',
      '== Other characters ==',
      'UNRELATED_OTHER_POWER',
    ].join('\n'),
    '',
  );
  Object.assign(full.pageprops, { wikibase_item: 'Q60035086' });
  const articleFetch = wikipedia([{ ...full, extract: 'A list of characters.' }], [full]);
  let identityQueries = 0;
  const result = await prepareCharacter('Rimuru Tempest', {
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === 'www.wikidata.org') {
        identityQueries++;
        assert.equal(url.searchParams.get('action'), 'wbsearchentities');
        assert.equal(url.searchParams.get('search'), 'Rimuru Tempest');
        assert.equal(
          url.searchParams.has('ids'),
          false,
          'A shared article ID is not a character identity',
        );
        return Response.json({ search: [] });
      }
      return articleFetch(input, init);
    },
  });
  assert.equal(identityQueries, 1, 'Search separately for the named character identity');
  assert.equal(result.kind, 'prepared');
  if (result.kind !== 'prepared') return;
  assert.equal(result.request.character.name, 'Rimuru Tempest');
  assert.equal(result.request.character.work, 'That Time I Got Reincarnated as a Slime');
  assert.match(result.request.documents[0]!.text, /absorbs creatures/);
  assert.doesNotMatch(result.request.documents[0]!.text, /UNRELATED|Veldora/);
  assert.match(result.request.documents[0]!.origin.location, /#Main_characters$/);
  assert.match(result.request.documents[0]!.origin.note!, /named entry/);
});

test('reversed Japanese name order resolves a named entry and retains shared-entry limitations', async () => {
  const title = 'The Irregular at Magic High School';
  const full = page(
    11,
    title,
    [
      'A story about magic.',
      '== Characters ==',
      '=== Main ===',
      'Tatsuya Shiba (司波 達也, Shiba Tatsuya) and Miyuki Shiba (司波 深雪, Shiba Miyuki)',
      'Tatsuya can decompose and reconstruct matter. Miyuki is his sister.',
      '=== Supporting ===',
      'Other people have UNRELATED_SUPPORTING_POWER.',
    ].join('\n'),
    'Japanese web novel series and its franchise',
  );
  const result = await prepareCharacter('Shiba Tatsuya', {
    fetch: wikipedia([{ ...full, extract: 'A Japanese web novel.' }], [full]),
  });
  assert.equal(result.kind, 'prepared');
  if (result.kind !== 'prepared') return;
  assert.equal(result.request.character.name, 'Tatsuya Shiba');
  assert.equal(result.request.character.work, title);
  assert.doesNotMatch(result.request.documents[0]!.text, /UNRELATED_SUPPORTING_POWER/);
  assert.match(
    result.request.documents[0]!.origin.note!,
    /shared entry may also discuss related characters/,
  );
  assert.match(
    result.request.character.scope,
    /Only attribute abilities to the requested character/,
  );
});

test('lookup does not treat real people, series names or passing mentions as character evidence', async () => {
  await assert.rejects(
    prepareCharacter('Actor', {
      fetch: wikipedia([
        page(20, 'Actor', 'An actor plays a fictional character.', 'American actor'),
      ]),
    }),
    /No matching/,
  );
  await assert.rejects(prepareCharacter('One Piece', { fetch: wikipedia([luffy]) }), /No matching/);
  const series = page(
    21,
    'A Series',
    '== Production ==\nRimuru Tempest (a guest) was mentioned in an interview.\nSome more production discussion.',
    'Japanese manga series',
  );
  await assert.rejects(
    prepareCharacter('Rimuru Tempest', { fetch: wikipedia([series]) }),
    /No matching/,
  );
});

test('unavailable, malformed and empty references produce actionable errors without remote payloads', async () => {
  await assert.rejects(
    prepareCharacter('Luffy', {
      fetch: async () => new Response('REMOTE_PRIVATE_PAYLOAD', { status: 429 }),
    }),
    /HTTP 429/,
  );
  await assert.rejects(
    prepareCharacter('Luffy', { fetch: async () => new Response('REMOTE_PRIVATE_PAYLOAD') }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /unreadable reference/);
      assert.doesNotMatch(error.message, /REMOTE_PRIVATE/);
      return true;
    },
  );
  await assert.rejects(
    prepareCharacter('Luffy', { fetch: wikipedia([luffy], [{ ...luffy, extract: ' ' }]) }),
    /no usable text/,
  );
  await assert.rejects(prepareCharacter('Luffy', { fetch: wikipedia([]) }), /No matching/);
  await assert.rejects(
    prepareCharacter('Luffy', {
      fetch: async () => {
        throw new Error('REMOTE_PRIVATE_NETWORK');
      },
    }),
    /lookup is unavailable/,
  );
});

test('lookup cancellation reaches HTTP and prevents subsequent retrieval', async () => {
  await assert.rejects(
    prepareCharacter('Luffy', {
      signal: AbortSignal.abort(),
      fetch: async () => assert.fail('Already cancelled'),
    }),
    /cancelled/,
  );
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    prepareCharacter('Luffy', {
      signal: controller.signal,
      fetch: async (_input, init) => {
        calls++;
        assert.ok(init?.signal);
        controller.abort();
        assert.equal(init.signal.aborted, true);
        return Response.json({ query: { pages: [luffy] } });
      },
    }),
    /cancelled/,
  );
  assert.equal(calls, 1);
});

test('unsupported names and choice IDs are rejected before fetching', async () => {
  const fetch: typeof globalThis.fetch = async () => assert.fail('Invalid input must not fetch');
  for (const name of ['', '   ', '!!!', 'x'.repeat(121)])
    await assert.rejects(prepareCharacter(name, { fetch }));
  for (const choice of [0, -1, 1.5, NaN])
    await assert.rejects(prepareCharacter('Luffy', { fetch, choice }));
});

test('prepared sources carry gathered images through the injected transport', async () => {
  const identified = { ...luffy, pageprops: { ...luffy.pageprops, wikibase_item: 'Q477948' } };
  const articleFetch = wikipedia([identified]);
  let identityQueries = 0;
  const result = await prepareCharacter('Luffy', {
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === 'www.wikidata.org') {
        identityQueries++;
        assert.equal(url.searchParams.get('ids'), 'Q477948');
        return Response.json({ entities: { Q477948: { claims: {} } } });
      }
      if (url.searchParams.get('generator') === 'images')
        return Response.json({
          query: {
            pages: [
              {
                title: 'File:Luffy_Infobox.png',
                imageinfo: [
                  {
                    url: 'https://upload.wikimedia.org/wikipedia/en/a/ab/Luffy.png',
                    descriptionurl: 'https://en.wikipedia.org/wiki/File:Luffy_Infobox.png',
                  },
                ],
              },
            ],
          },
        });
      return articleFetch(input, init);
    },
  });
  assert.equal(result.kind, 'prepared');
  assert.equal(identityQueries, 1);
  if (result.kind !== 'prepared') return;
  assert.equal(result.request.documents[0]?.visualReferences?.[0]?.kind, 'appearance');
  assert.match(result.request.documents[0]!.visualNotes!.join(' '), /not image analysis/);
});

test('second names and aliases in shared entries resolve to the character and its linked images', async () => {
  const title = 'The Irregular at Magic High School';
  const full = page(
    11,
    title,
    [
      '== Characters ==',
      '=== Main ===',
      'Tatsuya Shiba (司波 達也, Shiba Tatsuya) and Miyuki Shiba (司波 深雪, Shiba Miyuki, Snow Queen)',
      'Miyuki specializes in freezing magic and freezing consciousness. Tatsuya decomposes matter.',
      '=== Supporting ===',
      'UNRELATED_SUPPORTING_POWER',
    ].join('\n'),
    'Japanese web novel series and its franchise',
  );
  const articleFetch = wikipedia([{ ...full, extract: 'A Japanese web novel.' }], [full]);
  for (const query of ['Miyuki Shiba', 'Shiba Miyuki', 'Snow Queen', '司波 深雪']) {
    const result = await prepareCharacter(query, {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.searchParams.get('generator') === 'images')
          return Response.json({ query: { pages: [] } });
        if (url.searchParams.get('action') === 'wbsearchentities') {
          assert.equal(url.searchParams.get('search'), 'Miyuki Shiba');
          return Response.json({
            search: [
              {
                id: 'Q20448698',
                label: 'Miyuki Shiba',
                description: `fictional character from ${title}`,
              },
            ],
          });
        }
        if (url.hostname === 'www.wikidata.org')
          return Response.json({
            entities: {
              Q20448698: {
                claims: {
                  P6262: [
                    {
                      mainsnak: {
                        datavalue: { value: 'mahouka-koukou-no-rettousei:Shiba_Miyuki' },
                      },
                    },
                  ],
                },
              },
            },
          });
        if (url.hostname.endsWith('.fandom.com')) {
          assert.equal(url.searchParams.get('page'), 'Shiba_Miyuki');
          return Response.json({
            parse: {
              text: {
                '*': '<p>Miyuki is an ice magician.</p><h2>Abilities</h2><p>Miyuki freezes nearby targets with ice magic.</p><figure><img src="https://static.wikia.nocookie.net/mahouka/images/a/ab/Shiba-Miyuki-Fullbody.png" width="268"><figcaption>Miyuki portrait</figcaption></figure>',
              },
            },
          });
        }
        return articleFetch(input, init);
      },
    });
    assert.equal(result.kind, 'prepared');
    if (result.kind !== 'prepared') continue;
    assert.equal(result.request.character.name, 'Miyuki Shiba');
    assert.equal(result.request.character.work, title);
    const source = result.request.documents[0]!;
    assert.match(source.text, /freezing consciousness/);
    assert.doesNotMatch(source.text, /UNRELATED/);
    assert.match(source.origin.location, /#Main$/);
    assert.match(source.origin.note!, /shared entry/);
    assert.equal(source.visualReferences?.length, 1);
    assert.equal(source.visualReferences?.[0]?.kind, 'appearance');
    assert.match(source.visualReferences![0]!.sourceUrl, /Shiba_Miyuki/);
    const enriched = result.request.documents.find((doc) => doc.id.startsWith('character-wiki:'))!;
    assert.match(enriched.text, /freezes nearby targets/);
    assert.equal(enriched.kind, 'source');
    assert.equal(
      enriched.origin.location,
      'https://mahouka-koukou-no-rettousei.fandom.com/wiki/Shiba_Miyuki',
    );
    assert.match(enriched.origin.note!, /secondary source/);
    assert.equal('sourceDocuments' in source, false);
  }
});
