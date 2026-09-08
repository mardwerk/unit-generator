import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

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

test('one process generates, invalidates edits, exports, and forgets on refresh', async ({
  page
}) => {
  await page.goto('/');
  await page.getByLabel('Subject', { exact: true }).fill('Clockwork heron');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByTestId('acceptance')).toHaveText('Checks passed');
  await page.getByRole('button', { name: /^Research/ }).click();
  await expect(page.getByRole('button', { name: 'Export research' })).toBeVisible();
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('playground-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath('playground-mobile.png'), fullPage: true });
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
  expect((await download).suggestedFilename()).toBe('unit-candidate.json');
  await page.getByRole('button', { name: 'Validate edit' }).click();
  await expect(page.getByTestId('acceptance')).toHaveText('Candidate failed');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await page.reload();
  await expect(page.getByTestId('acceptance')).toHaveCount(0);
  await expect(page.getByLabel('Subject', { exact: true })).toHaveValue('');
});

test('a structurally different family uses the same page and stream', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Advanced', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Generation definition' }).click();
  await page.getByRole('option', { name: 'Merge unit family' }).click();
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByTestId('acceptance')).toHaveText('Checks passed');
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
  await page.goto('/');
  await page.getByLabel('Subject', { exact: true }).fill('Original sentinel');
  await page.getByText('Advanced', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Model connection' }).click();
  await page
    .getByRole('option')
    .filter({ hasText: /command/i })
    .click();
  await page
    .getByLabel('Source material', { exact: true })
    .fill('A sentinel who protects nearby allies.');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect.poll(alive).toBe(true);
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
  await page.getByRole('heading', { name: 'Unit playground', exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await definition.focus();
  await definition.press('Home');
  await definition.press('Enter');
  await expect(page.getByLabel('Subject', { exact: true })).toBeVisible();
  await definition.press('End');
  await definition.press('Enter');
  await expect(definition).toContainText('Merge unit family');
  await definition.click();
  await definition.press('Tab');
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('mobile generation brings the output into view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
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
  await page.getByLabel('Subject', { exact: true }).fill('Lantern keeper');
  await page.getByLabel('Adaptation notes', { exact: false }).fill('Support nearby allies.');
  await page.getByLabel('Adaptation notes', { exact: false }).press('Control+Enter');
  await expect(page.getByTestId('acceptance')).toHaveText('Checks passed');
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
  await page.getByRole('button', { name: 'Validate edit', exact: true }).click();
  await expect(page.getByTestId('acceptance')).toHaveText('Checks passed');
});
