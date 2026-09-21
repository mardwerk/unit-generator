import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { prepareRequest, draftUnit, type VisualReference } from '../src/core/index.js';
import { rankedPortraits, isFullBodyReference } from '../src/presentation/portraits.js';
import { LabLibrary } from '../src/lab/library.js';
import { UnitPortrait } from '../src/lab/client/unit-portrait.js';
import { Library, type GenerationLibrary } from '../src/lab/client/library.js';
import { FakeModel, miraRequest, miraCandidate } from './fixtures/core-fixtures.js';

function reference(
  id: string,
  caption: string,
  kind: VisualReference['kind'] = 'appearance',
): VisualReference {
  return {
    id,
    caption,
    kind,
    url: `https://example.test/${id}.png`,
    sourceUrl: `https://example.test/source/${id}`,
    attribution: 'Fixture source',
  };
}
const fullBody = reference('Mira_Fullbody', 'Anime standing reference');
const portrait = reference('Mira_Anime_Infobox', 'Anime before the journey');
const chosen = reference('Mira_seated', 'Seated character');

test('portrait ranking uses generic source metadata and keeps full-body references separate', () => {
  const images = [fullBody, reference('attack', 'Mira attacks', 'pose'), portrait];
  assert.equal(rankedPortraits(images)[0]?.id, portrait.id);
  assert.equal(isFullBodyReference(fullBody), true);
  assert.equal(rankedPortraits([fullBody])[0]?.id, fullBody.id);
  assert.equal(images[0], fullBody);
  const html = renderToStaticMarkup(
    <UnitPortrait candidate={miraCandidate()} references={images} />,
  );
  assert.equal(load(html)('img').attr('src'), portrait.url);
});

test('portrait choice survives reopening, is scope-specific, and never changes saved artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unitlab-portraits-'));
  const options = {
    settingsFile: join(root, 'settings.json'),
    defaultDirectory: join(root, 'library'),
  };
  try {
    const library = await LabLibrary.open(options);
    const request = miraRequest();
    request.documents[0]!.visualReferences = [fullBody, portrait, chosen];
    const prepared = await prepareRequest(request);
    const saved = await library.save(prepared);
    assert.equal((await library.state()).entries[0]?.portrait?.url, portrait.url);
    assert.equal(
      (await readdir(options.defaultDirectory)).length,
      1,
      'Listing must not create assets',
    );
    await library.setPortrait(prepared, chosen.id);
    const reopened = await LabLibrary.open(options);
    assert.equal((await reopened.portrait(prepared)).portrait?.id, chosen.id);
    assert.equal((await reopened.state()).entries[0]?.portrait?.url, chosen.url);
    assert.deepEqual((await reopened.load(saved.id)).artifact, prepared);
    await assert.rejects(reopened.setPortrait(prepared, '../unowned'), /source images/);
    const other = structuredClone(request);
    other.character.scope = 'Different source scope';
    assert.equal((await reopened.portrait(await prepareRequest(other))).portrait?.id, portrait.id);
    const draft = await draftUnit(prepared, new FakeModel());
    const icons = await reopened.icons(draft);
    assert.equal(icons.portrait?.id, chosen.id);
    assert.equal(
      load(
        renderToStaticMarkup(
          <UnitPortrait
            candidate={draft.candidate}
            references={[portrait]}
            icons={{ artifact: draft, response: icons, error: '', refresh: () => {} }}
          />,
        ),
      )('img').attr('src'),
      chosen.url,
    );
    await rm(join(icons.directory, 'portrait.json'));
    const external = join(root, 'external.json');
    await writeFile(external, JSON.stringify(chosen));
    await symlink(external, join(icons.directory, 'portrait.json'));
    assert.equal(
      (await reopened.portrait(draft)).portrait?.id,
      portrait.id,
      'Symlink preferences are not followed',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('library sends only a bounded generated portrait thumbnail when sources lack portraits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unitlab-thumbnail-'));
  try {
    const library = await LabLibrary.open({
      settingsFile: join(root, 'settings.json'),
      defaultDirectory: join(root, 'library'),
    });
    const draft = await draftUnit(await prepareRequest(miraRequest()), new FakeModel());
    await library.save(draft);
    const icons = await library.icons(draft);
    const png = await sharp({
      create: { width: 300, height: 400, channels: 4, background: '#336699' },
    })
      .png()
      .toBuffer();
    await writeFile(icons.icons.find((icon) => icon.key === 'unit-portrait')!.path, png);
    await writeFile(icons.icons.find((icon) => icon.key === 'basic-attack')!.path, png);
    const entry = (await library.state()).entries[0]!;
    assert.ok(entry.portrait);
    assert.ok(entry.portrait.url.startsWith('data:image/png;base64,'));
    assert.ok(entry.portrait.url.length < 66_000);
    const metadata = await sharp(
      Buffer.from(entry.portrait.url.split(',')[1]!, 'base64'),
    ).metadata();
    assert.equal(metadata.width, 96);
    assert.equal(metadata.height, 96);
    assert.equal('icons' in entry, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('library groups works and renders character portraits instead of document symbols', () => {
  const entries = ['Zeta', 'Alpha', 'Zeta'].map((work, index) => ({
    id: String(index),
    savedAt: '2026-09-20T10:00:00Z',
    kind: 'prepared' as const,
    artifactId: String(index),
    character: { name: `Hero ${index}`, work, scope: '' },
    portrait: { url: portrait.url, caption: portrait.caption },
  }));
  const library: GenerationLibrary = {
    directory: '/library',
    entries,
    error: '',
    pending: false,
    refresh: async () => {},
    save: async () => {},
    configure: async () => {},
    remove: async () => true,
  };
  const $ = load(
    renderToStaticMarkup(<Library library={library} busy={false} onOpen={() => {}} />),
  );
  assert.deepEqual(
    $('.library-work-heading')
      .map((_, node) => $(node).text())
      .get(),
    ['Alpha', 'Zeta'],
  );
  assert.equal($('.library-work-group').last().find('.library-card').length, 2);
  assert.equal($('img.library-portrait').length, 3);
});

test('tall source dimensions are a portrait framing hint, not proof of full-body coverage', () => {
  const tall = { ...reference('Tall_Anime_Infobox', 'Anime S3'), width: 300, height: 900 };
  const seated = {
    ...reference('Seated_Anime_Infobox', 'Anime before the journey'),
    width: 500,
    height: 550,
  };
  assert.equal(rankedPortraits([tall, seated])[0]?.id, seated.id);
  assert.equal(isFullBodyReference(tall), false);
});
