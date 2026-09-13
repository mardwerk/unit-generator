# Local playground deployment

The old API/worker/queue/volume deployment is retired. Build the repository, then run:

```bash
node apps/cli/dist/index.js playground --port 5173
```

The launcher binds to `127.0.0.1`, sets the matching origin, and keeps credentials on the server. Use the CLI or library without launching the playground when embedding the generator elsewhere.

The playground checks local hostnames and same-origin POST requests. Do not expose it as an authenticated hosted service. A future platform should call the library under its own authentication, tool policies and retention rules. The UI only selects configured providers and definitions; it cannot supply executable paths.

An optional `deployment/Containerfile` builds from the parent directory containing both public checkouts:

```bash
podman build -f unit-generator/deployment/Containerfile -t mardwerk-unit-playground .
podman run --rm -p 127.0.0.1:5173:5173 --env-file unit-generator/.env mardwerk-unit-playground
```

The container runs one Svelte server with no application data volume. Supply any credential file explicitly as a read-only mount, or inject a key through the environment. The image does not copy `.env` or user data. The default browser origin is `http://127.0.0.1:5173`.

Development uses `pnpm dev`. Vite reads the repository `.env` through its configured environment directory. Built-server use should inject environment values or use the CLI launcher, which reads the repository `.env`.

Generation request bodies are bounded to 4 MiB. Checking an edited result accepts up to 40 MiB because the request includes retained evidence and the edited Candidate. Streamed output is bounded to 64 MiB and queued output to 40 MiB. The CLI, container and browser-test launcher use `apps/web/start.mjs` to apply the matching server body ceiling. A slow/disconnected reader aborts its request. Responses use `Cache-Control: no-store`. Nothing is saved server-side, so reconnection starts a new invocation. Export data you want to retain.
