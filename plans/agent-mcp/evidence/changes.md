# Plan changes

## Standalone Phase 1 demo app

User direction: “Let's plan on doing a simple, standalone vite app. Can we spin that up as part of phase 1?” The plan carries this direction forward by including a small standalone Vite demo app in Phase 1 and reusing it later for generic bridge conformance, rather than maintaining package-local connection/conformance fixtures.

The user approved planning a standalone app in Phase 1. Naming and implementation defaults are `apps/agent-bridge-demo` (package name `agent-bridge-demo`), minimal vanilla TypeScript Vite, and the `@shdr/agent-bridge/browser` public entrypoint; these details are not separately interviewed product decisions. Step 1.1 now plans its scaffold with initial read and generated-image tools and `dev`/`check`/`build`/`preview` scripts; Step 2.3 adds a simple mutation and makes the app's `test:browser` the conformance/browser harness. Generic helper unit/transport/result tests remain package-local and app-independent. The separate real-REPL renderer capture probe in Step 1.2 is unchanged.

Affected plan surfaces: the Step 1.1 and 2.3 expected-file lists, proposed command table, verification commands, Phase 1/2 gates, hosted demo-app checks in Step 1.3, and AC3/final evidence wording. The obsolete package `build:fixtures`, package fixture paths, and package browser-fixture harness were removed; app `check`/`build` and app `test:browser` are used instead. Hosting/deployment of the built app remains subject to explicit user/site-operator approval, and no actual HTTPS URL has been supplied.

This initial note records approval to change the plan only; execution was authorized later as described below. It did not itself authorize deployment, publishing, or commits.

## React scaffold and manual-first Step 1.1

The user supplied a React Vite scaffold and answered “yes” when asked whether to keep React and update the vanilla-TypeScript plan detail. The browser library remains framework-independent; only the demo uses React. The user then authorized finishing repo integration and open Step 1.1 implementation.

During execution the user clarified: “I am here to help with manual testing” and “We need to speed this up and we need to keep this quick and dirty.” Step 1.1 now retains its existing small smoke suite and uses a short user-assisted pairing/read/image/disconnect check rather than expanding automated browser/security coverage. Broader contract/lifecycle cases remain in Phase 2; no hosted or production acceptance is waived. Implementation tasks may be checked while the manual completion gate remains open.

For practical local iteration, the implementation accepts explicitly configured HTTP origins only for `localhost`/`127.0.0.1`, retaining exact-origin and token checks. This is a development aid selected for the manual-first workflow, not a claim that the user separately approved an insecure public deployment; all other origins still require HTTPS, and the deployed HTTPS gate is unchanged.
