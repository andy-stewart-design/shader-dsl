# Step 1.2 — Manual real-preview PNG probe

- Added `captureCanvas` with a 4 MiB encoded PNG byte cap, 5-second encoding deadline, and explicit unavailable/taint/encoding/size errors. It does not change renderer/playback state. A tiny optional factory seam in `createPreview` leaves production defaults intact and lets the isolated probe exercise strict WebGPU or the existing WebGL fallback path.
- The probe uses the actual `compileShdrBody` and preview factory, draws before exporting, and shows live canvas/PNG side by side with reported backend and dimensions. It supports download and cleans up prior renderer/object URLs on selection changes; no debug globals, production routes, dependencies, or browser harness were added.
- Final scoped checks passed: `pnpm --filter repl-web check`, `lint`, `build:preview-probe`, and `build`. Build logs: `/tmp/agent-mcp-1.2-probe-build.log` and `/tmp/agent-mcp-1.2-app-build.log`. These checks establish types/lint/bundling, not actual backend availability or image correctness.
- **User-assisted manual gate passed:** after being asked to check strict WebGPU and forced WebGL, compare live preview/exported PNG, and try capture/download, the user reported: “Yep, that all seems to work.” This is user-reported target-browser success, not automated GPU verification; no exact browser version or hardware details were independently collected. Step 1.2's completion gate is satisfied on that basis.

The standalone build is `apps/repl-web/dist/preview-probe/`. No HTTPS deployment or hosted permission test was performed; that remains Step 1.3.
