import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractFandomSource,
  extractFandomVisuals,
  gatherCharacterVisuals,
} from '../src/node/character-visuals.js';

const input = { name: 'Monkey D. Luffy', articleTitle: 'Monkey D. Luffy', wikidataId: 'Q477948' };
const page = new URL('https://onepiece.fandom.com/wiki/Monkey_D._Luffy');
const cdn = 'https://static.wikia.nocookie.net/onepiece/images/a/ab/';
function picture(file: string, caption: string, attributes = '') {
  return `<figure><a href="/wiki/File:${file}"><img src="${cdn}${file}/revision/latest" width="300" ${attributes}></a><figcaption>${caption}</figcaption></figure>`;
}
function wikimedia(source = 'https://en.wikipedia.org/wiki/File:Luffy_Infobox.png') {
  return Response.json({
    query: {
      pages: [
        {
          title: 'File:Luffy_Infobox.png',
          imageinfo: [
            {
              url: 'https://upload.wikimedia.org/wikipedia/en/a/ab/Luffy.png',
              thumburl:
                'https://upload.wikimedia.org/wikipedia/en/thumb/a/ab/Luffy.png/480px-Luffy.png',
              descriptionurl: source,
              extmetadata: {
                Artist: { value: '<a href="https://example.test">Artist Name</a>' },
                LicenseShortName: { value: 'Fair use' },
                CommonsMetadataExtension: { value: 1.2 },
              },
            },
          ],
        },
      ],
    },
  });
}
function wikidata(value = 'onepiece:Monkey_D._Luffy') {
  return Response.json({
    entities: { Q477948: { claims: { P6262: [{ mainsnak: { datavalue: { value } } }] } } },
  });
}
function parsed(html: string) {
  return Response.json({ parse: { text: { '*': html } } });
}

test('visual gathering tolerates numeric wiki metadata and combines cited character images with balanced kinds', async () => {
  const targets: string[] = [];
  const result = await gatherCharacterVisuals(input, {
    fetch: async (request, init) => {
      const url = new URL(String(request));
      assert.equal(init?.redirect, 'error');
      assert.ok(init?.signal);
      targets.push(url.href);
      if (url.hostname === 'en.wikipedia.org') {
        assert.equal(url.searchParams.get('generator'), 'images');
        return wikimedia();
      }
      if (url.hostname === 'www.wikidata.org') return wikidata();
      assert.equal(url.hostname, 'onepiece.fandom.com');
      const title = url.searchParams.get('page');
      if (title === 'Monkey_D._Luffy')
        return parsed(
          picture('Luffy_Portrait.png', 'Luffy portrait') +
            '<a href="/wiki/Monkey_D._Luffy/Gallery">Gallery</a>' +
            '<a href="/wiki/Monkey_D._Luffy/Abilities_and_Powers">Abilities</a>' +
            '<a href="/wiki/Zoro/Gallery">Other character</a>' +
            '<a href="https://evil.example/wiki/Monkey_D._Luffy/Gallery">Off-site</a>',
        );
      if (title === 'Monkey_D._Luffy/Abilities_and_Powers')
        return parsed(
          picture('Luffy_Punch.png', 'Luffy stretches his arm to punch a Sea King.') +
            Array.from({ length: 12 }, (_, n) =>
              picture(`Luffy_Gear_${n}.png`, `Luffy in Gear ${n}.`),
            ).join(''),
        );
      assert.equal(title, 'Monkey_D._Luffy/Gallery');
      return parsed(
        picture('Luffy_Punch.png', 'Duplicate gallery caption') +
          picture('Luffy_Stance.png', 'Luffy fighting stance'),
      );
    },
  });
  assert.equal(targets.length, 5);
  assert.equal(result.visualReferences.length, 9);
  assert.deepEqual(
    new Set(result.visualReferences.map((image) => image.kind)),
    new Set(['appearance', 'form', 'pose']),
  );
  assert.equal(new Set(result.visualReferences.map((image) => image.id)).size, 9);
  assert.ok(result.visualReferences.some((image) => image.caption.includes('Sea King')));
  assert.ok(result.visualReferences.some((image) => image.attribution === 'Artist Name. Fair use'));
  assert.ok(result.visualReferences.every((image) => image.sourceUrl.startsWith('https://')));
  assert.match(result.visualNotes[0]!, /not image analysis/);
  assert.ok(!result.visualNotes.some((note) => note.includes('unavailable')));
});

test('caption extraction labels forms and actions without mistaking game titles or navigation for poses', () => {
  const html = [
    picture('Luffy_Infobox.png', 'Luffy appearance'),
    picture('Luffy_Gear_5.png', 'Luffy using Gear 5.'),
    picture('Pistol.png', 'Luffy stretches his arm to punch.'),
    picture('Luffy_Super_Grand_Battle_X.png', 'Luffy Super Grand Battle X'),
    `<div class="navibox">${picture('Luffy_Navigation.png', 'Luffy pose')}</div>`,
    `<nav>${picture('Luffy_Nav.png', 'Luffy pose')}</nav>`,
    picture('Luffy_Logo.png', 'Luffy'),
    picture('Luffy_Banner.png', 'Luffy flag'),
    picture('Zoro.png', 'Zoro fighting'),
    '<img src="https://static.wikia.nocookie.net/onepiece/images/a/Luffy_Tiny.png" width="32">',
    picture('Luffy_Infobox.png', 'Duplicate'),
  ].join('');
  const images = extractFandomVisuals(html, page, input.name);
  assert.deepEqual(
    images.map((image) => image.kind),
    ['appearance', 'form', 'pose', 'reference'],
  );
  assert.equal(images.length, 4);
  assert.equal(images[2]!.caption, 'Luffy stretches his arm to punch.');
  assert.doesNotMatch(
    JSON.stringify(images),
    /Navigation|Luffy_Nav|Logo|Banner|Zoro|Tiny|Duplicate/,
  );
});

test('visual URL restrictions reject unsafe sources and malformed images without losing valid references', async () => {
  const html =
    picture('Luffy_Valid.png', 'Luffy portrait') +
    '<img src="https://static.wikia.nocookie.net/onepiece/images/a/Luffy_%ZZ.png" width="300">' +
    '<img src="https://static.wikia.nocookie.net.evil.test/Luffy.png" alt="Luffy pose" width="300">' +
    '<img src="http://static.wikia.nocookie.net/Luffy.png" alt="Luffy pose" width="300">' +
    '<img src="https://secret:token@static.wikia.nocookie.net/Luffy.png" alt="Luffy pose" width="300">' +
    `<a href="https://secret:token@onepiece.fandom.com/wiki/File:Luffy.png"><img src="${cdn}Luffy_Second.png" width="300" alt="Luffy stance"></a>`;
  const images = extractFandomVisuals(html, page, input.name);
  assert.equal(images.length, 2);
  assert.equal(images[1]!.sourceUrl, page.href);
  assert.doesNotMatch(JSON.stringify(images), /secret|token|evil/);
  assert.deepEqual(
    extractFandomVisuals(
      html,
      new URL('https://onepiece.fandom.com.evil.test/wiki/Luffy'),
      input.name,
    ),
    [],
  );
  const result = await gatherCharacterVisuals(
    { name: input.name, articleTitle: input.articleTitle },
    {
      fetch: async () => wikimedia('https://enXwikipediaYorg/wiki/File:Luffy.png'),
    },
  );
  assert.equal(result.visualReferences.length, 0);
});

test('missing visual sources and failed linked pages remain nonfatal and visible', async () => {
  const missing = await gatherCharacterVisuals(input, {
    fetch: async () => new Response('PRIVATE_REMOTE_ERROR', { status: 503 }),
  });
  assert.deepEqual(missing.visualReferences, []);
  assert.match(
    missing.visualNotes.join(' '),
    /No usable character images|sources were unavailable/,
  );
  assert.doesNotMatch(missing.visualNotes.join(' '), /PRIVATE_REMOTE/);
  const partial = await gatherCharacterVisuals(input, {
    fetch: async (request) => {
      const url = new URL(String(request));
      if (url.hostname === 'en.wikipedia.org') return wikimedia();
      if (url.hostname === 'www.wikidata.org') return wikidata();
      if (url.searchParams.get('page') === 'Monkey_D._Luffy')
        return parsed(
          picture('Luffy_Portrait.png', 'Luffy portrait') +
            '<a href="/wiki/Monkey_D._Luffy/Gallery">Gallery</a>',
        );
      return new Response('Unavailable', { status: 503 });
    },
  });
  assert.equal(partial.visualReferences.length, 2);
  assert.match(partial.visualNotes.join(' '), /sources were unavailable/);
  assert.match(partial.visualNotes.join(' '), /No labeled action-pose/);
});

test('unverified Fandom identities cannot redirect research to another host', async () => {
  const targets: string[] = [];
  for (const identity of ['https://evil.test/path', 'bad_host:Character', 'vsbattles:Luffy']) {
    await gatherCharacterVisuals(input, {
      fetch: async (request) => {
        const url = new URL(String(request));
        targets.push(url.hostname);
        if (url.hostname === 'en.wikipedia.org') return wikimedia();
        assert.equal(url.hostname, 'www.wikidata.org');
        return wikidata(identity);
      },
    });
  }
  assert.deepEqual(new Set(targets), new Set(['en.wikipedia.org', 'www.wikidata.org']));
});

test('visual cancellation reaches requests and never becomes an ordinary image gap', async () => {
  await assert.rejects(
    gatherCharacterVisuals(input, {
      signal: AbortSignal.abort(),
      fetch: async () => assert.fail('Already cancelled'),
    }),
    { name: 'AbortError' },
  );
  const controller = new AbortController();
  const pending = gatherCharacterVisuals(input, {
    signal: controller.signal,
    fetch: async (_request, init) =>
      new Promise<Response>((_resolve, reject) => {
        assert.ok(init?.signal);
        init.signal.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
      }),
  });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

const rimuru = {
  name: 'Rimuru Tempest',
  articleTitle: 'List of That Time I Got Reincarnated as a Slime characters',
  work: 'That Time I Got Reincarnated as a Slime',
};
const rimuruIdentity = {
  id: 'Q104817112',
  label: 'Rimuru Tempest',
  description: 'fictional character from That Time I Got Reincarnated as a Slime',
};

test('a shared article discovers a separate character identity and its cited images', async () => {
  const targets: URL[] = [];
  const result = await gatherCharacterVisuals(rimuru, {
    fetch: async (request, init) => {
      const url = new URL(String(request));
      targets.push(url);
      assert.equal(init?.redirect, 'error');
      if (url.hostname === 'en.wikipedia.org') return Response.json({ query: { pages: [] } });
      if (url.searchParams.get('action') === 'wbsearchentities') {
        assert.equal(url.searchParams.get('search'), 'Rimuru Tempest');
        return Response.json({ search: [rimuruIdentity] });
      }
      if (url.hostname === 'www.wikidata.org') {
        assert.equal(url.searchParams.get('ids'), 'Q104817112');
        return Response.json({
          entities: {
            Q104817112: {
              claims: {
                P6262: [
                  { mainsnak: { datavalue: { value: 'isekai:Ten-sura' } } },
                  { mainsnak: { datavalue: { value: 'tensura:Rimuru_Tempest' } } },
                ],
              },
            },
          },
        });
      }
      assert.equal(url.hostname, 'tensura.fandom.com');
      assert.equal(url.searchParams.get('page'), 'Rimuru_Tempest');
      return parsed(picture('Rimuru_Tempest.png', 'Rimuru Tempest portrait'));
    },
  });
  assert.equal(targets.length, 4);
  assert.equal(result.visualReferences.length, 1);
  assert.equal(
    result.visualReferences[0]!.sourceUrl,
    'https://tensura.fandom.com/wiki/File:Rimuru_Tempest.png',
  );
  assert.match(result.visualReferences[0]!.attribution!, /tensura.fandom.com/);
  assert.match(result.visualNotes.join(' '), /Wikipedia reference contains no usable images/);
});

test('identity fallback rejects series, wrong works, partial names and ambiguous characters', async () => {
  for (const search of [
    [],
    [
      {
        ...rimuruIdentity,
        description: 'Japanese light novel series That Time I Got Reincarnated as a Slime',
      },
    ],
    [{ ...rimuruIdentity, description: 'fictional character from Another Slime Series' }],
    [{ ...rimuruIdentity, label: 'Veldora Tempest' }],
    [{ ...rimuruIdentity, label: 'Rimuru Tempest companions' }],
    [rimuruIdentity, { ...rimuruIdentity, id: 'Q123' }],
  ]) {
    const result = await gatherCharacterVisuals(rimuru, {
      fetch: async (request) => {
        const url = new URL(String(request));
        if (url.hostname === 'en.wikipedia.org') return Response.json({ query: { pages: [] } });
        assert.equal(url.hostname, 'www.wikidata.org');
        assert.equal(url.searchParams.get('action'), 'wbsearchentities');
        return Response.json({ search });
      },
    });
    assert.equal(result.visualReferences.length, 0);
    assert.match(result.visualNotes.join(' '), /No unique character identity.*Inputs and rules/);
  }
});

test('missing character links and lookup failures identify an actionable image gap', async () => {
  const noLink = await gatherCharacterVisuals(input, {
    fetch: async (request) =>
      new URL(String(request)).hostname === 'en.wikipedia.org'
        ? Response.json({ query: { pages: [] } })
        : wikidata('onepiece:One_Piece'),
  });
  assert.equal(noLink.visualReferences.length, 0);
  assert.match(noLink.visualNotes.join(' '), /no supported character-specific wiki link/);
  const unavailable = await gatherCharacterVisuals(rimuru, {
    fetch: async () => new Response('PRIVATE_REMOTE', { status: 503 }),
  });
  assert.match(unavailable.visualNotes.join(' '), /Wikipedia image sources were unavailable/);
  assert.match(
    unavailable.visualNotes.join(' '),
    /Character-wiki image sources were unavailable.*Inputs and rules/,
  );
  assert.doesNotMatch(unavailable.visualNotes.join(' '), /PRIVATE_REMOTE/);
});

test('fullbody references count as appearance while surname-matched buildings are excluded', () => {
  const images = extractFandomVisuals(
    picture('Shiba-Miyuki-Fullbody.png', 'Anime S3') +
      picture('Shiba_Residence.png', 'Shiba Residence') +
      picture('Residence_At_Night.png', "Shiba siblings' house") +
      picture('Flying_Magic.gif', 'Miyuki using Flying Magic'),
    new URL('https://mahouka-koukou-no-rettousei.fandom.com/wiki/Shiba_Miyuki'),
    'Miyuki Shiba',
  );
  assert.deepEqual(
    images.map((image) => image.kind),
    ['appearance', 'pose'],
  );
});

test('a full-body reference survives the image cap and missing coverage is explicit', async () => {
  const gather = (withFullBody: boolean) =>
    gatherCharacterVisuals(input, {
      fetch: async (request) => {
        const url = new URL(String(request));
        if (url.hostname === 'en.wikipedia.org') return wikimedia();
        if (url.hostname === 'www.wikidata.org') return wikidata();
        return parsed(
          Array.from({ length: 15 }, (_, index) =>
            picture(`Luffy_Portrait_${index}.png`, 'Luffy portrait'),
          ).join('') + (withFullBody ? picture('Luffy_Fullbody.png', 'Anime reference') : ''),
        );
      },
    });
  const result = await gather(true);
  assert.equal(result.visualReferences.length, 9);
  assert.ok(result.visualReferences.some((reference) => reference.id.includes('Fullbody')));
  assert.ok(!result.visualNotes.some((note) => note.startsWith('No full-body')));
  assert.match(
    (await gather(false)).visualNotes.join(' '),
    /No full-body reference identified by source captions or filenames/,
  );
});

test('source dimensions are retained only as a valid pair without rejecting useful images', async () => {
  const images = extractFandomVisuals(
    picture('Luffy_Anime_Infobox.png', 'Anime image', 'height="900"') +
      picture('Luffy_Another.png', 'Another image', 'height="invalid"'),
    page,
    input.name,
  );
  assert.equal(images[0]?.width, 300);
  assert.equal(images[0]?.height, 900);
  assert.equal(images[1]?.width, undefined);
  assert.equal(images[1]?.height, undefined);
  const result = await gatherCharacterVisuals(input, {
    fetch: async (request) => {
      const url = new URL(String(request));
      if (url.hostname === 'en.wikipedia.org') {
        const data = await wikimedia().json();
        data.query.pages[0].imageinfo[0].width = 'invalid optional metadata';
        data.query.pages[0].imageinfo[0].height = 500;
        return Response.json(data);
      }
      if (url.hostname === 'www.wikidata.org') return wikidata();
      return parsed('');
    },
  });
  assert.equal(result.visualReferences.length, 1);
  assert.equal(result.visualReferences[0]?.width, undefined);
});

test('reused character article text prioritizes abilities and removes unrelated HTML', () => {
  const html = `<div class="mw-parser-output">
    <p>Luffy is a pirate with an elastic body.</p>
    <div class="portable-infobox"><p>INFOBOX EXCLUDED CONTENT</p></div>
    <nav><p>NAVIGATION EXCLUDED CONTENT</p></nav>
    <h2>Background</h2><p>BIOGRAPHY EXCLUDED CONTENT</p>
    <h2>Abilities</h2><h3>Elastic attacks</h3>
    <p>Luffy stretches his arms to punch distant opponents.<sup class="reference">CITATION EXCLUDED</sup></p>
    <figure><p>IMAGE CAPTION EXCLUDED</p></figure>
    <h2>References</h2><ol class="references"><li>REFERENCE EXCLUDED CONTENT</li></ol>
    <script>UNTRUSTED SCRIPT</script></div>`;
  const doc = extractFandomSource(html, page, input.name)!;
  assert.ok(doc.text.startsWith('Abilities'));
  assert.match(doc.text, /stretches his arms to punch/);
  assert.match(doc.text, /pirate with an elastic body/);
  assert.doesNotMatch(doc.text, /EXCLUDED|SCRIPT/);
  assert.equal(doc.origin.location, page.href);
  assert.match(doc.origin.note!, /fan-maintained secondary source/);
  assert.match(doc.origin.note!, /not independently verified canon/);
  assert.equal(extractFandomSource(html, new URL(`${page.href}/Gallery`), input.name), null);
  assert.equal(extractFandomSource(html, page, 'Other Character'), null);
  assert.equal(
    extractFandomSource(html, new URL('https://evil.test/wiki/Monkey_D._Luffy'), input.name),
    null,
  );
});

test('source extraction caps text and retains ability paragraphs on observed ability subpages', () => {
  const url = new URL(`${page.href}/Abilities_and_Powers`);
  const html = `<div class="mw-parser-output"><h2>Elastic body</h2>${Array.from({ length: 100 }, (_, i) => `<p>Attack ${i}: Luffy extends a rubber punch. ${'Repeated source detail. '.repeat(20)}</p>`).join('')}</div>`;
  const doc = extractFandomSource(html, url, input.name)!;
  assert.ok(doc.text.length <= 12000);
  assert.match(doc.text, /Attack 0/);
  assert.match(doc.origin.note!, /capped at 12000/);
});

test('text enrichment uses the same profile and observed subpage requests as visuals', async () => {
  const urls: string[] = [];
  const result = await gatherCharacterVisuals(input, {
    fetch: async (request) => {
      const url = new URL(String(request));
      urls.push(url.href);
      if (url.hostname === 'en.wikipedia.org') return wikimedia();
      if (url.hostname === 'www.wikidata.org') return wikidata();
      const title = url.searchParams.get('page');
      if (title === 'Monkey_D._Luffy')
        return parsed(
          '<p>Luffy has an elastic rubber body.</p><a href="/wiki/Monkey_D._Luffy/Abilities_and_Powers">Abilities</a><a href="/wiki/Monkey_D._Luffy/Gallery">Gallery</a>',
        );
      if (title === 'Monkey_D._Luffy/Abilities_and_Powers')
        return parsed('<h2>Stretching</h2><p>Luffy extends his arms for long punches.</p>');
      return parsed('<p>Gallery descriptions are not character evidence.</p>');
    },
  });
  assert.equal(urls.length, 5);
  assert.equal(result.sourceDocuments.length, 2);
  assert.ok(result.sourceDocuments.some((doc) => doc.text.includes('long punches')));
  assert.ok(result.sourceDocuments.every((doc) => !doc.origin.location.endsWith('/Gallery')));
});

test('observed encoded abilities-and-gear links stay identity-bound and within the two-subpage cap', async () => {
  const targets: string[] = [];
  const result = await gatherCharacterVisuals(input, {
    fetch: async (request) => {
      const url = new URL(String(request));
      if (url.hostname === 'en.wikipedia.org') return wikimedia();
      if (url.hostname === 'www.wikidata.org') return wikidata();
      const title = url.searchParams.get('page')!;
      targets.push(title);
      if (title === 'Monkey_D._Luffy')
        return parsed(
          '<p>Luffy has an elastic rubber body.</p><a href="/wiki/Monkey_D._Luffy/Abilities_%26_gear">Abilities</a><a href="/wiki/Monkey_D._Luffy/Gallery">Gallery</a><a href="/wiki/Other_Character/Abilities_%26_gear">Other</a><a href="https://evil.test/wiki/Monkey_D._Luffy/Abilities_%26_gear">Offsite</a><a href="/wiki/Monkey_D._Luffy/Unobserved_power">Other page</a>',
        );
      if (title === 'Monkey_D._Luffy/Abilities_&_gear')
        return parsed(
          '<h2>Rubber body</h2><p>Luffy stretches his arms to punch distant targets.</p>',
        );
      assert.equal(title, 'Monkey_D._Luffy/Gallery');
      return parsed('');
    },
  });
  assert.deepEqual(targets, [
    'Monkey_D._Luffy',
    'Monkey_D._Luffy/Abilities_&_gear',
    'Monkey_D._Luffy/Gallery',
  ]);
  const source = result.sourceDocuments.find((doc) =>
    doc.origin.location.endsWith('/Abilities_%26_gear'),
  )!;
  assert.match(source.text, /punch distant targets/);
});

test('text-only technique enrichment stays bounded and retains existing sources on a missing page', async () => {
  const targets: string[] = [];
  const signals = new Set<AbortSignal>();
  const result = await gatherCharacterVisuals(input, {
    fetch: async (request, init) => {
      const url = new URL(String(request));
      if (url.hostname === 'en.wikipedia.org') return wikimedia();
      if (url.hostname === 'www.wikidata.org') return wikidata();
      assert.equal(url.hostname, 'onepiece.fandom.com');
      assert.equal(init?.redirect, 'error');
      signals.add(init!.signal!);
      const title = url.searchParams.get('page')!;
      targets.push(title);
      if (title === 'Monkey_D._Luffy')
        return parsed(
          `${picture('Luffy_Portrait.png', 'Luffy portrait')}<p>Luffy is the captain of a pirate crew.</p><a href="/wiki/Monkey_D._Luffy/Abilities_and_Powers">Abilities</a>`,
        );
      if (title === 'Monkey_D._Luffy/Abilities_and_Powers')
        return parsed(
          '<h2>Skills</h2><h3>Former</h3><ul><li><a href="/wiki/Water_Blade">Water Blade</a> was formerly used.</li><li><a href="/wiki/Black_Flame">Black Flame</a> was formerly used.</li><li><a href="/wiki/Other_Punch">Other Punch</a> is a third link.</li></ul>',
        );
      if (title === 'Water_Blade')
        return parsed(
          '<h2>Abilities</h2><p>The user launches a cutting water blade at enemies.</p><a href="/wiki/Another_Blade">Do not follow</a>',
        );
      assert.equal(title, 'Black_Flame');
      return new Response('missing', { status: 404 });
    },
  });
  assert.deepEqual(targets, [
    'Monkey_D._Luffy',
    'Monkey_D._Luffy/Abilities_and_Powers',
    'Water_Blade',
    'Black_Flame',
  ]);
  assert.equal(signals.size, 1);
  assert.ok(result.visualReferences.length > 0);
  assert.equal(result.sourceDocuments.length, 3);
  assert.match(result.sourceDocuments[0]!.text, /cutting water blade/);
  assert.match(result.sourceDocuments[0]!.text, /Former/);
  assert.match(result.visualNotes.join(' '), /linked technique descriptions were unavailable/);
});
