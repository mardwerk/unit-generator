import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  link,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import type {
  LabArtifact,
  LibraryEntry,
  LibraryState,
  ProfileEntry,
  ProfilesState,
} from './contracts.js';
import { bundledProfiles, unitProfileSchema, validateProfile } from '../core/index.js';
import { defaultRunsDir } from '../node/paths.js';
import { inspectInput } from './operations.js';
import {
  libraryIcons,
  saveLibraryIcon,
  libraryPortrait,
  savePortraitReference,
  portraitReference,
} from './icon-files.js';

const idSchema = z.string().regex(/^[a-f0-9]{64}$/);
const recordSchema = z.strictObject({
  unitLabLibrary: z.literal(1),
  id: idSchema,
  savedAt: z.iso.datetime(),
  artifact: z.unknown(),
});
const settingsSchema = z.strictObject({
  unitLabSettings: z.literal(1),
  directory: z.string().min(1),
});
const managedName = /^unitlab-([a-f0-9]{64})\.json$/;
const profileName = /^([a-z0-9][a-z0-9-]{0,62})\.json$/;
const bundledIds = new Set(bundledProfiles.map((profile) => profile.id));
const maxFileBytes = 32_000_000;

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

async function readManagedJson(path: string): Promise<unknown> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxFileBytes) {
      throw new Error('Library documents must be regular JSON files under 32 MB.');
    }
    return JSON.parse(await file.readFile('utf8')) as unknown;
  } finally {
    await file.close();
  }
}

async function validArtifact(input: unknown): Promise<LabArtifact> {
  const inspected = await inspectInput(input);
  if (inspected.kind === 'request') throw new Error('Save a completed stage to the library.');
  return inspected.artifact;
}

function artifactId(artifact: LabArtifact): string {
  return createHash('sha256').update(JSON.stringify(artifact)).digest('hex');
}

function entryOf(record: { id: string; savedAt: string; artifact: LabArtifact }): LibraryEntry {
  const artifact = record.artifact;
  const prepared =
    artifact.kind === 'prepared'
      ? artifact
      : artifact.kind === 'checked'
        ? artifact.draft.prepared
        : artifact.prepared;
  return {
    id: record.id,
    savedAt: record.savedAt,
    kind: artifact.kind,
    character: prepared.request.character,
    artifactId:
      artifact.kind === 'result'
        ? artifact.id
        : artifact.kind === 'prepared'
          ? artifact.inputHash
          : artifact.kind === 'checked'
            ? artifact.draft.run.id
            : artifact.run.id,
  };
}

/** Filesystem state belongs to the Lab adapter, never the generator core. */
export class LabLibrary {
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    private directory: string,
    private readonly settingsFile: string,
  ) {}

  static async open(options: { settingsFile?: string; defaultDirectory?: string } = {}) {
    const settingsFile = resolve(
      options.settingsFile ?? join(defaultRunsDir(), 'lab-settings.json'),
    );
    let directory = resolve(options.defaultDirectory ?? join(defaultRunsDir(), 'library'));
    try {
      directory = resolve(settingsSchema.parse(await readManagedJson(settingsFile)).directory);
    } catch (error) {
      if (!isMissing(error)) throw new Error(`Cannot read UnitLab settings: ${String(error)}`);
    }
    return new LabLibrary(directory, settingsFile);
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private filename(id: string): string {
    return join(this.directory, `unitlab-${idSchema.parse(id)}.json`);
  }

  private async read(id: string) {
    const record = recordSchema.parse(await readManagedJson(this.filename(id)));
    const artifact = await validArtifact(record.artifact);
    if (record.id !== id || artifactId(artifact) !== id) {
      throw new Error('Library document content does not match its saved identifier.');
    }
    return { ...record, artifact };
  }

  private async list(): Promise<LibraryState> {
    let files: string[];
    try {
      files = await readdir(this.directory);
    } catch (error) {
      if (isMissing(error)) return { directory: this.directory, entries: [] };
      throw error;
    }
    const entries: LibraryEntry[] = [];
    for (const name of files) {
      const id = managedName.exec(name)?.[1];
      if (!id) continue;
      try {
        const record = await this.read(id);
        const portrait = await libraryPortrait(this.directory, record.artifact);
        entries.push({ ...entryOf(record), ...(portrait ? { portrait } : {}) });
      } catch {
        // Unrelated, damaged and symlinked files are never eligible for library deletion.
      }
    }
    entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id));
    return { directory: this.directory, entries };
  }

  state(): Promise<LibraryState> {
    return this.serial(() => this.list());
  }

  save(input: unknown): Promise<LibraryEntry> {
    return this.serial(async () => {
      const artifact = await validArtifact(input);
      const id = artifactId(artifact);
      try {
        return entryOf(await this.read(id));
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      const record = { unitLabLibrary: 1, id, savedAt: new Date().toISOString(), artifact };
      const content = JSON.stringify(record, null, 2) + '\n';
      if (Buffer.byteLength(content) > maxFileBytes)
        throw new Error('Library artifact exceeds 32 MB.');
      await mkdir(this.directory, { recursive: true });
      const temporary = join(this.directory, `.unitlab-${randomUUID()}.tmp`);
      await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
      try {
        // Publish only complete documents, without overwriting a preexisting file.
        await link(temporary, this.filename(id));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        return entryOf(await this.read(id));
      } finally {
        await unlink(temporary);
      }
      return entryOf(record);
    });
  }

  load(id: string): Promise<{ artifact: LabArtifact }> {
    return this.serial(async () => ({ artifact: (await this.read(id)).artifact }));
  }

  icons(input: unknown) {
    return this.serial(async () => libraryIcons(this.directory, await validArtifact(input)));
  }

  portrait(input: unknown) {
    return this.serial(async () => ({
      portrait: await portraitReference(this.directory, await validArtifact(input)),
    }));
  }

  setPortrait(input: unknown, referenceId: string) {
    return this.serial(async () =>
      savePortraitReference(this.directory, await validArtifact(input), referenceId),
    );
  }

  saveIcon(
    input: unknown,
    key: string,
    png: Uint8Array,
    receipt: { model: string; usage?: import('../core/index.js').ModelUsage },
  ) {
    return this.serial(async () =>
      saveLibraryIcon(this.directory, await validArtifact(input), key, png, receipt),
    );
  }

  private profileFile(id: string): string {
    if (!profileName.test(`${id}.json`)) throw new Error('Unknown Profile.');
    return join(this.directory, 'profiles', `${id}.json`);
  }

  private async listProfiles(): Promise<ProfilesState> {
    const profiles: ProfileEntry[] = bundledProfiles.map((profile) => ({
      profile,
      builtIn: true,
    }));
    let files: string[] = [];
    try {
      files = await readdir(join(this.directory, 'profiles'));
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    for (const name of files.sort()) {
      const id = profileName.exec(name)?.[1];
      if (!id || bundledIds.has(id)) continue;
      try {
        const profile = unitProfileSchema.parse(await readManagedJson(this.profileFile(id)));
        if (profile.id === id) profiles.push({ profile, builtIn: false });
      } catch {
        // Unrelated, damaged and symlinked files are not Profiles.
      }
    }
    return { directory: this.directory, profiles };
  }

  profiles(): Promise<ProfilesState> {
    return this.serial(() => this.listProfiles());
  }

  /** Saving runs the same checks as preparing a request under the Profile. */
  saveProfile(input: unknown): Promise<ProfilesState> {
    return this.serial(async () => {
      const profile = await validateProfile(input);
      if (bundledIds.has(profile.id))
        throw new Error('Bundled Profiles are read-only. Save a copy under a new ID.');
      if (profile.rules.id !== `profile:${profile.id}`)
        throw new Error(`A saved Profile's rules document must have the ID profile:${profile.id}.`);
      const file = this.profileFile(profile.id);
      await mkdir(dirname(file), { recursive: true });
      const temporary = join(dirname(file), `.profile-${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(profile, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
      try {
        await rename(temporary, file);
      } catch (error) {
        await unlink(temporary);
        throw error;
      }
      return this.listProfiles();
    });
  }

  deleteProfile(id: string): Promise<ProfilesState> {
    return this.serial(async () => {
      if (bundledIds.has(id)) throw new Error('Bundled Profiles cannot be deleted.');
      const file = this.profileFile(id);
      if (!(await lstat(file)).isFile()) throw new Error('Unknown Profile.');
      await unlink(file);
      return this.listProfiles();
    });
  }

  delete(ids: string[]): Promise<LibraryState> {
    return this.serial(async () => {
      const selected = [...new Set(z.array(idSchema).max(10_000).parse(ids))];
      // Validate every selected document before removing any. Never recurse into folders.
      for (const id of selected) await this.read(id);
      for (const id of selected) await unlink(this.filename(id));
      return this.list();
    });
  }

  configure(input: string): Promise<LibraryState> {
    return this.serial(async () => {
      const supplied = z.string().trim().min(1).max(4096).parse(input);
      const directory = resolve(supplied);
      await mkdir(directory, { recursive: true });
      const canonical = await realpath(directory);
      await mkdir(dirname(this.settingsFile), { recursive: true });
      const temporary = `${this.settingsFile}.${randomUUID()}.tmp`;
      await writeFile(
        temporary,
        JSON.stringify({ unitLabSettings: 1, directory: canonical }, null, 2) + '\n',
        { flag: 'wx', mode: 0o600 },
      );
      try {
        await rename(temporary, this.settingsFile);
      } catch (error) {
        await unlink(temporary);
        throw error;
      }
      this.directory = canonical;
      return this.list();
    });
  }
}
