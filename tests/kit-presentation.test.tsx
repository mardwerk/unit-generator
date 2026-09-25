import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { authorUnit } from '../src/core/index.js';
import { compareGameplay } from '../src/lab/client/kit-comparison.js';
import { CharacterSheet, Comparison } from '../src/lab/client/kit.js';
import { Gallery } from '../src/lab/client/gallery.js';
import { imagePrompt, iconPrompt } from '../src/lab/client/icon-prompts.js';
import { Usage } from '../src/lab/client/workflow.js';
import { FakeModel, miraCandidate, miraRequest } from './fixtures/core-fixtures.js';
import { visualReferencesOf } from '../src/lab/client/visual-references.js';

test('gameplay comparison excludes evidence-only changes and resolves linked content', () => {
  const previous = miraCandidate();
  const current = structuredClone(previous);
  current.basicAttack.evidence = ['new-source'];
  current.paths[0]!.tiers[0]!.decisionRefs = ['new-decision'];
  assert.deepEqual(compareGameplay(previous, current), []);
  const tier = current.paths[0]!.tiers[0]!;
  tier.benefit = 'Slow enemies by 25 percent for 2 seconds.';
  tier.abilityIds = [current.abilities[0]!.id];
  current.abilities[0]!.name = 'Frost wave';
  current.abilities.push({ ...current.abilities[0]!, id: 'second-ability', name: 'Ice form' });
  current.abilities[0]!.prerequisiteAbilityIds = [current.abilities[1]!.id];
  const changes = compareGameplay(previous, current);
  const upgrade = changes.find((change) => change.section.endsWith('tier 1'))!;
  assert.ok(upgrade.fields.some((field) => field.after === tier.benefit));
  assert.ok(upgrade.fields.some((field) => field.after === 'Frost wave'));
  const html = renderToStaticMarkup(<Comparison previous={previous} current={current} />);
  assert.ok(html.includes('Previous'));
  assert.ok(html.includes('Current'));
  assert.ok(html.includes(tier.benefit));
  assert.doesNotMatch(html, /<details|decisionRefs|abilityIds|prerequisiteAbilityIds|new-source/);
});

test('added and removed abilities include their content and preserve stable-ID renames', () => {
  const previous = miraCandidate();
  const current = structuredClone(previous);
  const removed = current.abilities.shift()!;
  current.abilities.push({
    ...removed,
    id: 'new-ability',
    name: 'New wave',
    description: 'Push enemies back.',
  });
  current.basicAttack.name = 'Renamed attack';
  const changes = compareGameplay(previous, current);
  assert.ok(
    changes
      .find((change) => change.kind === 'removed' && change.name === removed.name)
      ?.fields.some((field) => field.before === removed.description),
  );
  assert.ok(
    changes
      .find((change) => change.kind === 'added' && change.name === 'New wave')
      ?.fields.some((field) => field.after === 'Push enemies back.'),
  );
  assert.equal(changes.find((change) => change.section === 'Basic attack')?.kind, 'changed');
});

test('image-only prompts are portable while Codex prompts retain automatic destinations', () => {
  for (const kind of ['ability', 'portrait'] as const) {
    const candidate = miraCandidate();
    const image = imagePrompt(candidate, 'Wave', 'Push enemies back.', kind);
    const codex = iconPrompt(
      candidate,
      'Wave',
      'Push enemies back.',
      '/tmp/unit-icons/automatic.png',
      kind,
    );
    assert.ok(codex.startsWith(image));
    assert.match(codex, /automatic\.png/);
    assert.doesNotMatch(image, /\/tmp\/|filename|parent folder|application code|destination/);
    assert.ok(image.includes('Push enemies back.'));
  }
});

test('gallery stays silent before retrieval and omits retrieval diagnostics from the empty state', async () => {
  assert.doesNotMatch(
    renderToStaticMarkup(<Gallery artifact={null} />),
    /References|No reference|appear here/,
  );
  const result = structuredClone(await authorUnit(miraRequest(), new FakeModel()));
  assert.doesNotMatch(
    renderToStaticMarkup(<Gallery artifact={result} />),
    /No reference images found/,
  );
  result.prepared.request.documents[0]!.visualNotes = [
    'No usable character images were retrieved from the available sources.',
    'Diagnostic details.',
  ];
  const html = renderToStaticMarkup(<Gallery artifact={result} />);
  assert.ok(html.includes('No reference images found.'));
  assert.doesNotMatch(html, /Diagnostic details/);
});

test('usage summary exposes totals without per-stage diagnostics', async () => {
  const result = await authorUnit(miraRequest(), new FakeModel());
  const html = renderToStaticMarkup(<Usage artifact={result} />);
  assert.ok(html.includes('Reported cost'));
  assert.ok(html.includes('Total tokens'));
  assert.doesNotMatch(html, /<details|Per-stage|Reasoning/);
});

test('Unit header uses the first safe gallery reference with the character name beside it', async () => {
  const artifact = structuredClone(await authorUnit(miraRequest(), new FakeModel()));
  const reference = {
    id: 'first',
    url: 'https://images.example/first.png',
    sourceUrl: 'https://example.com/source',
    caption: 'Character portrait',
    kind: 'appearance' as const,
    attribution: 'Source credit',
  };
  artifact.prepared.request.documents[0]!.visualReferences = [
    { ...reference, id: 'unsafe', url: 'javascript:alert(1)' },
    reference,
    { ...reference, id: 'second', url: 'https://images.example/second.png' },
  ];
  assert.equal(visualReferencesOf(artifact)[0]?.url, reference.url);
  const html = renderToStaticMarkup(<CharacterSheet artifact={artifact} busy={false} />);
  assert.ok(html.includes(`src="${reference.url}"`));
  assert.ok(html.includes(`<h2>${artifact.candidate.character.name}</h2>`));
  assert.doesNotMatch(html.split('</header>')[0]!, /javascript:|Create portrait/);
});

test('missing character images offer a text-free portrait prompt and keep the name outside the icon', async () => {
  const artifact = await authorUnit(miraRequest(), new FakeModel());
  const html = renderToStaticMarkup(
    <CharacterSheet
      artifact={artifact}
      busy={false}
      icons={{
        artifact: null,
        response: {
          directory: '/tmp/icons',
          icons: [{ key: 'unit-portrait', path: '/tmp/icons/portrait.png' }],
        },
        error: '',
        refresh: () => {},
      }}
    />,
  );
  assert.ok(html.includes('Create portrait for Mira'));
  assert.ok(html.includes('<h2>Mira</h2>'));
  const prompt = imagePrompt(
    artifact.candidate,
    'Mira',
    'A young fire mage in a red coat.',
    'portrait',
  );
  assert.match(prompt, /character portrait of Mira/);
  assert.match(prompt, /No text, lettering/);
  assert.ok(prompt.includes('A young fire mage in a red coat.'));
  assert.doesNotMatch(prompt, /reading exactly|1024 by 512|Create .*wordmark/);
});
