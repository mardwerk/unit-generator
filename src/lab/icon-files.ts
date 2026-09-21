import sharp from 'sharp';
import { visualReferenceSchema } from '../core/schemas.js';
import type { VisualReference } from '../core/index.js';
import { rankedPortraits, safeReference } from '../presentation/portraits.js';
import { iconSubjects } from '../presentation/icon-subjects.js';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LabArtifact, LibraryIcon, LibraryIconsResponse } from './contracts.js';

const maxIconBytes = 8 * 1024 * 1024;
const maxEncodedBytes = 16 * 1024 * 1024;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function ownedDirectory(path: string): Promise<void> {
  try {
    await mkdir(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('UnitLab icon folders must be real directories, not symbolic links.');
  }
}

async function readPng(path: string): Promise<Buffer | undefined> {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error('The icon must be a regular PNG file.');
    if (stat.size > maxIconBytes) throw new Error('The icon exceeds the 8 MB limit.');
    // Bound the read even if another process grows the file after stat().
    const bytes = Buffer.alloc(Math.min(stat.size + 1, maxIconBytes + 1));
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await file.read(bytes, size, bytes.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > stat.size) throw new Error('The icon changed while loading. Refresh to retry.');
    const image = bytes.subarray(0, size);
    // Identify PNG content; the browser performs actual image decoding.
    if (image.length < pngSignature.length || !image.subarray(0, 8).equals(pngSignature)) {
      throw new Error('The icon file does not contain a PNG image.');
    }
    return image;
  } finally {
    await file.close();
  }
}

/** Provision deterministic local destinations, then load only their existing PNG files. */
export async function libraryIcons(
  libraryDirectory: string,
  artifact: LabArtifact,
): Promise<LibraryIconsResponse> {
  if (artifact.kind === 'prepared') return { directory: libraryDirectory, icons: [] };
  const candidate = artifact.kind === 'checked' ? artifact.draft.candidate : artifact.candidate;
  const keys = iconSubjects(candidate).map((subject) => subject.key);
  const directory = await unitDirectory(libraryDirectory, artifact);
  const portrait = await portraitReference(libraryDirectory, artifact);
  const icons: LibraryIcon[] = [];
  let encodedBytes = 0;
  for (const key of new Set(keys)) {
    const icon: LibraryIcon = { key, path: join(directory, `icon-${hash(key)}.png`) };
    try {
      const image = await readPng(icon.path);
      if (image) {
        const imageBytes = Math.ceil(image.length / 3) * 4 + 'data:image/png;base64,'.length;
        if (encodedBytes + imageBytes > maxEncodedBytes) {
          icon.note = 'The icon preview exceeds the combined 16 MB limit.';
        } else {
          icon.dataUrl = `data:image/png;base64,${image.toString('base64')}`;
          encodedBytes += imageBytes;
        }
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      icon.note = code
        ? 'The icon could not be read as a regular local PNG file.'
        : error instanceof Error
          ? error.message
          : 'The icon could not be read.';
    }
    icons.push(icon);
  }
  return { directory, icons, ...(portrait ? { portrait } : {}) };
}

/** Only a catalogue-owned destination is writable; callers never submit filesystem paths. */
export async function saveLibraryIcon(
  libraryDirectory: string,
  artifact: LabArtifact,
  key: string,
  png: Uint8Array,
  receipt: { model: string; usage?: import('../core/index.js').ModelUsage },
): Promise<LibraryIconsResponse> {
  const before = await libraryIcons(libraryDirectory, artifact);
  const icon = before.icons.find((entry) => entry.key === key);
  if (!icon) throw new Error('This Unit has no matching icon destination.');
  const bytes = Buffer.from(png);
  if (bytes.length > maxIconBytes || bytes.length < 8 || !bytes.subarray(0, 8).equals(pngSignature))
    throw new Error('The generated icon must be a PNG under 8 MB.');
  // Preserve every successful provider receipt separately when a user replaces an icon.
  const id = randomUUID();
  const temporary = join(before.directory, `.image-${id}.tmp`);
  const record = { id, generatedAt: new Date().toISOString(), key, path: icon.path, ...receipt };
  await writeFile(
    join(before.directory, `image-${id}.json`),
    JSON.stringify(record, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    await rename(temporary, icon.path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
  return libraryIcons(libraryDirectory, artifact);
}

function requestOf(artifact: LabArtifact) {
  return artifact.kind === 'prepared'
    ? artifact.request
    : artifact.kind === 'checked'
      ? artifact.draft.prepared.request
      : artifact.prepared.request;
}

async function unitDirectory(libraryDirectory: string, artifact: LabArtifact, create = true) {
  const identity = requestOf(artifact).character;
  const unitId = hash(JSON.stringify([identity.name, identity.work, identity.scope]));
  if (create) await mkdir(libraryDirectory, { recursive: true });
  const root = await realpath(libraryDirectory);
  const assets = join(root, 'assets');
  const directory = join(assets, `unit-${unitId}`);
  for (const path of [assets, directory]) {
    if (create) await ownedDirectory(path);
    else {
      const stat = await lstat(path);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error('Portrait folders must be real directories.');
    }
  }
  return directory;
}

export async function portraitReference(
  libraryDirectory: string,
  artifact: LabArtifact,
): Promise<VisualReference | undefined> {
  try {
    const directory = await unitDirectory(libraryDirectory, artifact, false);
    const file = await open(
      join(directory, 'portrait.json'),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 32_768) throw new Error('Invalid portrait preference.');
      const bytes = Buffer.alloc(32_769);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead > 32_768) throw new Error('Portrait preference exceeds its limit.');
      const reference = visualReferenceSchema.parse(
        JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')),
      );
      if (safeReference(reference)) return reference;
    } finally {
      await file.close();
    }
  } catch {
    /* A missing or damaged preference cannot hide source portraits. */
  }
  return rankedPortraits(
    requestOf(artifact).documents.flatMap((document) => document.visualReferences ?? []),
  )[0];
}

export async function savePortraitReference(
  libraryDirectory: string,
  artifact: LabArtifact,
  referenceId: string,
) {
  const reference = requestOf(artifact)
    .documents.flatMap((document) => document.visualReferences ?? [])
    .find((entry) => entry.id === referenceId && safeReference(entry));
  if (!reference) throw new Error('Choose a portrait from this character’s source images.');
  const content = JSON.stringify(reference) + '\n';
  if (Buffer.byteLength(content) > 32_768)
    throw new Error('Portrait preference exceeds its limit.');
  const directory = await unitDirectory(libraryDirectory, artifact);
  const temporary = join(directory, `.portrait-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
    await rename(temporary, join(directory, 'portrait.json'));
  } finally {
    await unlink(temporary).catch(() => {});
  }
  return { portrait: reference };
}

/** List only one small portrait, never the complete icon catalogue. */
export async function libraryPortrait(libraryDirectory: string, artifact: LabArtifact) {
  const reference = await portraitReference(libraryDirectory, artifact);
  if (reference)
    return { url: reference.url, sourceUrl: reference.sourceUrl, caption: reference.caption };
  try {
    const directory = await unitDirectory(libraryDirectory, artifact, false);
    const image = await readPng(join(directory, `icon-${hash('unit-portrait')}.png`));
    if (!image) return undefined;
    const thumbnail = await sharp(image, { limitInputPixels: 16 * 1024 * 1024 })
      .resize(96, 96, { fit: 'cover' })
      .timeout({ seconds: 3 })
      .png()
      .toBuffer();
    if (thumbnail.length > 48 * 1024) return undefined;
    return {
      url: `data:image/png;base64,${thumbnail.toString('base64')}`,
      caption: `${requestOf(artifact).character.name} generated portrait`,
    };
  } catch {
    return undefined;
  }
}
