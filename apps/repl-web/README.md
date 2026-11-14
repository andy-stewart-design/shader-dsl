Welcome to your new TanStack Start app!

# Getting Started

## Manual preview/capture probe

Run the standalone Vite probe (fixed at <http://localhost:5174/>):

```bash
pnpm --filter repl-web dev:preview-probe
```

It uses the actual compiler, preview runtime, and `captureCanvas` primitive (the standalone probe keeps native export unless a bound is passed). Choose **Auto**, **WebGPU (strict)**, or **WebGL (forced fixture)**, then use **Capture PNG** or the download link. A standalone build is written to `apps/repl-web/dist/preview-probe/`:

```bash
pnpm --filter repl-web build:preview-probe
```

## Manual authoring transaction probe

Run the small real-CodeMirror controller probe at <http://localhost:5175/>:

```bash
pnpm --filter repl-web dev:authoring-probe
```

Click **Apply sample agent edit** and confirm both visible documents change together and the revision advances once. **Undo main** and **Redo main** should change the visible main editor and the draft snapshot consistently. **Try stale conflict** first makes a visible manual-style edit, then rejects the stale controller request without another change. **Unmount utils** makes a source update requiring Utils reject without changing Main; **Mount utils** restores the port. The production editor component uses the same `EditorHandle`, adapter, and registry wiring; this probe adds no MCP or debug global. Build it independently with:

```bash
pnpm --filter repl-web build:authoring-probe
```

From the monorepo root, install dependencies and run this application:

```bash
pnpm install
pnpm --filter repl-web dev
```

## Agent authoring connection

The page exposes `get_authoring_context`, `get_sketch`, `update_sketch`, `apply_sketch`, and `capture_preview` when the production Apply/preview controller is wired; renderer-unready calls return a structured failure. Pairing and reads do not edit the draft; updates use the production CodeMirror authoring controller and revision checks. `apply_sketch` requires the expected draft revision, then awaits compile, renderer installation, and the renderer's confirmed first `draw()` completion. Its structured result distinguishes source/uniform diagnostics, backend/install/draw failures, cancellation, stale revisions, and superseded attempts; applied identity is returned only after that frame. `get_sketch` and context report draft/applied divergence honestly. `capture_preview` requires `expectedAppliedRevision` and returns an actual PNG image block plus JSON metadata. By default it downsamples to at most 512 pixels on the longest edge (preserving aspect ratio and never upscaling); pass `maxDimension: "native"` for explicit full-resolution capture, or an integer from 64 through 2048 for another bound. Metadata keeps native `identity.width`/`identity.height` and `canvasWidth`/`canvasHeight` separate from encoded PNG `width`/`height`. It captures only the registered live WebGL/WebGPU canvas and rejects readiness, resize/replacement, identity, encoding, size, cancellation, and deadline failures; the default PNG and request limits are 4 MiB decoded bytes and 5 seconds. Native captures remain bounded by the pixel/byte limits. Capture never applies a draft or changes playback/uniform controls. Run remains the explicit human apply action (Option/Alt+Return) and uses the same pipeline, while the connection panel remains in the upper-right of the REPL.

Brief manual journey: pair at the approved deployed URL, call `get_sketch`, make a visually distinctive `update_sketch`, call `apply_sketch`, then call `capture_preview` with the returned applied revision and inspect the image. If the draft is edited without Apply, capture metadata retains the confirmed applied revision and marks draft divergence. A failed or stale capture returns a categorized error and never returns old pixels; reread `get_sketch` before retrying.

For the approved deployed REPL, use the existing Nitro/Vercel deployment workflow (this is a server-rendered Nitro app; do not deploy a guessed static `dist` directory). In Pi, from the repository root, register the local helper with the deployed origin:

```bash
pi mcp add -l agent-bridge -- node "$PWD/packages/agent-bridge/dist/bin.mjs" --allowed-origin https://shdr-repl.vercel.app --site-url https://shdr-repl.vercel.app/
```

Pi's registration is cwd-local in `.pi/mcp.json`; it does not search a parent directory. After registration, run `/reload`, then request a fresh pairing link and open the approved deployed URL. For a local manual check, configure the helper's allowed origin explicitly as `http://localhost:3000` instead; this README does not modify Pi configuration.

The deployed response headers must allow the bridge WebSocket connection to the local helper (the effective CSP needs `connect-src ws://127.0.0.1:*`, alongside the site's existing sources). Apply that as an approved host/header change in the deployment workflow; do not add a blanket production host exception. The initial pairing fragment is removed before the app renders and is not copied to app state, URL history, logs, telemetry, or durable storage. The bridge may retain only its own scoped same-origin reload/history resume credential in `sessionStorage`.

# Building For Production

To build this application for production:

```bash
pnpm --filter repl-web build
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

### Removing Tailwind CSS

If you prefer not to use Tailwind CSS:

1. Remove the demo pages in `src/routes/demo/`
2. Replace the Tailwind import in `src/styles.css` with your own styles
3. Remove `tailwindcss()` from the plugins array in `vite.config.ts`
4. Remove `@tailwindcss/vite` and `tailwindcss` from `package.json`

## Linting & Formatting

This project uses the shared ESLint configuration for linting and TypeScript for type checking. Formatting is handled by the root Prettier configuration:

```bash
pnpm --filter repl-web lint
pnpm --filter repl-web check
# from the repository root
pnpm format --write
```

## Tests

Run the package's native Node test suite, including all `src/**/*.test.ts` tests:

```bash
pnpm --filter repl-web test
```

## Deploy with Nitro

This project uses Nitro as a generic server adapter, so it can run on any Node-compatible host.

```bash
npm run build
node dist/server/index.mjs
```

The build output is a self-contained Node server. To deploy, push the `dist/` directory to your host (Render, Fly.io, your own VPS, etc.) and run the server command above.

For host-specific presets (Vercel, Netlify, Cloudflare, AWS Lambda, etc.) and tuning, see https://v3.nitro.build/deploy.

## Routing

This project uses [TanStack Router](https://tanstack.com/router) with file-based routing. Routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from "@tanstack/react-router";
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you render `{children}` in the `shellComponent`.

Here is an example layout that includes a header:

```tsx
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "My App" },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  ),
});
```

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Server Functions

TanStack Start provides server functions that allow you to write server-side code that seamlessly integrates with your client components.

```tsx
import { createServerFn } from "@tanstack/react-start";

const getServerTime = createServerFn({
  method: "GET",
}).handler(async () => {
  return new Date().toISOString();
});

// Use in a component
function MyComponent() {
  const [time, setTime] = useState("");

  useEffect(() => {
    getServerTime().then(setTime);
  }, []);

  return <div>Server time: {time}</div>;
}
```

## API Routes

You can create API routes by using the `server` property in your route definitions:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

export const Route = createFileRoute("/api/hello")({
  server: {
    handlers: {
      GET: () => json({ message: "Hello, World!" }),
    },
  },
});
```

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/people")({
  loader: async () => {
    const response = await fetch("https://swapi.dev/api/people");
    return response.json();
  },
  component: PeopleComponent,
});

function PeopleComponent() {
  const data = Route.useLoaderData();
  return (
    <ul>
      {data.results.map((person) => (
        <li key={person.name}>{person.name}</li>
      ))}
    </ul>
  );
}
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).

# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

For TanStack Start specific documentation, visit [TanStack Start](https://tanstack.com/start).
