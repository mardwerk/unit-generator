import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { load } from 'cheerio';
import { prepareRequest, type DraftArtifact, type CheckedArtifact } from '../src/core/index.js';
import {
  conceptRequest,
  conceptCandidate,
  alternateConceptRequest,
} from './fixtures/concept-fixtures.js';
import { FakeModel } from './fixtures/core-fixtures.js';
import { startLab } from '../src/lab/server.js';
import { LabLibrary } from '../src/lab/library.js';
import { editRequest, readEditor, selectDeliverable } from '../src/lab/client/editor-state.js';
import { CharacterSheet } from '../src/lab/client/kit.js';
import { compareGameplay } from '../src/lab/client/kit-comparison.js';
import { emptyRequest } from '../src/lab/client/artifacts.js';

const execute = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));

test('CLI retains external concept rules, every attempt and revisions of checked artifacts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'concept-cli-'));
  try {
    const request = alternateConceptRequest();
    const candidate = conceptCandidate(request);
    const input = {
      ...request,
      documents: request.documents.map(({ origin: _origin, ...doc }) => doc),
    };
    await writeFile(join(directory, 'request.json'), JSON.stringify(input));
    await mkdir(join(directory, 'codex-home'));
    await writeFile(join(directory, 'codex-home/config.toml'), '');
    const fake = join(directory, 'fake.mjs');
    await writeFile(
      fake,
      `#!${process.execPath}\nimport fs from 'node:fs';
const args=process.argv.slice(2); let prompt=''; for await (const chunk of process.stdin) prompt+=chunk;
const schema=JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema')+1],'utf8'));
fs.writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify(schema.properties.summary ? {summary:'Model-double review only.',findings:[]} : ${JSON.stringify(candidate)}));\n`,
    );
    await chmod(fake, 0o700);
    const run = (args: string[]) =>
      execute(process.execPath, [cli, ...args], {
        cwd: directory,
        env: { ...process.env, CODEX_HOME: join(directory, 'codex-home') },
        timeout: 30000,
        maxBuffer: 4_000_000,
      });
    await run(['prepare', 'request.json', '--deliverable', 'concept', '-o', 'prepared.json']);
    const prepared = JSON.parse(await readFile(join(directory, 'prepared.json'), 'utf8'));
    assert.deepEqual(prepared.request.conceptRules, request.conceptRules);
    assert.deepEqual(prepared.request.progression, request.progression);
    await run(['draft', 'prepared.json', '--codex', fake, '-o', 'draft.json']);
    await run(['check', 'draft.json', '-o', 'checked.json']);
    await run(['render', 'checked.json', '-o', 'unit.md']);
    const markdown = await readFile(join(directory, 'unit.md'), 'utf8');
    assert.match(markdown, /Shared|remaining/);
    assert.match(markdown, /Crosspath|with/);
    assert.doesNotMatch(markdown, /Purchase cost|review certificate|Reported cost/);
    await run([
      'author',
      'request.json',
      '--previous',
      'checked.json',
      '--feedback',
      'Preserve every behavior.',
      '--operation',
      'prose-edit',
      '--codex',
      fake,
      '-o',
      'revised.json',
    ]);
    const revised = JSON.parse(await readFile(join(directory, 'revised.json'), 'utf8'));
    assert.deepEqual(revised.candidate, candidate);
    assert.equal(revised.prepared.request.operation, 'prose-edit');
    assert.match(revised.prepared.request.previous.resultId, /^artifact:/);
    const runs = await readdir(join(directory, 'data/runs/evidence'));
    assert.equal(runs.length, 2);
    for (const name of runs) {
      const files = await readdir(join(directory, 'data/runs/evidence', name));
      assert.ok(files.includes('input.json'));
      assert.ok(files.includes('manifest.json'));
      assert.ok(files.includes('observations.json'));
      assert.ok(files.includes('artifact.json'));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('UnitLab saves and reloads both concept rulesets and retains failed model output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'concept-lab-'));
  const library = await LabLibrary.open({
    settingsFile: join(directory, 'settings.json'),
    defaultDirectory: join(directory, 'library'),
  });
  const first = conceptRequest(),
    second = alternateConceptRequest();
  const model = new FakeModel([
    conceptCandidate(first),
    conceptCandidate(second),
    { invalid: 'original rejected output' },
  ]);
  const lab = await startLab({ model, library, example: first, port: 0 });
  const post = async (operation: string, input: unknown) => {
    const response = await fetch(`${lab.origin}/api/${operation}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lab.token}`,
        Origin: lab.origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    return { status: response.status, body: (await response.json()) as any };
  };
  try {
    for (const request of [first, second]) {
      const prepared = await post('prepare', { request });
      assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
      const drafted = await post('draft', { prepared: prepared.body });
      assert.equal(drafted.status, 200, JSON.stringify(drafted.body));
      const checked = await post('check', { draft: drafted.body });
      const saved = await post('library/save', { artifact: checked.body });
      const loaded = await post('library/load', { id: saved.body.id });
      assert.deepEqual(loaded.body.artifact, checked.body);
      const rendered = await post('render', { artifact: loaded.body.artifact });
      assert.equal(rendered.status, 200);
      assert.match(rendered.body.markdown, /remaining travel/);
      assert.equal(
        loaded.body.artifact.draft.candidate.paths.length,
        request.progression!.paths.length,
      );
    }
    const failed = await post('draft', { prepared: await prepareRequest(second) });
    assert.notEqual(failed.status, 200);
    const evidenceRoot = join(directory, 'library/evidence');
    const evidence = await readdir(evidenceRoot);
    assert.equal(evidence.length, 3);
    const contents = await Promise.all(
      evidence.map(async (name) => {
        const files = await readdir(join(evidenceRoot, name));
        return (
          await Promise.all(files.map((file) => readFile(join(evidenceRoot, name, file), 'utf8')))
        ).join('\n');
      }),
    );
    assert.ok(contents.some((text) => text.includes('original rejected output')));
  } finally {
    await lab.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('concept editor and sheet preserve complete prose, external policy and revision differences', async () => {
  const preset = selectDeliverable(editRequest(emptyRequest()), 'concept');
  const selected = readEditor(preset);
  assert.equal(selected.deliverable, 'concept');
  assert.ok(selected.conceptRules);
  assert.equal(selected.mechanicsDefinition, undefined);
  const request = alternateConceptRequest();
  assert.deepEqual(readEditor(editRequest(request)), request);
  const cleared = editRequest(request);
  cleared.conceptRules = '';
  assert.throws(() => readEditor(cleared), /Concept rules must contain/);
  const revisionEditor = editRequest({
    ...request,
    operation: 'prose-edit',
    previous: {
      resultId: 'prior',
      draft: conceptCandidate(request),
      findings: [],
    },
    feedback: 'Edit wording only.',
  });
  const numerical = readEditor(selectDeliverable(revisionEditor, 'mechanics'));
  assert.equal(numerical.previous, null);
  assert.equal(numerical.feedback, null);
  assert.equal(numerical.operation, 'generate');
  await prepareRequest(numerical);
  const candidate = conceptCandidate(request);
  const artifact: DraftArtifact = {
    schemaVersion: '1',
    kind: 'draft',
    prepared: await prepareRequest(request),
    candidate,
    run: {
      id: 'interface-fixture',
      modelId: 'double',
      startedAt: '2026-09-22T00:00:00Z',
      completedAt: '2026-09-22T00:00:00Z',
    },
  };
  const $ = load(renderToStaticMarkup(<CharacterSheet artifact={artifact} busy={false} />));
  assert.ok($('.basic-attack').text().includes(candidate.basicAttack.limitations));
  for (const crosspath of candidate.crosspaths!)
    assert.ok($('[aria-label="Crosspaths"]').text().includes(crosspath.interaction));
  assert.ok($('.path-heading').text().includes(candidate.paths[0]!.limitation!));
  assert.equal($('.general-information').length, 0);
  const changed = structuredClone(candidate);
  changed.crosspaths![0]!.interaction = 'Redirection now replenishes pierce.';
  changed.abilities[0]!.activation = 'automatic';
  const differences = compareGameplay(candidate, changed);
  assert.ok(
    differences.some(
      (change) =>
        change.section === 'Crosspath' &&
        change.fields.some((field) => field.name === 'Interaction'),
    ),
  );
  assert.ok(
    differences.some((change) => change.fields.some((field) => field.name === 'Activation')),
  );
});
