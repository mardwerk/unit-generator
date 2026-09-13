#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = 'scripts/check-public-boundary.mjs';
const foundationRoot = resolve(root, '..', 'foundation');
const foundationPackagesRoot = resolve(foundationRoot, 'packages');
const ignoredDirectories = new Set([
  '.git',
  '.data',
  '.scratch',
  'node_modules',
  'dist',
  'build',
  '.svelte-kit',
  'coverage',
  'playwright-report',
  'test-results'
]);
const dependencySections = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'resolutions',
  'overrides'
];

// Documentation is scanned for local paths and disallowed punctuation.
const documentationExtensions = new Set(['.adoc', '.md', '.mdx', '.rst']);
const documentationNames = new Set(['readme', 'license', 'notice', 'changelog']);

const textRules = [
  {
    code: 'map-generator',
    pattern: /(?:@mardwerk\/map-generator|\bmap[-_. ]?generator\b|\bmapgenerator\b)/i,
    message: 'Map Generator dependency or usage'
  },
  {
    code: 'private-path',
    pattern:
      /(?:\/(?:home|Users|root|tmp|workspace)(?:\/[^\s"'`]*|\b)|\/run\/secrets(?:\/[^\s"'`]*|\b)|\/(?:private|var\/private)\/(?:corpus|reference|game-data)(?:\/|\b)|\b[A-Z]:[\\/](?:Users|Program Files|Steam)[^\s"'`]*)/i,
    message: 'local or installation path'
  },
  {
    code: 'direct-bits-ui-import',
    pattern:
      /(?:\bfrom\s+['"]bits-ui(?:\/|['"])|\bimport\s+['"]bits-ui(?:\/|['"])|\bimport\s*\(\s*['"]bits-ui(?:\/|['"])|\brequire(?:\.resolve)?\s*\(\s*['"]bits-ui(?:\/|['"]))/i,
    message: 'direct bits-ui import; use @mardwerk/ui'
  },
  {
    code: 'registry-url',
    pattern: /(?:registry\.npmjs\.org\/@mardwerk|npmjs\.com\/package\/@mardwerk)/i,
    message: '@mardwerk registry URL'
  },
  {
    code: 'registry-version',
    pattern: /@mardwerk\/[a-z0-9._-]+@(?:\^|~|>=|<=|>|<|=)?\d+\.\d+(?:\.\d+)?/i,
    message: 'published @mardwerk version; use a local link or workspace range'
  },
  {
    code: 'registry-install',
    pattern: /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|i)\b[^\r\n]*@mardwerk\//i,
    message: 'install command resolves @mardwerk from a registry'
  },
  {
    code: 'unicode-em-dash',
    pattern: /\u2014/u,
    message: 'Unicode em dash is not allowed'
  }
];

const documentationRules = textRules.filter(({ code }) =>
  ['private-path', 'unicode-em-dash'].includes(code)
);

function isDocumentation(file) {
  const normalized = file.toLowerCase();
  const name = basename(normalized).replace(extname(normalized), '');
  return (
    normalized.startsWith('docs/') ||
    documentationExtensions.has(extname(normalized)) ||
    documentationNames.has(name)
  );
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isTestFile(file) {
  return /(?:^|\/)(?:test|tests)\//u.test(file);
}

function isMalformedFixture(file) {
  return file.startsWith('fixtures/malformed/');
}

function isFixtureWriter(file) {
  return file === 'packages/unit-lab/src/write-fixtures.ts';
}

function isAllowedNegativeFixture(file, rule, line) {
  // These are fixed image build paths, not paths into a contributor's filesystem.
  if (
    rule.code === 'private-path' &&
    file === 'deployment/Containerfile' &&
    /^(?:WORKDIR \/workspace\/(?:foundation|unit-generator)|COPY --from=build \/workspace \/workspace)$/.test(
      line.trim()
    )
  )
    return true;
  // Tests deliberately exercise rejection of absolute provenance paths. Keep
  // that input visible to the validator without treating it as runtime data.
  return (
    rule.code === 'private-path' &&
    (isTestFile(file) || isMalformedFixture(file) || isFixtureWriter(file)) &&
    /\b(?:derivation|provenance|sourcePointer)\b/i.test(line)
  );
}

function fallbackFiles(directory, output = [], prefix = '') {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    compareText(a.name, b.name)
  );
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name) || entry.name === '.env') continue;
    const file = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) fallbackFiles(absolute, output, file);
    else if (entry.isFile()) output.push(file);
  }
  return output;
}

function publicFiles() {
  try {
    const output = execFileSync(
      'git',
      ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { encoding: 'buffer' }
    )
      .toString('utf8')
      .split('\0')
      .filter(Boolean);
    return output.sort(compareText);
  } catch {
    return fallbackFiles(root).sort(compareText);
  }
}

function sourceLine(file, lineNumber, line) {
  const excerpt = line.trim().replace(/\s+/g, ' ');
  return `${file}:${lineNumber}${excerpt ? ` (${excerpt.slice(0, 160)})` : ''}`;
}

function addTextIssues(file, text, issues, rules = textRules) {
  const lines = text.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const rule of rules) {
      if (rule.pattern.test(line) && !isAllowedNegativeFixture(file, rule, line)) {
        issues.push({
          location: sourceLine(file, index + 1, line),
          code: rule.code,
          message: rule.message
        });
      }
    }
  }
}

function foundationLink(specifier, manifestFile) {
  if (typeof specifier !== 'string' || !specifier.startsWith('link:')) return false;
  const target = resolve(dirname(resolve(root, manifestFile)), specifier.slice('link:'.length));
  return target.startsWith(`${foundationPackagesRoot}${sep}`);
}

function packageIssue(file, key, message, issues) {
  issues.push({ location: `${file} (${key})`, code: 'manifest-boundary', message });
}

function checkPackageManifest(file, source, packageNames, issues) {
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch (error) {
    issues.push({
      location: `${file}:1`,
      code: 'manifest-json',
      message: `invalid package.json (${error instanceof Error ? error.message : String(error)})`
    });
    return;
  }

  if (file === 'packages/core/package.json') {
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      if (name.startsWith('@mardwerk/'))
        packageIssue(
          file,
          name,
          'Core cannot depend on providers, definitions, platform or game packages',
          issues
        );
    }
  }
  if (
    file === 'packages/providers/package.json' &&
    manifest.dependencies?.['@mardwerk/unit-definitions']
  ) {
    packageIssue(
      file,
      'dependencies',
      'Providers cannot depend on bundled game definitions',
      issues
    );
  }
  for (const section of dependencySections) {
    const dependencies = manifest?.[section];
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) continue;
    for (const [name, specifier] of Object.entries(dependencies)) {
      if (name === 'bits-ui') {
        packageIssue(
          file,
          `${section}.${name}`,
          'direct bits-ui dependency; depend on @mardwerk/ui',
          issues
        );
        continue;
      }
      if (name === '@mardwerk/map-generator') {
        packageIssue(file, `${section}.${name}`, 'forbidden Step 1 package', issues);
        continue;
      }
      if (!name.startsWith('@mardwerk/')) continue;
      if (
        packageNames.has(name) &&
        typeof specifier === 'string' &&
        specifier.startsWith('workspace:')
      ) {
        continue;
      }
      if (foundationLink(specifier, file)) continue;
      packageIssue(
        file,
        `${section}.${name}`,
        'must use a relative link:../foundation/* dependency (or workspace:* for this repository)',
        issues
      );
    }
  }
}

function checkCrewReceipt(file, source, issues) {
  if (
    !file.startsWith('examples/straw-hats/runs/') ||
    !['receipt.json', 'independent-review.json', 'run.json'].includes(basename(file))
  )
    return 0;
  let receipt;
  try {
    receipt = JSON.parse(source);
  } catch {
    issues.push({
      location: file,
      code: 'invalid-receipt',
      message: 'could not parse crew receipt'
    });
    return 0;
  }
  let copiedCharacters = 0;
  const visit = (value, path = '') => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const location = `${path}/${key}`;
      if (
        ['content', 'quote', 'sourceQuote', 'excerpt'].includes(key) &&
        typeof child === 'string' &&
        child.length
      ) {
        copiedCharacters += child.length;
        issues.push({
          location: `${file}${location}`,
          code: 'private-source-text',
          message: 'keep source text private; publish source IDs, URLs, hashes and offsets'
        });
      }
      visit(child, location);
    }
  };
  visit(receipt);
  return copiedCharacters;
}

function check() {
  const files = publicFiles();
  const issues = [];
  const packageSources = new Map();
  const packageNames = new Set();

  for (const file of files) {
    if (isDocumentation(file) || extname(file).toLowerCase() !== '.json') continue;
    if (basename(file) !== 'package.json') continue;
    try {
      const source = readFileSync(resolve(root, file), 'utf8');
      packageSources.set(file, source);
      const manifest = JSON.parse(source);
      if (typeof manifest?.name === 'string') packageNames.add(manifest.name);
    } catch {
      // Parse failures are reported in the second pass with a useful location.
    }
  }

  let scanned = 0;
  let copiedSourceCharacters = 0;
  for (const file of files) {
    if (file === scriptPath) continue;
    const absolute = resolve(root, file);
    let source;
    try {
      const info = statSync(absolute);
      if (!info.isFile() || info.size > 8 * 1024 * 1024) continue;
      const bytes = readFileSync(absolute);
      if (bytes.includes(0)) continue;
      source = bytes.toString('utf8');
    } catch {
      issues.push({ location: file, code: 'unreadable', message: 'could not read public file' });
      continue;
    }
    scanned += 1;

    // Preserve exact generated payload bytes and receipt hashes. Presentation rules apply to prose.
    const generatedPayload =
      /^examples\/straw-hats\/runs\/[^/]+\/[^/]+\/(?:unit|candidate|receipt)\.json$/.test(file);
    const rules = isDocumentation(file)
      ? documentationRules
      : generatedPayload
        ? textRules.filter(({ code }) => code !== 'unicode-em-dash')
        : textRules;
    for (const rule of rules) {
      if (rule.pattern.test(file)) {
        issues.push({ location: file, code: rule.code, message: rule.message });
      }
    }
    addTextIssues(file, source, issues, rules);
    copiedSourceCharacters += checkCrewReceipt(file, source, issues);
    if (file.endsWith('/package.json') || file === 'package.json') {
      checkPackageManifest(file, packageSources.get(file) ?? source, packageNames, issues);
    }
  }

  issues.sort(
    (a, b) =>
      compareText(a.location, b.location) ||
      compareText(a.code, b.code) ||
      compareText(a.message, b.message)
  );
  if (issues.length > 0) {
    console.error(
      `Public-boundary check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`
    );
    for (const issue of issues)
      console.error(`- ${issue.location} [${issue.code}] ${issue.message}`);
    if (copiedSourceCharacters)
      console.error(
        `Crew receipts contain ${copiedSourceCharacters} copied source characters in total.`
      );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Public-boundary check passed (${scanned} public files checked; documentation checked for local paths and em dashes).`
  );
}

check();
