import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  authorUnit,
  defaultMechanicsDefinition,
  definitionProgression,
  prepareRequest,
} from '../src/core/index.js';
import { load } from 'cheerio';
import { RequestEditor } from '../src/lab/client/editor.js';
import { FakeModel, miraRequest } from './fixtures/core-fixtures.js';
import { CharacterSheet } from '../src/lab/client/kit.js';
import { Gallery } from '../src/lab/client/gallery.js';
import { editRequest, readEditor } from '../src/lab/client/editor-state.js';
import { olderRevisions } from '../src/lab/client/library.js';
import type { LibraryEntry } from '../src/lab/contracts.js';

test('React character sheet retains the complete kit and keeps evidence and checks closed', async () => {
  const result = await authorUnit(miraRequest(), new FakeModel());
  const html = renderToStaticMarkup(
    <CharacterSheet artifact={result} busy={false} onImprove={() => {}} onContinue={() => {}} />,
  );
  for (const path of result.candidate.paths) {
    assert.ok(html.includes(path.name));
    for (const tier of path.tiers) assert.ok(html.includes(tier.name));
  }
  assert.ok(html.includes(result.candidate.basicAttack.name));
  assert.ok(html.includes('Checks and review'));
  assert.ok(html.includes('Sources and evidence'));
  assert.doesNotMatch(html, /<details[^>]*\bopen/);
  assert.ok(!html.includes('Reported cost'));
  const $ = load(html);
  assert.equal($('.general-information').length, 0);
  assert.equal($('.unit-overview > .basic-attack:only-child').length, 1);
});

test('React gallery rejects script URLs and preserves attribution without treating source text as HTML', async () => {
  const result = structuredClone(await authorUnit(miraRequest(), new FakeModel()));
  result.prepared.request.documents[0]!.visualReferences = [
    {
      id: 'good',
      url: 'https://upload.wikimedia.org/portrait.png',
      sourceUrl: 'https://en.wikipedia.org/wiki/File:Portrait.png',
      caption: '<script>unsafe</script>',
      kind: 'appearance',
      attribution: 'Portrait credit',
    },
    {
      id: 'bad',
      url: 'javascript:alert(1)',
      sourceUrl: 'https://example.com',
      caption: 'Bad image',
      kind: 'reference',
      attribution: null,
    },
  ];
  const html = renderToStaticMarkup(<Gallery artifact={result} />);
  assert.ok(html.includes('Portrait credit'));
  assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
  assert.doesNotMatch(html, /javascript:|<script>|Bad image/);
});

test('React input editing preserves source evidence and marks changed source text as supplied', () => {
  const request = miraRequest();
  const editor = editRequest(request);
  assert.deepEqual(readEditor(editor), request);
  editor.documents[0]!.original!.origin.access = 'retrieved';
  editor.documents[0]!.text = 'An explicit correction.';
  const changed = readEditor(editor).documents[0]!;
  assert.ok('origin' in changed);
  assert.equal(changed.origin.access, 'supplied');
  assert.match(changed.origin.note!, /Edited in mardwerk-unit/);
  editor.constraints = '[invalid';
  assert.throws(() => readEditor(editor), /valid JSON/);
});

test('library cleanup never replaces a completed Unit with a newer preparation or another source scope', () => {
  const entry = (id: string, day: number, kind: LibraryEntry['kind'], scope = 'Original') => ({
    id,
    savedAt: `2026-09-${day}T12:00:00.000Z`,
    kind,
    character: { name: 'Mira', work: 'Fixture', scope },
    artifactId: id,
  });
  const entries: LibraryEntry[] = [
    entry('old-result', 12, 'result'),
    entry('result', 13, 'result'),
    entry('old-prepared', 14, 'prepared'),
    entry('prepared', 15, 'prepared'),
    entry('other-scope', 11, 'result', 'Later'),
  ];
  assert.deepEqual(
    olderRevisions(entries)
      .map((entry) => entry.id)
      .sort(),
    ['old-prepared', 'old-result'],
  );
  assert.equal(entries.length, 5);
});

test('upgrade details open separately from the sheet, including shared abilities', async () => {
  const result = structuredClone(await authorUnit(miraRequest(), new FakeModel()));
  const ability = result.candidate.abilities[0]!;
  ability.description = 'Shared ability description marker.';
  result.candidate.paths[0]!.tiers[0]!.abilityIds = [ability.id];
  result.candidate.paths[0]!.tiers[1]!.abilityIds = [ability.id];
  const $ = load(renderToStaticMarkup(<CharacterSheet artifact={result} busy={false} />));
  const tiers = $('.tier-card');
  assert.equal(
    tiers.length,
    result.candidate.paths.reduce((count, path) => count + path.tiers.length, 0),
  );
  assert.equal(tiers.find('details, dialog').length, 0);
  assert.equal(
    tiers.find('button[aria-haspopup="dialog"]').length,
    result.candidate.paths.flatMap((path) => path.tiers).length,
  );
  assert.equal(tiers.find('button.card-open').length, tiers.length);
  assert.ok(tiers.find('button.card-open').first().attr('aria-label')?.includes('Open details'));
  assert.equal(tiers.find('button button').length, 0);
  assert.ok(!$('.character-sheet').text().includes(ability.description));
});

test('upgrade layout assigns shared rows by tier number across arbitrary uneven paths', async () => {
  const result = structuredClone(await authorUnit(miraRequest(), new FakeModel()));
  const template = result.candidate.paths[0]!;
  result.candidate.paths = Array.from({ length: 4 }, (_, index) => ({
    ...structuredClone(template),
    id: `path-${index}`,
    name: `Path ${index}`,
    theme: index === 0 ? 'Long theme. '.repeat(30) : 'Short.',
    tiers: [1, ...(index === 1 ? [] : [3]), 7].map((tier) => ({
      ...structuredClone(template.tiers[0]!),
      tier,
    })),
  }));
  const $ = load(renderToStaticMarkup(<CharacterSheet artifact={result} busy={false} />));
  assert.match($('.upgrade-paths').attr('style')!, /--path-count:4;--path-rows:4/);
  $('.path-section').each((_, path) => {
    assert.equal($(path).children('.path-heading').length, 1);
    $(path)
      .find('.tier-card')
      .each((_, card) => {
        const tier = Number($(card).find('.tier-number').text());
        assert.equal($(card).attr('style'), `--tier-row:${[1, 3, 7].indexOf(tier) + 2}`);
      });
  });
});

test('flow exposes eligible single-stage actions, stop and continuation', async () => {
  const { Workflow } = await import('../src/lab/client/workflow.js');
  const result = await authorUnit(miraRequest(), new FakeModel());
  const prepared = result.prepared;
  const render = (running: 'draft' | null, dirty = false) =>
    renderToStaticMarkup(
      <Workflow
        artifact={prepared}
        running={running}
        busy={Boolean(running)}
        dirty={dirty}
        onStage={() => {}}
        onRun={() => {}}
        onStop={() => {}}
      />,
    );
  const ready = render(null);
  assert.match(ready, /aria-label="Rerun Prepare only"/);
  assert.match(ready, /aria-label="Run Draft only"/);
  assert.match(ready, /aria-label="Run Check only"[^>]*disabled/);
  assert.match(ready, /Continue/);
  assert.doesNotMatch(ready, /Run remaining|Run next/);
  const active = render('draft');
  assert.match(active, /> Stop<\/button>/);
  assert.doesNotMatch(active, /id="continue-run"/);
  assert.match(render(null, true), /aria-label="Run Draft only"[^>]*disabled/);
});

test('Definition-backed editor protects generated evidence and progression while legacy inputs stay editable', async () => {
  const request = miraRequest();
  request.mechanicsDefinition = structuredClone(defaultMechanicsDefinition);
  request.progression = definitionProgression(defaultMechanicsDefinition);
  const prepared = await prepareRequest(request);
  const render = (input: ReturnType<typeof editRequest>) =>
    load(
      renderToStaticMarkup(
        <RequestEditor
          value={input}
          onChange={() => {}}
          disabled={false}
          onUpload={async () => {}}
        />,
      ),
    );
  const editor = editRequest(prepared.request);
  const $ = render(editor);
  const generated = $('details.document-editor').filter((_, element) =>
    $(element).find('summary').text().includes(`mechanics:${defaultMechanicsDefinition.id}`),
  );
  assert.equal(generated.length, 1);
  assert.equal(generated.find('textarea[readonly]').length, 1);
  assert.equal(generated.find('button, select, input').length, 0);
  const progression = $('label')
    .filter(
      (_, element) =>
        $(element).children('span').text() === 'Progression (from mechanics Definition)',
    )
    .find('textarea');
  assert.equal(progression.is('[readonly]'), true);
  assert.match($.text(), /import a request with an edited Definition and matching progression/);
  assert.equal($('details.document-editor').first().find('textarea[readonly]').length, 0);
  assert.deepEqual(readEditor(editor), prepared.request);

  const legacy = editRequest(miraRequest());
  const normal = render(legacy);
  assert.equal(normal('textarea[readonly]').length, 0);
  const custom = { ...miraRequest().progression!, maxActivePaths: 1 };
  legacy.progression = JSON.stringify(custom);
  assert.deepEqual(readEditor(legacy).progression, custom);
});
