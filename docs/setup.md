# Local setup

Install Node.js 24 or newer, pnpm 10.18.3 and git. Unit Generator uses the public Foundation source checkout beside it. Mardwerk packages link to local source; setup does not require them to be published to npm.

For a fresh checkout:

```bash
git clone https://github.com/mardwerk/unit-generator.git
cd unit-generator
node scripts/setup.mjs
pnpm dev
```

Open the local URL printed by Vite, usually `http://127.0.0.1:5173`. Follow [Create your first unit](getting-started.md) to connect a model or try the explicit synthetic demo.

The setup script fetches a missing sibling `foundation` directory at the revision in `foundation-revision.json`, installs frozen dependencies and builds both projects. It needs network access for git and package installation. It leaves existing Foundation source untouched. An existing checkout must be clean and match the pinned revision; otherwise setup explains the mismatch and stops.

For development with your own existing sibling Foundation checkout:

```bash
node scripts/setup.mjs --local-foundation
pnpm dev
```

This explicitly builds the local Foundation revision, including your edits. It does not reset, pull, clean or switch that checkout. Rebuild the affected Foundation package after changing its source. Rebuild Unit Generator packages with `pnpm build:packages` after changing library code, then restart the web app if needed.

## Run the built app or CLI

Setup builds the web app and CLI. Start the local built app with:

```bash
node apps/cli/dist/index.js playground
```

The CLI also supports generation without opening a browser:

```bash
node apps/cli/dist/index.js generate 'Clockwork heron' --original --provider fixture
```

That command returns an explicit synthetic fixture. Configure a model for creative generation as described in [provider configuration](providers.md). `.env` belongs in the repository root. The local CLI and web app load it; library callers supply their own environment.

The browser app accepts localhost requests only. It has no account, database or saved runs. Export results before refreshing or closing the tab.

## Verify changes

```bash
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

Browser tests use synthetic fixtures and local fixture transports. They do not call paid models. Linux systems may need Playwright's system dependencies; follow the browser installation command's instructions if Chromium cannot launch.
