# Step 3.2 evidence

Date: 2026-10-14

## Automated verification

- `pnpm build` passed before the REPL browser run.
- `pnpm --filter repl check` passed (`tsc -b`, `oxlint`).
- `pnpm --filter repl build` passed (`vite build`, bundle boundary audit).
- `pnpm --filter repl test` passed (`verify-browser.mjs`).
- The browser suite uses a Playwright-controlled HTTPS origin (`https://repl-texture.test`) and a deterministic 2×1 PNG. The success response includes `Access-Control-Allow-Origin: *`; the denied response supplies a mismatched origin and produces real browser CORS errors.
- The accepted literal HTTPS texture was fetched independently by WebGL and WebGPU, sampled pixels matched the red top-left texel, and no authored `.shdr.ts` request occurred.
- A denied CORS replacement reported backend resource errors while both previews preserved their previous pixels.
- Root-relative URLs produced a REPL policy error before fetch. HTTP and protocol-relative URLs produced source diagnostics before fetch. A dynamic URL expression produced a literal-URL diagnostic before fetch.

## Scope

The REPL policy is local to `apps/repl`; core and Vite continue to support their own URL policies. The REPL has no picker, source-module loader, or multi-file import fetcher.
