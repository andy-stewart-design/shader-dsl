# Agent Bridge Demo

A small React/Vite site that exercises the public browser side of `@shdr/agent-bridge`. It intentionally exposes only three application-owned tools:

- `demo_get_state` reads the current visible page-local message and revision.
- `demo_set_message` sets a bounded nonempty message and returns the new revision. Its optional `delayMs` (0–10000) exists only to manually interrupt a pending call.
- `demo_capture_image` generates a distinctive purple-and-green PNG in the browser and returns it as an image result.

The message is ordinary page-local React/store state. It is not written to `localStorage` or `sessionStorage`; a refresh may reset it normally. The bridge's own `sessionStorage` resume credential is separate connection state, not an app-state persistence or resume feature. Pairing does not invoke a tool, reconnect does not replay a mutation, and there are no task, approval, runtime-control, publish, or agent-harness APIs in this app.

## Local development

From the repository root, build the browser package and check/build the demo:

```sh
pnpm --filter @shdr/agent-bridge build
pnpm --filter agent-bridge-demo check
pnpm --filter agent-bridge-demo lint
pnpm --filter agent-bridge-demo build
pnpm --filter agent-bridge-demo dev --port 5173 --strictPort
```

`dev` serves the app at `http://localhost:5173`. Explicitly configured HTTP origins are allowed only for `localhost` and `127.0.0.1`; localhost success is not hosted HTTPS/browser-permission proof.

## Manual conformance recipe

1. Start the helper through the normal MCP configuration for the exact page origin and ask it for bridge connection information.
2. Open the pairing link, then ask it to list tools and call `demo_get_state`. Confirm the visible message and revision match.
3. Call `demo_set_message` with `{ "message": "manual check" }`. Read state again and confirm the page changed and the revision increased.
4. Call `demo_capture_image` and confirm the model receives the distinctive purple/green image.
5. Refresh the same URL while the helper is still running. The tab may automatically resume using the bridge's scoped connection credential; rediscover tools and reread state. The app message may reset because it is intentionally not persisted.
6. Explicitly disconnect, refresh, and confirm the page stays unpaired. Restarting/cold-reloading the helper invalidates the old token and requires a fresh pairing link; reload/restart the Pi helper session as needed, then pair again.
7. For interrupted-call behavior, call `demo_set_message` with `{ "message": "must not land", "delayMs": 10000 }`, then immediately refresh or disconnect. Treat the old result as uncertain, reread after reconnect, and confirm the old message was not replayed.

## Hosted deployment (user action)

The approved hosted origin is `https://agent-bridge-demo-mu.vercel.app/`. Deployment remains the user's action. From the repository root, after building, deploy the existing `agent-bridge-demo` Vercel project (not a new preview project):

```sh
pnpm --filter @shdr/agent-bridge build
pnpm --filter agent-bridge-demo build
vercel --cwd apps/agent-bridge-demo/dist --archive=tgz --prod
```

Choose the existing `agent-bridge-demo` project if Vercel asks. A Vite deployment may replace `dist/.vercel` linking metadata, so verify the selected project and keep the approved origin stable. Do not use a new preview domain unless the helper's allowed origin is updated by its operator. Configure the helper with the exact hosted origin and site URL, for example:

```sh
shdr-agent-bridge --allowed-origin https://agent-bridge-demo-mu.vercel.app --site-url https://agent-bridge-demo-mu.vercel.app/
```

After deploying, restart the Pi helper or run `/reload` in the existing Pi session so it uses the fresh configuration. Ask for bridge connection information again, open the new pairing link, and pair again; helper restart/cold config reload invalidates the old token. Browser refreshes thereafter may resume automatically while that helper remains running.

## UI notes

The connection badge shows disconnected, connecting, connected, or an error state. The page displays the current message, revision, and latest mutation result. A connected session displays its opaque session ID and catalog version, and can be explicitly disconnected. Pairing links are entered into a password-style field and cleared after every connection attempt. The image tool remains visually distinct from the mutable message state.
