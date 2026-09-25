import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  bundledProfiles,
  checkDraft,
  defaultUnitProfile,
  draftUnit,
  prepareRequest,
  reviewDraft,
} from '../src/core/index.js';
import type { LibraryEntry, LibraryIconsResponse, LibraryState } from '../src/lab/contracts.js';
import { LabLibrary } from '../src/lab/library.js';
import { startLab } from '../src/lab/server.js';
import { FakeModel, miraCandidate, miraRequest } from './fixtures/core-fixtures.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'unitlab-library-'));
  const options = {
    settingsFile: join(root, 'settings.json'),
    defaultDirectory: join(root, 'library'),
  };
  const library = await LabLibrary.open(options);
  return { root, options, library, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('library saves every stage unchanged, deduplicates and restores across server lifetimes', async () => {
  const { library, options, cleanup } = await fixture();
  try {
    assert.deepEqual(await library.state(), { directory: options.defaultDirectory, entries: [] });
    const model = new FakeModel();
    const prepared = await prepareRequest(miraRequest());
    const draft = await draftUnit(prepared, model);
    const checked = await checkDraft(draft);
    const result = await reviewDraft(checked, model);
    for (const artifact of [prepared, draft, checked, result]) {
      const before = structuredClone(artifact);
      const [first, second] = await Promise.all([library.save(artifact), library.save(artifact)]);
      assert.deepEqual(first, second);
      assert.deepEqual(first.character, miraRequest().character);
      assert.equal(first.kind, artifact.kind);
      assert.deepEqual((await library.load(first.id)).artifact, before);
      assert.deepEqual(artifact, before);
    }
    const reopened = await LabLibrary.open(options);
    assert.deepEqual(await reopened.state(), await library.state());
    assert.equal((await library.state()).entries.length, 4);
    assert.equal((await readdir(options.defaultDirectory)).length, 4);
    await assert.rejects(library.save({ ...prepared, apiKey: 'must-not-save' }));
    const tampered = structuredClone(prepared);
    tampered.request.task = 'Changed without preparation.';
    await assert.rejects(library.save(tampered), /hash/);
    await assert.rejects(library.save(miraRequest()), /completed stage/);
  } finally {
    await cleanup();
  }
});

test('changing the folder persists the setting and leaves the old library intact', async () => {
  const { root, library, options, cleanup } = await fixture();
  try {
    const prepared = await prepareRequest(miraRequest());
    const saved = await library.save(prepared);
    const alternate = join(root, 'chosen', 'units');
    assert.deepEqual(await library.configure(alternate), { directory: alternate, entries: [] });
    assert.deepEqual(await (await LabLibrary.open(options)).state(), {
      directory: alternate,
      entries: [],
    });
    assert.ok(await readFile(join(options.defaultDirectory, `unitlab-${saved.id}.json`)));
    await library.save(prepared);
    assert.equal((await library.configure(options.defaultDirectory)).entries.length, 1);
    const settings = JSON.parse(await readFile(options.settingsFile, 'utf8'));
    assert.deepEqual(Object.keys(settings).sort(), ['directory', 'unitLabSettings']);
    await assert.rejects(library.configure('  '));
    assert.equal((await library.state()).directory, options.defaultDirectory);
  } finally {
    await cleanup();
  }
});

test('deletion accepts only intact managed documents and preserves other files and folders', async () => {
  const { root, library, options, cleanup } = await fixture();
  try {
    const saved = await library.save(await prepareRequest(miraRequest()));
    const ordinary = join(options.defaultDirectory, 'notes.json');
    await writeFile(ordinary, '{"important":"keep"}');
    const unknownId = '0'.repeat(64);
    const unknown = join(options.defaultDirectory, `unitlab-${unknownId}.json`);
    await writeFile(unknown, '{"unrelated":true}');
    const linkedId = '1'.repeat(64);
    const external = join(root, 'external.json');
    await writeFile(external, 'external content');
    const linked = join(options.defaultDirectory, `unitlab-${linkedId}.json`);
    await symlink(external, linked);
    assert.deepEqual(
      (await library.state()).entries.map((entry) => entry.id),
      [saved.id],
    );
    await assert.rejects(library.delete([saved.id, unknownId]));
    assert.equal((await library.load(saved.id)).artifact.kind, 'prepared');
    await assert.rejects(library.load('../external'));
    await assert.rejects(library.delete([linkedId]));
    await assert.rejects(library.delete(['../../notes.json']));
    assert.deepEqual((await library.delete([saved.id, saved.id])).entries, []);
    assert.equal(await readFile(ordinary, 'utf8'), '{"important":"keep"}');
    assert.equal(await readFile(unknown, 'utf8'), '{"unrelated":true}');
    assert.equal(await readFile(external, 'utf8'), 'external content');
    assert.equal((await readdir(options.defaultDirectory)).length, 3);
  } finally {
    await cleanup();
  }
});

test('tampered managed documents are neither loaded, overwritten nor deleted', async () => {
  const { library, options, cleanup } = await fixture();
  try {
    const prepared = await prepareRequest(miraRequest());
    const entry = await library.save(prepared);
    const filename = join(options.defaultDirectory, `unitlab-${entry.id}.json`);
    const document = JSON.parse(await readFile(filename, 'utf8'));
    document.id = '2'.repeat(64);
    const tampered = JSON.stringify(document);
    await writeFile(filename, tampered);
    assert.deepEqual((await library.state()).entries, []);
    await assert.rejects(library.load(entry.id), /identifier/);
    await assert.rejects(library.save(prepared), /identifier/);
    await assert.rejects(library.delete([entry.id]), /identifier/);
    assert.equal(await readFile(filename, 'utf8'), tampered);
  } finally {
    await cleanup();
  }
});

test('library HTTP endpoints require the session and local mutation origin', async () => {
  const { root, library, cleanup } = await fixture();
  const lab = await startLab({ library, model: new FakeModel(), example: miraRequest(), port: 0 });
  const headers = {
    Authorization: `Bearer ${lab.token}`,
    Origin: lab.origin,
    'Content-Type': 'application/json',
  };
  const post = (operation: string, body: unknown, override = {}) =>
    fetch(`${lab.origin}/api/library/${operation}`, {
      method: 'POST',
      headers: { ...headers, ...override },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await fetch(`${lab.origin}/api/library`)).status, 401);
    assert.equal(
      (await post('configure', { directory: join(root, 'new') }, { Origin: '' })).status,
      403,
    );
    const prepared = await prepareRequest(miraRequest());
    const saved = await post('save', { artifact: prepared });
    assert.equal(saved.status, 200);
    const entry = (await saved.json()) as LibraryEntry;
    const listing = await fetch(`${lab.origin}/api/library`, { headers });
    assert.deepEqual(((await listing.json()) as LibraryState).entries, [entry]);
    const loaded = await post('load', { id: entry.id });
    assert.deepEqual(await loaded.json(), { artifact: prepared });
    const removed = await post('delete', { ids: [entry.id] });
    assert.deepEqual(((await removed.json()) as LibraryState).entries, []);
    const configured = await post('configure', { directory: join(root, 'new') });
    assert.equal(((await configured.json()) as LibraryState).directory, join(root, 'new'));
    assert.equal((await post('save', { artifact: prepared, apiKey: 'reject-extra' })).status, 400);
    const draft = await draftUnit(prepared, new FakeModel());
    assert.equal((await post('icons', { artifact: draft }, { Authorization: '' })).status, 401);
    assert.equal((await post('icons', { artifact: draft }, { Origin: '' })).status, 403);
    const icons = await post('icons', { artifact: draft });
    assert.equal(icons.status, 200);
    assert.equal(((await icons.json()) as LibraryIconsResponse).icons.length, 17);
  } finally {
    await lab.close();
    await cleanup();
  }
});

test('icon paths are automatic, contained and stable across stages and revisions', async () => {
  const { library, options, cleanup } = await fixture();
  try {
    const prepared = await prepareRequest(miraRequest());
    assert.deepEqual(await library.icons(prepared), {
      directory: options.defaultDirectory,
      icons: [],
    });
    const candidate = miraCandidate();
    candidate.abilities.push({
      ...candidate.abilities[0]!,
      id: '../../form:active',
      pathId: null,
      tier: null,
    });
    const model = new FakeModel([candidate]);
    const draft = await draftUnit(prepared, model);
    const first = await library.icons(draft);
    assert.equal(first.icons.length, 18);
    assert.equal(first.icons[0]?.key, 'unit-portrait');
    assert.ok(first.icons.some((icon) => icon.key === 'tier:perception:2'));
    assert.ok(first.icons.some((icon) => icon.key === 'ability:../../form:active'));
    assert.ok(!first.icons.some((icon) => icon.key === 'ability:wall-perception'));
    for (const icon of first.icons) {
      assert.equal(dirname(icon.path), first.directory);
      assert.match(icon.path, /icon-[a-f0-9]{64}\.png$/);
      assert.equal(icon.dataUrl, undefined);
      assert.equal(icon.note, undefined);
    }
    assert.deepEqual(await library.icons(await checkDraft(draft)), first);
    const revision = structuredClone(draft);
    revision.run.id = 'later-run';
    revision.candidate.role = 'Revised role.';
    assert.deepEqual(await library.icons(revision), first);
    assert.deepEqual(await (await LabLibrary.open(options)).icons(revision), first);
    assert.equal((await library.state()).entries.length, 0);
  } finally {
    await cleanup();
  }
});

test('icon previews read existing PNGs with individual errors and bounded output', async () => {
  const { root, library, cleanup } = await fixture();
  try {
    const draft = await draftUnit(await prepareRequest(miraRequest()), new FakeModel());
    const first = await library.icons(draft);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7VQAAAAASUVORK5CYII=',
      'base64',
    );
    await writeFile(first.icons[0]!.path, png);
    await writeFile(first.icons[1]!.path, 'not an image');
    const external = join(root, 'private.png');
    await writeFile(external, png);
    await symlink(external, first.icons[2]!.path);
    await writeFile(first.icons[3]!.path, Buffer.alloc(8 * 1024 * 1024 + 1));
    const loaded = await library.icons(draft);
    assert.equal(loaded.icons[0]!.dataUrl, `data:image/png;base64,${png.toString('base64')}`);
    assert.match(loaded.icons[1]!.note!, /PNG/);
    assert.equal(loaded.icons[1]!.dataUrl, undefined);
    assert.match(loaded.icons[2]!.note!, /regular local PNG/);
    assert.equal(loaded.icons[2]!.dataUrl, undefined);
    assert.match(loaded.icons[3]!.note!, /8 MB/);
    assert.equal(loaded.icons[3]!.dataUrl, undefined);
    const large = Buffer.alloc(2 * 1024 * 1024);
    png.copy(large);
    for (const icon of first.icons.slice(4)) await writeFile(icon.path, large);
    const bounded = await library.icons(draft);
    assert.ok(bounded.icons.some((icon) => icon.note?.includes('combined 16 MB')));
    assert.ok(
      bounded.icons.reduce((total, icon) => total + (icon.dataUrl?.length ?? 0), 0) <=
        16 * 1024 * 1024,
    );
    const entry = await library.save(draft);
    await library.delete([entry.id]);
    assert.deepEqual(await readFile(first.icons[0]!.path), png);
    assert.deepEqual(await readFile(external), png);
  } finally {
    await cleanup();
  }
});

test('icon provisioning rejects symlinked asset folders', async () => {
  const { root, library, options, cleanup } = await fixture();
  try {
    const external = join(root, 'outside');
    await mkdir(external);
    await mkdir(options.defaultDirectory);
    await symlink(external, join(options.defaultDirectory, 'assets'));
    const draft = await draftUnit(await prepareRequest(miraRequest()), new FakeModel());
    await assert.rejects(library.icons(draft), /real directories/);
    assert.deepEqual(await readdir(external), []);
  } finally {
    await cleanup();
  }
});

test('saved Profiles live beneath the library, are validated, and never replace bundled ones', async () => {
  const { library, options, cleanup } = await fixture();
  try {
    const initial = await library.profiles();
    assert.deepEqual(
      initial.profiles.map(({ profile, builtIn }) => [profile.id, builtIn]),
      bundledProfiles.map((profile) => [profile.id, true]),
    );
    const copy = {
      ...structuredClone(defaultUnitProfile),
      id: 'quick-copy',
      name: 'Quick copy',
      rules: { ...structuredClone(defaultUnitProfile.rules), id: 'profile:quick-copy' },
    };
    const saved = await library.saveProfile(copy);
    assert.deepEqual(saved.profiles.at(-1), { profile: copy, builtIn: false });
    const file = join(options.defaultDirectory, 'profiles', 'quick-copy.json');
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), copy);
    const renamed = { ...copy, name: 'Quick copy, edited' };
    assert.equal((await library.saveProfile(renamed)).profiles.at(-1)?.profile.name, renamed.name);

    await assert.rejects(library.saveProfile(structuredClone(defaultUnitProfile)), /read-only/);
    await assert.rejects(
      library.saveProfile({ ...copy, id: 'other-id' }),
      /rules document must have the ID profile:other-id/,
    );
    const { mechanicsDefinition: _removed, ...invalid } = copy;
    await assert.rejects(library.saveProfile(invalid));
    await assert.rejects(library.deleteProfile(defaultUnitProfile.id), /cannot be deleted/);

    await writeFile(join(options.defaultDirectory, 'profiles', 'broken.json'), '{');
    await symlink(file, join(options.defaultDirectory, 'profiles', 'linked.json'));
    assert.equal((await library.profiles()).profiles.length, bundledProfiles.length + 1);

    const afterDelete = await library.deleteProfile('quick-copy');
    assert.equal(afterDelete.profiles.length, bundledProfiles.length);
    await assert.rejects(library.deleteProfile('quick-copy'));
  } finally {
    await cleanup();
  }
});
