import { cp, mkdir } from 'node:fs/promises';

const target = new URL('../dist/lab/public/', import.meta.url);
await mkdir(target, { recursive: true });
await cp(new URL('../src/lab/public/', import.meta.url), target, { recursive: true });
