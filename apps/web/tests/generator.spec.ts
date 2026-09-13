import { expect, test, type Page, type Download } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

async function chooseDemo(page: Page) {
  await page.getByRole('combobox', { name: 'Generation quality' }).click();
  await page.getByRole('option', { name: 'Demo fixture', exact: true }).click();
}
async function downloadedJson(download: Download) {
  return JSON.parse(await readFile((await download.path())!, 'utf8'));
}

test('theme defaults dark and keyboard changes persist in server-rendered HTML', async ({
  page,
  context
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/', { waitUntil: 'networkidle' });
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(root).toHaveCSS('color-scheme', 'dark');

  const lightToggle = page.getByRole('button', { name: 'Switch to light mode', exact: true });
  await lightToggle.focus();
  await lightToggle.press('Enter');
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(root).toHaveCSS('color-scheme', 'light');
  await expect(
    page.getByRole('button', { name: 'Switch to dark mode', exact: true })
  ).toBeFocused();
  await expect(lightToggle).toHaveCount(0);

  // This request shares the browser cookie and cannot execute client-side JavaScript.
  const response = await context.request.get('/');
  expect(response.ok()).toBe(true);
  expect(await response.text()).toMatch(/<html\b[^>]*\bdata-theme="light"/);

  await page.reload({ waitUntil: 'networkidle' });
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(root).toHaveCSS('color-scheme', 'light');
  const darkToggle = page.getByRole('button', { name: 'Switch to dark mode', exact: true });
  await darkToggle.focus();
  await darkToggle.press('Space');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(lightToggle).toBeFocused();
});

test('theme rejects an invalid saved cookie in server-rendered HTML', async ({
  page,
  context,
  baseURL
}) => {
  await context.addCookies([{ name: 'mardwerk-theme', value: 'invalid', url: baseURL! }]);
  await page.emulateMedia({ colorScheme: 'light' });
  const response = await context.request.get('/');
  expect(response.ok()).toBe(true);
  expect(await response.text()).toMatch(/<html\b[^>]*\bdata-theme="dark"/);
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await expect(
    page.getByRole('button', { name: 'Switch to light mode', exact: true })
  ).toBeVisible();
});

for (const label of ['MangaMayhem', 'BTD6-derived', 'Tower defense']) {
  test(`${label} uses the subject composer and displays its synthetic upgrade paths`, async ({
    page
  }) => {
    await page.goto('/');
    await chooseDemo(page);
    await page.getByRole('combobox', { name: 'Generation definition' }).click();
    await page.getByRole('option', { name: label, exact: true }).click();
    await page.getByLabel('Subject', { exact: true }).fill('Clockwork sentry');
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByTestId('acceptance')).toHaveText('Checks passed · review required');
    await expect(
      page.getByRole('heading', { name: 'Clockwork sentry', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Upgrade paths' }).locator('.upgrade-path')
    ).toHaveCount(3);
    await page.screenshot({
      path: test.info().outputPath(`${label}-candidate.png`),
      fullPage: true,
      animations: 'disabled'
    });
  });
}

test('shared tower mechanics survive editing and unresolved captures remain rejected', async ({
  page
}) => {
  await page.goto('/');
  await chooseDemo(page);
  await page.getByRole('combobox', { name: 'Generation definition' }).click();
  await page.getByRole('option', { name: 'Tower defense', exact: true }).click();
  await page.getByLabel('Subject', { exact: true }).fill('Workshop sentinel');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByTestId('acceptance')).toHaveText('Checks passed · review required');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const editor = page.getByLabel('Content JSON');
  const candidate = JSON.parse(await editor.inputValue());
  expect(candidate.schemaVersion).toBe('btd6-derived/0.2');
  candidate.base.actors = [{ id: 'helper', attacks: [structuredClone(candidate.base.attacks[0])] }];
  candidate.base.passiveSummons = [
    { id: 'helper-entry', actorId: 'helper', startDelaySeconds: 2, lifetimeSeconds: 10 }
  ];
  candidate.base.income = [
    {
      id: 'workshop-income',
      amount: 20,
      emissionsPerRound: 2,
      intervalSeconds: 5,
      pickupLifetimeSeconds: 10,
      autoCollect: true
    }
  ];
  candidate.base.support = [
    {
      id: 'range-aura',
      radius: 30,
      global: false,
      includesOwner: false,
      stackGroup: 'workshop',
      rangeMultiplier: 0.1,
      rangeAdditive: 2
    }
  ];
  await editor.fill(JSON.stringify(candidate));
  await page.getByRole('button', { name: 'Check changes' }).click();
  await expect(page.getByTestId('acceptance')).toHaveText('Checks passed · review required');
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'workshop-income', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'range-aura', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'helper', exact: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('shared-mechanics.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('shared-mechanics-mobile.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  candidate.resolution = 'captured-endpoints';
  candidate.base = null;
  candidate.endpoints = [
    { tiers: [0, 0, 0], model: null, unsupported: ['Captured attack reference is missing.'] }
  ];
  await editor.fill(JSON.stringify(candidate));
  await page.getByRole('button', { name: 'Check changes' }).click();
  await expect(page.getByTestId('acceptance')).toHaveText('Candidate needs changes');
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(
    page.getByText('The captured base model is unresolved.', { exact: false })
  ).toBeVisible();
  await page.getByText('Build 0 / 0 / 0 · unresolved', { exact: true }).click();
  await expect(
    page.getByText('This captured build has unresolved references.', { exact: false })
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export candidate' }).click();
  const exported = await downloadedJson(await download);
  expect(exported.status).toBe('failed');
  expect(exported.output).toBeUndefined();
  expect(exported.candidate.base).toBeNull();
  expect(exported.candidate.endpoints[0].model).toBeNull();
});

test('one process generates, invalidates edits, exports, and forgets on refresh', async ({
  page
}) => {
  await page.goto('/');
  await chooseDemo(page);
  await page.getByLabel('Subject', { exact: true }).fill('Clockwork heron');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByTestId('acceptance')).toHaveText('Checks passed · review required');
  const acceptedDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export result', exact: true }).click();
  const accepted = await downloadedJson(await acceptedDownload);
  expect(accepted.output.name).toBe('Clockwork heron');
  expect(accepted.status).toBe('success');
  expect(accepted.candidate).toBeUndefined();
  await page.getByRole('button', { name: /^Research/ }).click();
  await expect(page.getByRole('button', { name: 'Export research' })).toBeVisible();
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.screenshot({
    path: test.info().outputPath('playground-desktop.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: test.info().outputPath('playground-mobile.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const editor = page.getByLabel('Content JSON');
  const content = JSON.parse(await editor.inputValue());
  await editor.fill(JSON.stringify({ actions: [null], units: [null] }));
  await expect(page.getByTestId('acceptance')).toHaveText('Unvalidated edit');
  content.economy.baseCostCredits = -1;
  await editor.fill(JSON.stringify(content));
  await expect(page.getByTestId('acceptance')).toHaveText('Unvalidated edit');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export candidate' }).click();
  const candidateDownload = await download;
  expect(candidateDownload.suggestedFilename()).toBe('unit-candidate.json');
  const exported = await downloadedJson(candidateDownload);
  expect(exported.status).toBe('failed');
  expect(exported.output).toBeUndefined();
  expect(exported.qualification).toBeUndefined();
  expect(exported.candidate.economy.baseCostCredits).toBe(-1);
  expect(exported.validation.structure.status).toBe('not-completed');
  await page.getByRole('button', { name: 'Check changes' }).click();
  await expect(page.getByTestId('acceptance')).toHaveText('Candidate needs changes');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await page.reload();
  await expect(page.getByTestId('acceptance')).toHaveCount(0);
  await expect(page.getByLabel('Subject', { exact: true })).toHaveValue('');
});

test('a structurally different family uses the same page and stream', async ({ page }) => {
  await page.goto('/');
  await chooseDemo(page);
  await page.getByText('Advanced', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Generation definition' }).click();
  await page.getByRole('option', { name: 'Merge unit family' }).click();
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByTestId('acceptance')).toHaveText('Checks passed · review required');
  await expect(page.getByRole('heading', { name: 'Unit family', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Actions', exact: true })).toHaveCount(0);
});

test('denies cross-origin calls, arbitrary definitions and oversized bodies', async ({
  request,
  baseURL
}) => {
  const invalid = await request.post('/api/run', {
    headers: { origin: 'https://untrusted.example' },
    data: {}
  });
  expect(invalid.status()).toBe(403);
  const definition = await request.post('/api/run', {
    headers: { origin: baseURL! },
    data: { operation: 'generate', definition: '../untrusted.mjs', input: {} }
  });
  expect(definition.status()).toBe(400);
  const oversized = await request.post('/api/run', {
    headers: { origin: baseURL! },
    data: { padding: 'x'.repeat(4 * 1024 * 1024) }
  });
  expect(oversized.status()).toBe(413);
  const jobs = await request.get('/api/v1/jobs');
  expect(jobs.status()).toBe(404);
});

test('an interrupted stream preserves already received research in the page', async ({ page }) => {
  await page.route('**/api/run', async (route) => {
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        JSON.stringify({
          type: 'research',
          result: {
            schemaVersion: '0.2',
            status: 'success',
            subject: 'Retained subject',
            sources: [
              {
                id: 'source',
                title: 'Captured text',
                content: 'All captured substantive text.',
                origin: 'supplied',
                status: 'read',
                truncated: false,
                omissions: []
              }
            ],
            reused: false,
            grounding: 'grounded',
            gaps: []
          }
        }) + '\n'
    });
  });
  await page.goto('/');
  await chooseDemo(page);
  await page.getByLabel('Subject', { exact: true }).fill('Retained subject');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('connection ended');
  await expect(page.getByRole('button', { name: 'Export research' })).toBeVisible();
});

test('Cancel stops the actual command provider and keeps captured sources', async ({ page }) => {
  test.skip(process.platform === 'win32', 'The child-process assertion uses ps.');
  const executable = fileURLToPath(new URL('./slow-model.mjs', import.meta.url));
  const alive = async () =>
    (await promisify(execFile)('ps', ['-eo', 'args'])).stdout
      .split('\n')
      .some((line) => line.includes(executable));
  await page.clock.install();
  await page.goto('/');
  await chooseDemo(page);
  await page.getByLabel('Subject', { exact: true }).fill('Original sentinel');
  await page.getByText('Advanced', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Model connection override' }).click();
  await page
    .getByRole('option')
    .filter({ hasText: /command/i })
    .click();
  await page
    .getByLabel('Source material', { exact: true })
    .fill('A sentinel who protects nearby allies.');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect.poll(alive).toBe(true);
  await page.clock.fastForward(300_000);
  await expect(page.getByRole('button', { name: 'Generating…', exact: false })).toBeDisabled();
  expect(
    Number((await page.locator('.elapsed').textContent())!.replace('s', ''))
  ).toBeGreaterThanOrEqual(300);
  await expect(page.getByRole('button', { name: 'Export research' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(alive).toBe(false);
  await expect(page.getByRole('alert')).toContainText('Cancelled');
  await expect(page.getByRole('button', { name: 'Export research' })).toBeVisible();
});

test('selectors support keyboard selection, cancellation and outside dismissal', async ({
  page
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const definition = page.getByRole('combobox', { name: 'Generation definition' });
  await definition.focus();
  await definition.press('ArrowDown');
  await definition.press('End');
  await definition.press('Escape');
  await expect(definition).toContainText('Classic three-path');
  await expect(definition).toBeFocused();
  await definition.press('m');
  await definition.press('Enter');
  await expect(definition).toContainText('Merge unit family');
  await expect(page.getByLabel('Complete request JSON')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Research only' })).toHaveCount(0);
  await expect(page.getByLabel('Subject', { exact: true })).toHaveCount(0);
  await definition.click();
  await page.getByRole('heading', { name: 'Unit Lab', exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await definition.focus();
  await definition.press('Home');
  await definition.press('Enter');
  await expect(page.getByLabel('Subject', { exact: true })).toBeVisible();
  await definition.press('End');
  await definition.press('Enter');
  await expect(definition).toContainText('Tower defense');
  await definition.click();
  await definition.press('Tab');
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('mobile generation brings the output into view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await chooseDemo(page);
  await page.getByLabel('Subject', { exact: true }).fill('Clockwork heron');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  const output = page.getByRole('heading', { name: 'Unit output', exact: true });
  await expect(output).toBeFocused();
  await expect(output).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 320, height: 844 });
  for (const name of ['Design', 'JSON', 'Checks', 'Research']) {
    await page
      .getByRole('button', {
        name: name === 'Research' ? /^Research/ : name,
        exact: name !== 'Research'
      })
      .click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  }
});

test('composer shortcut generates and result views keep edits intact', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await chooseDemo(page);
  await page.getByLabel('Subject', { exact: true }).fill('Lantern keeper');
  await page.getByLabel('Adaptation notes', { exact: false }).fill('Support nearby allies.');
  await page.getByLabel('Adaptation notes', { exact: false }).press('Control+Enter');
  await expect(page.getByTestId('acceptance')).toHaveText('Checks passed · review required');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const editor = page.getByLabel('Content JSON', { exact: true });
  const unit = JSON.parse(await editor.inputValue());
  unit.name = 'Edited keeper';
  await editor.fill(JSON.stringify(unit));
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edited keeper', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Checks', exact: true }).click();
  await expect(page.getByText('Edited content needs validation.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await expect(editor).toHaveValue(JSON.stringify(unit));
  await page.getByRole('button', { name: 'Check changes', exact: true }).click();
  await expect(page.getByTestId('acceptance')).toHaveText('Checks passed · review required');
});

function configuredURL(baseURL: string) {
  const url = new URL(baseURL);
  url.port = String(Number(url.port) + 2);
  return url.origin;
}

test('a fresh unconfigured session starts with Default and explains setup without running a demo', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Generation quality' })).toContainText('Default');
  await page.getByLabel('Subject', { exact: true }).fill('Unconfigured sentinel');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Connect a model');
  await expect(page.getByText('UNIT_DEFAULT_MODEL=gpt-5.6-luna', { exact: false })).toBeVisible();
  await expect(page.getByTestId('acceptance')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByTestId('acceptance')).toHaveText('Checks passed · review required');
  await expect(page.getByText(/Synthetic demo/)).toBeVisible();
});

for (const mode of ['Default', 'Quality']) {
  test(`${mode} travels through the real HTTP adapter to a synthetic local model`, async ({
    page,
    request,
    baseURL
  }) => {
    await page.goto(configuredURL(baseURL!));
    await page.getByRole('combobox', { name: 'Generation quality' }).click();
    await page.getByRole('option', { name: mode, exact: true }).click();
    await page.getByLabel('Subject', { exact: true }).fill(`${mode} transport sentinel`);
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByTestId('acceptance')).toHaveText('Checks passed · review required');
    const endpoint = new URL(baseURL!);
    endpoint.port = String(Number(endpoint.port) + 1);
    const calls = await (await request.get(`${endpoint.origin}/requests`)).json();
    expect(calls).toContainEqual({
      subject: `${mode} transport sentinel`,
      model: mode === 'Default' ? 'gpt-5.6-luna' : 'gpt-6-astra',
      reasoningEffort: mode === 'Default' ? 'high' : 'low'
    });
  });
}

test('supplied-source character saves an unreviewed draft and checks exact edits with retained evidence', async ({
  page,
  baseURL
}) => {
  await page.goto(configuredURL(baseURL!));
  await page.getByRole('combobox', { name: 'Subject type' }).click();
  await page.getByRole('option', { name: 'Existing character', exact: true }).click();
  await page.getByLabel('Subject', { exact: true }).fill('Sourced sentinel');
  await page.getByRole('button', { name: 'Sources & continuity', exact: true }).click();
  await page.getByLabel('Continuity or story period').fill('Test story, chapter one');
  await page
    .getByLabel('Source material', { exact: true })
    .fill('Sourced sentinel guards the village with precise bolts.');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByTestId('acceptance')).toHaveText('Checks passed · review required');
  await page.getByRole('button', { name: /^Research/ }).click();
  await expect(page.getByRole('heading', { name: 'Source review completed' })).toBeVisible();
  await expect(page.getByText('Test story, chapter one', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Source reference: Supplied source material', { exact: true })
  ).toBeVisible();
  const researchDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export research', exact: true }).click();
  const research = await downloadedJson(await researchDownload);
  expect(research.grounding).toBe('grounded');
  expect(research.sources[0].content).toBe(
    'Sourced sentinel guards the village with precise bolts.'
  );
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const editor = page.getByLabel('Content JSON');
  const candidate = JSON.parse(await editor.inputValue());
  await editor.fill('{invalid json');
  await page.getByRole('button', { name: 'Check changes', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  candidate.name = 'Edited sourced sentinel';
  await editor.fill(JSON.stringify(candidate));
  await chooseDemo(page);
  await page.getByRole('button', { name: 'Check changes', exact: true }).click();
  await expect(page.getByTestId('acceptance')).toHaveText('Valid draft · source review needed');
  await page.getByRole('button', { name: /^Research/ }).click();
  await expect(
    page.getByText('Edited content needs a new source review.', { exact: false })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Source review completed' })).toHaveCount(0);
  const draftDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export draft', exact: true }).click();
  const draftFile = await draftDownload;
  expect(draftFile.suggestedFilename()).toBe('unit-draft.json');
  const draft = await downloadedJson(draftFile);
  expect(draft.fidelity).toBeUndefined();
  expect(draft.sourceReviewRequired).toBe(true);
  expect(draft.status).toBe('success');
  expect(draft.output).toEqual(candidate);
  await page.getByRole('combobox', { name: 'Generation quality' }).click();
  await page.getByRole('option', { name: 'Quality', exact: true }).click();
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await page.getByRole('button', { name: 'Check changes', exact: true }).click();
  await expect(page.getByTestId('acceptance')).toHaveText('Checks passed · review required');
  await expect(editor).toHaveValue(JSON.stringify(candidate));
  await page.getByRole('button', { name: /^Research/ }).click();
  await expect(page.getByRole('heading', { name: 'Source review completed' })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('edited-character-review.png'),
    fullPage: true,
    animations: 'disabled'
  });
  const resultDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export result', exact: true }).click();
  const result = await downloadedJson(await resultDownload);
  expect(result.output).toEqual(candidate);
  expect(result.edited).toBe(true);
  expect(result.sourceReviewRequired).toBe(false);
  expect(result.sourceReview.status).toBe('success');
  expect(result.sourceReview.candidateSha256).toBe(
    createHash('sha256').update(JSON.stringify(candidate)).digest('hex')
  );
  expect(result.sourceReview.metadata.repairs).toBe(0);
  expect(
    result.sourceReview.metadata.calls.every(
      (call: { model: string }) => call.model === 'gpt-6-astra'
    )
  ).toBe(true);
});

test('model failure and missing character evidence are actionable and retain an exportable run', async ({
  page,
  baseURL
}) => {
  await page.goto(configuredURL(baseURL!));
  await page.getByLabel('Subject', { exact: true }).fill('Failing transport');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('503');
  await expect(page.getByTestId('acceptance')).toHaveText('No unit produced');
  await expect(page.getByText('No editable unit was produced.', { exact: false })).toBeVisible();
  await page.getByRole('combobox', { name: 'Subject type' }).click();
  await page.getByRole('option', { name: 'Existing character', exact: true }).click();
  await page.getByLabel('Subject', { exact: true }).fill('Character without evidence');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/source|research/i);
  await expect(page.getByRole('button', { name: 'Export result', exact: true })).toBeVisible();
});

test('invalid mode and provider receive a specific configuration response', async ({
  request,
  baseURL
}) => {
  for (const choice of [{ mode: 'unknown' }, { provider: 'unknown' }, { mode: 'default' }]) {
    const response = await request.post('/api/run', {
      headers: { origin: baseURL! },
      data: {
        operation: 'generate',
        definition: 'classic-three-path',
        input: { subject: 'Sentinel', kind: 'original' },
        ...choice
      }
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).message).toMatch(/Choose|unavailable|Configure/);
  }
});

test('dark and light source forms fit desktop, mobile and large screens', async ({
  page,
  baseURL
}) => {
  await page.goto(configuredURL(baseURL!));
  await page.getByRole('combobox', { name: 'Subject type' }).click();
  await page.getByRole('option', { name: 'Existing character', exact: true }).click();
  await page.getByRole('button', { name: 'Sources & continuity', exact: true }).click();
  for (const theme of ['dark', 'light']) {
    if (theme === 'light')
      await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
    for (const width of [320, 390, 1280, 2560]) {
      await page.setViewportSize({ width, height: width > 2000 ? 1440 : 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      await expect(page.getByLabel('Source material', { exact: true })).toBeVisible();
      await page.screenshot({
        path: test.info().outputPath(`source-form-${theme}-${width}.png`),
        fullPage: true,
        animations: 'disabled'
      });
    }
  }
});

test('invalid server configuration keeps setup and the explicit demo usable', async ({
  page,
  baseURL
}) => {
  const url = new URL(baseURL!);
  url.port = String(Number(url.port) + 3);
  await page.goto(url.origin);
  await expect(
    page.getByText('UNIT_PROVIDER names an unconfigured provider.', { exact: false })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  await page.getByLabel('Subject', { exact: true }).fill('Setup recovery sentinel');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByTestId('acceptance')).toHaveText('Checks passed · review required');
});
