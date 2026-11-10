# Agent Bridge Demo

A small React/Vite site that exercises the public browser side of `@shdr/agent-bridge`. It intentionally exposes only two application-owned, read-only tools:

- `demo_get_state` returns a static description of this page.
- `demo_capture_image` generates a distinctive purple-and-green PNG in the browser and returns it as an image result.

Pairing does not invoke either tool. There are no mutation, runtime-control, persistence, publish, or agent-harness APIs in this app.

## Local development

From the repository root, after the workspace bridge package has been built or is available to the workspace:

```sh
pnpm --filter agent-bridge-demo check
pnpm --filter agent-bridge-demo build
pnpm --filter agent-bridge-demo dev
```

`dev` serves the app at a Vite URL, normally `http://localhost:5173`. Explicitly configured HTTP origins are allowed only for `localhost` and `127.0.0.1` so we can iterate manually without TLS setup. A local test is not evidence of hosted HTTPS/browser permission behavior.

### Quick manual check with Pi

From the repository root:

```sh
pnpm --filter @shdr/agent-bridge build
pnpm --filter agent-bridge-demo dev --port 5173 --strictPort
```

In another terminal, register the helper (this intentionally updates project Pi configuration):

```sh
pi mcp add -l agent-bridge -- node "$PWD/packages/agent-bridge/dist/bin.mjs" \
  --allowed-origin http://localhost:5173 \
  --site-url http://localhost:5173/
```

Start Pi, or run `/reload` in the existing session. Ask it to get the bridge connection information. Open its pairing link, then ask it to list the site's tools, read the demo state, and call `demo_capture_image`. It should see a purple-and-green image. Try disconnecting and pairing again. Report what breaks; no automated browser harness is required for this check.

## Pairing and hosted setup

Start the bridge helper through its normal MCP configuration and request its connection information. Paste the returned pairing link into the page, or navigate to the link directly. The page consumes the `bridgePort`/`bridgeToken` fragment before React renders, removes it from the address bar/history, and keeps the link only in memory for the initial connection attempt. It is never written to storage or logged.

For a real hosted check, serve the built `dist` directory from an approved HTTPS origin and configure the helper with that exact origin and site URL, for example:

```sh
shdr-agent-bridge --allowed-origin https://demo.example.test --site-url https://demo.example.test/
```

Use the actual operator-approved origin in place of the example. Use an explicit localhost configuration only for local manual testing; do not silently replace a hosted configuration or treat localhost success as deployed-site proof. Hosting, CSP `connect-src`, Local Network Access permission behavior, and model/client image inspection are deployment checks; this app does not configure or deploy them.

## UI notes

The connection badge shows disconnected, connecting, connected, or an error state. A connected session displays its opaque session ID and catalog version, and can be explicitly disconnected. Pairing links are entered into a password-style field and cleared after every connection attempt.
