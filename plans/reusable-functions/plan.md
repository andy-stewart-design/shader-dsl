# Reusable shader functions implementation plan

## Status and governing source

- Governing spec: [spec.md](spec.md).
- Delivery state: **Phase 0 complete (read-only contract/feasibility review)**. Step 0.1 is Complete; Phases 1–4 are Pending. No production implementation, baseline test run, or GPU/editor acceptance has been performed.
- Acceptance or release still pending: all AC1–AC9, real GLSL ES 3.00/WebGL 2 and **presented WebGPU** acceptance, and one feature-complete review/PR. Writing this plan does not authorize a PR or merge.
- Blockers: none identified by the Phase 0 inspection. The decision record below locks the common project/alias-resolution contract; its implementation still needs the later automated parity gates. If CLI/Vite/editor cannot honor it, stop and resolve that conflict against the governing spec; do not silently substitute a Vite-only alias.

Step statuses below are the authoritative execution record. A phase is complete only when its step gates **and** exit gate pass. Do not record a build or mocked check as real browser/editor acceptance.

## Execution constraints

- Paths are relative to repository root. Preserve existing unrelated work, including any in-progress moves under `plans/`; expected files are scope estimates, not permission to edit unrelated files.
- Current inspection only (no executed baseline): `packages/core/src/compile-fragment-artifact.ts` and `parse-shader-file.ts` accept a single fragment source; `packages/vite/src/index.ts` replaces a `.shdr.ts` module with a default artifact; `packages/cli/src/check.ts` checks discovered sources individually; TypeScript 7 currently maps a single callback's shader expressions. The REPL has one textarea. All compiler/tool changes need paired test and compatibility coverage.
- Core and the opt-in browser compiler must remain environment-neutral: **never evaluate authored imports, invoke helper/`defineUniforms` callbacks, read disk implicitly, or add Node/project dependencies to browser core**. Only hosts load files. Maintain fragment-only inputs, target-neutral f32 grouping, unchanged artifact schema/bindings and source diagnostic positions for existing shaders.
- No phase can claim a new authored form fully supported while any required target or diagnostic route is missing. Where adjacent steps jointly introduce a public form, treat them as an atomic merge/revert group and keep the current supported shaders usable at intermediate review points.
- Commands below assume workspace dependencies already installed. Targeted `test/reusable-*.test.ts` files and new browser fixtures are **proposed additions**, not currently runnable. Real GPU checks require a working Playwright Chromium/WebGPU adapter; real editor acceptance requires the VS Code executable used by `apps/editor-fixture/run-editor-test.mjs` (or `VSCODE_EXECUTABLE_PATH`). Record environment failures as Blocked, not Verified.

## Phase overview and delivery boundary

| Phase | Outcome                                                                                       | Dependencies   | Exit gate                                                                                |
| ----- | --------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| 0     | Baseline and project-resolution/diagnostic decision lock                                      | Governing spec | Written contracts and identified seams; no production change                             |
| 1     | Same-file typed functions compile to both targets and work in the TypeScript 7 editor         | Phase 0        | Local helper + builtin-domain/invalid-shape cases pass in core and editor                |
| 2     | Core virtual module graph, imported uniforms, and project-backed CLI paths                    | Phase 1        | Cross-file artifacts/diagnostics and CLI graph cases agree; old single-source API intact |
| 3     | Vite static/development, project editor/LSP, and single-textarea REPL compose with that graph | Phase 2        | Consumer-specific positive/negative and invalidation checks pass                         |
| 4     | Real GPU/browser parity, shared-uniform isolation, documentation, and final acceptance        | Phase 3        | All AC1–AC9 gates plus full regression review                                            |

Delivery boundary: **one feature-complete PR after Phase 4**; these phases are reviewable increments, not permission to merge partial public behavior. Atomic groups: Steps 1.1–1.2 for local helper compiler/editor parity, and Steps 2.1–3.2 for publicly reusable cross-file imports across core, CLI, Vite and editor. Do not land or revert only one member of an atomic group with consumers depending on it.

## Phase 0 — Contract and feasibility baseline

Outcome: select a testable, consistent multi-host resolution contract without changing app behavior.
Depends on: governing spec.
Review boundary: only existing source/test inspection and an execution note in this plan; do not build a resolver or run GPU/editor suites here.

### Step 0.1 — Lock paths, module shape, and attribution seam

Status: Complete — source/test inspection and written contract only; no behavior acceptance claimed.
Requirements / acceptance: R3, R5–R7, R9; informs AC2, AC4, AC5.
Depends on: None.
Review boundary: specification/feasibility only; no production change.

Expected files:

- `plans/reusable-functions/plan.md` — record the confirmed resolution/diagnostic decision and any required spec clarification (without silently weakening `spec.md`).
- `packages/core/src/parse-shader-file.ts`, `packages/core/src/diagnostics.ts`, `packages/lsp/src/project-discovery.ts`, `packages/language-service/src/typescript-7-editor-adapter.ts`, `packages/vite/src/index.ts`, `packages/cli/src/check.ts` — inspect only.

Tasks:

- [x] Trace the currently supported `shdr` import and same-file `defineUniforms` forms, public diagnostic shapes, and single-source core/browser API; record compatibility constraints.
- [x] Determine a shared rule for selected `tsconfig.json`, `paths`/relative imports, missing configs, canonical paths, duplicate imports and dependency cycles; identify how CLI, Vite and editor will supply files to core without using Vite-only resolution.
- [x] Inspect virtual-source project/hover mapping and Vite transformation/watch behavior for helper-only and mixed-export modules; note what needs atomic change.
- [x] Choose a representative three-file helper + imported-uniform fixture and a minimal invalid-cycle/missing-import case; confirm the assumed direct-export and one-schema syntax against the spec examples.

Verification:

- Automated: Not applicable; this is a read-only feasibility/decision gate, not behavior proof.
- Manual: Compare the recorded rules with the actual entry/config semantics in the cited files; ensure the same alias maps to the same file for each proposed host and a browser virtual map. Record any counterexample and stop the affected work until resolved.

Completion gate: project/alias resolution, file-identity/diagnostic attribution, and module-cycle rules are documented with no unaddressed conflict with R5. Evidence: Static inspection on 2026-10-08 at revision `796bb21`, followed by review corrections separating config selection from compilation eligibility and removing the unapproved dependency-root restriction (B.2–B.4 and D below). The initial gate conclusion preceded these corrections. No tests executed.

Phase exit gate: review the decision record before code changes; if the governing contract is infeasible, update it only after resolving that material conflict rather than implementing an alternative quietly. Evidence: Source/config/test comparison and the two resolution counterexamples reviewed against R5/R12; the corrected contract preserves config-independent compilation and cross-root relative imports. Implementation may begin with Phase 1 under these corrected rules. This is a feasibility gate, not proof of resolver, editor or target behavior.

#### Phase 0 decision record — 2026-10-08

Scope/evidence: repository was clean at inspection start, revision `796bb21`. Only this plan is changed. Existing source, tests, package manifests, fixture configs and installed TypeScript 7.0.2 API declarations were inspected; no baseline/build/test suite, authored callback, browser, or VS Code process was run. The fixtures below are design examples, not newly installed or passing tests. Documentation-only checks passed: `pnpm exec prettier --check plans/reusable-functions/plan.md` and `git diff --check`; live GPU/editor environment availability was not assessed.

##### A. Compatibility baseline and ownership seams

- `parse-shader-file.ts` parses TypeScript with Babel, recognizes one direct default fragment or the inline `defineUniforms(...).createFragmentShader(...)` chain, and requires one supported context pattern: `({ coord, uniforms })` or `({ uniforms })`. It currently rejects all `import type` from `shdr`, Shdr value aliases, namespace/default imports, and helper-only modules. Non-Shdr imports generally pass import scanning but do not create shader callables. Extend module recognition explicitly; do not turn ordinary imported JavaScript into shader values.
- Existing named schemas are a single same-file `const uniforms = defineUniforms(...)` before a direct fragment, selected by exactly the shorthand `{ uniforms }`. The parser does not currently unwrap exported schema declarations or resolve imported schemas, and even the named form currently requires a local `defineUniforms` import. Phase 2 must remove that last requirement for an imported definition, not require authors to add an unused marker import. `parse-custom-uniforms.ts` already reads literal AST defaults without invoking the builder; retain its field order, reserved names, finite-f32 validation and `-0` normalization.
- `lowerFragment(source)` and `compileFragmentArtifact(source)` use the default synthetic name `shader.shdr.ts`; the latter is exported only from the opt-in `@shdr/core/browser` entry, not the main core index today. Keep these string calls, existing success/failure discriminants, diagnostic codes/ranges, and artifact fields (`glsl`, `wgsl`, `defaults`, optional `custom`) unchanged. Graph types/APIs may be exported from the relevant core entries without making runtime import the compiler. A helper-only checking mode must be separate from the requirement that artifact compilation have a default fragment; never synthesize a dummy shader.
- `ShaderDiagnostic` is currently `{ code, message, range, severity }` without a file. Ranges and CLI/editor positions are UTF-16 offsets into original source (including CRLF/non-BMP cases). Graph failures need an additional owner identity; string-only failures must not gain an enumerable synthetic filename or lose their existing exact ranges. Use a file-aware graph diagnostic type extending the legacy shape, rather than altering artifact metadata to carry sources.
- `transform-shader-expressions.ts` rewrites only callback roots. `VirtualSource`, diagnostic routing and hover suppression each have one `shaderRegion`. Operator mappings already preserve identity-backed identifiers and suppress generated-only hover text; preserve that behavior while adding multiple disjoint helper/fragment regions per defining file. Do not use one bounding region that suppresses unrelated top-level TypeScript diagnostics.
- The TypeScript 7 checker already has an in-memory `readFile` overlay and project snapshots, but updates/checks one original/virtual file at a time. The editor adapter clears that overlay on a project-version change. Cross-file checks must populate all transformed dependency sources and all open authored overrides before taking a coherent checking snapshot; rebuilding a checker must replay unsaved sources, not fall back to stale disk text. Existing core-error filtering is fragment-specific and needs helper-aware ownership.
- `ProjectDiscovery` selects the nearest ancestor config whose **root files** include the entry, continues past valid excluding configs, stops on invalid configs, uses real paths, and never walks above the deepest containing workspace root or traverses project references to pick an entry project. Its tests encode these distinctions. LSP currently publishes all returned ranges against the requesting document and refreshes only that document on an unsaved edit; both must change for shared definitions. The VS Code fixture pins a config and watches only that config; it also needs dependency/unsaved-edit refresh, not just extra test fixtures.
- Vite's pre-transform currently replaces the entire module with `export default <JSON>;`, strips query/hash suffixes from IDs, and registers no dependency watches. Authored import edges disappear from the emitted module graph. `verify-dev.mjs` tests direct entry/default edits only. CLI currently discovers sorted shader files, does not follow discovery symlinks, and checks each source independently without a config; its temp-project tests deliberately support no-config shaders and fail without partial output on file-read errors.

##### B. Shared project and effective-alias contract

1. **Host boundary and package seam.** Extract/reuse the project-discovery semantics in a Node-only shared `@shdr/project` package (`packages/project/`) in Step 2.3. It owns config parsing, disk loading, realpath identity and effective alias preparation; CLI, Vite and editor/LSP consume it rather than copying resolvers or importing the LSP server. Use TypeScript **7** for project/config semantics, with a runtime dependency in this host package; do not load TypeScript 6 or add Node/TypeScript dependencies to core/browser. Core owns the pure specifier-to-file rule and graph traversal. The host loader uses that same rule to assemble explicit files, so it cannot select a different fallback candidate from the browser compiler.
2. **Config-search boundary, not dependency boundary.** Supply canonical config-search roots: CLI uses cwd and explicit directory roots (an explicit file outside those roots contributes its containing directory for config search only); Vite uses its resolved root; LSP uses its workspace folders. For overlapping roots use the deepest containing root, matching discovery today. These roots limit project selection, not the shader import graph. Resolve each relative `.shdr.ts` import against its importing file, including `../` paths and canonical symlink targets outside cwd, the entry directory, Vite root or editor workspace. Likewise, a selected config's supported `paths` target may be outside its search root. Load only explicitly reachable source dependencies; do not scan unrelated external directories. Config directory, `rootDir`, `include`/`exclude`, discovery ignores and discovery symlink exclusions are not dependency-access restrictions. Browser core remains limited to the caller's supplied files, so an omitted external dependency fails as missing, not as outside a root. Vite/editor hosts must watch and attribute external dependencies without requiring them to become standalone project entries. No implicit filesystem sandbox is added by V1.
3. **Entry selection for aliases/editor membership.** When effective aliases are needed, walk canonical entry ancestors up to the config-search root, choosing the nearest valid `tsconfig.json` whose parsed root-file list includes the entry. Continue past valid excluding configs; stop on invalid/unreadable configs, preserving that configuration failure for an alias diagnostic rather than searching past it. Do not pick an arbitrary Vite config, a sibling project or a referenced project from a solution config. An adapter explicitly given a project config must validate entry membership for editor availability rather than silently opening an inferred/different project. Project-selection status is separate from core/CLI/Vite compilation eligibility. Keep one selected config for the entire entry graph; do not reselect config independently for imported helpers, including external dependencies. Imported files need not be root files: TypeScript's normal dependency inclusion differs from root-file membership.
4. **No selected config does not prohibit compilation.** CLI/Vite no-import shaders (including local helpers) and graphs using only relative `.shdr.ts` imports compile/check without requiring project membership. This applies both when no config exists and when valid configs exist but none includes the entry; do not emit an excluded-project compilation failure in either case. Config preparation may be lazy: unrelated invalid configs must not newly block these config-independent paths either. If any reachable import needs an alias, the absence of a selected config produces a source-located alias-resolution diagnostic explaining the no-config/excluded state; never borrow aliases from an excluding config. An invalid/unreadable config encountered during required alias selection produces a configuration-related diagnostic at that alias import, not a silent fallback to another config, Vite aliases or package resolution. Project editor/LSP retains its existing no-config/excluded/invalid-config/not-on-disk UI states; it does not invent an inferred project. Those editor availability states do not mean that the source is invalid or cannot compile through CLI/Vite or an explicit virtual map. Configured entries and equivalent virtual maps remain the R5 alias-parity gate.
5. **Inheritance.** Honor JSONC, TypeScript config inheritance (including package config inheritance), and TypeScript's effective `paths` replacement/precedence; never concatenate child and parent mappings ad hoc. Rebase relative targets against the config that declares the effective `paths`, not blindly against the selected leaf config or cwd. Preserve target-array order. The host must supply core with effective alias targets already rooted in the canonical virtual namespace, plus canonical-file information (not a workspace dependency fence); browser callers supply equivalent effective mappings, not a raw config requiring filesystem access. Watch all config/inheritance files used to prepare them.
6. **Supported spelling.** Relative specifiers are `./` or `../` paths explicitly naming a `.shdr.ts` file. A nonrelative specifier must match a selected-project `paths` key (exact or one `*`); substitution must identify a `.shdr.ts` file. Exact keys win; otherwise use TypeScript's longest-prefix wildcard precedence, retaining config declaration order for equal-prefix ties. Try the chosen key's targets in declared order and use the first existing supported source; multiple ordered fallbacks are not themselves ambiguous. An existing non-shader target is unsupported, not a reason to fall through to an arbitrary package/JS target. No extension guessing, directory/index lookup, `.js` substitution, package exports, `baseUrl`-only lookup, Vite aliases, URL/query/fragment specifiers, absolute authored imports, or npm resolution. `shdr` remains the special DSL/type boundary, not a shader-source alias. Invalid patterns and unresolved/unsupported targets fail clearly at the import.
7. **TypeScript resolution parity.** The inspected TS 7.0.2 `CompilerOptions` exposes `paths` but no `baseUrl` or `pathsBasePath`; `Project.compilerOptions`, `rootFiles`, config diagnostics and `API.parseConfigFile` are available. Do not assume an undocumented base-path property exists or introduce a TS 6 config parser. Host config preparation must preserve declaring-config provenance (or consume correctly rooted TS 7 targets) and test inheritance. Project shader fixtures using explicit `.shdr.ts` specifiers need `allowImportingTsExtensions` with `noEmit` (as the Vite app already has); update editor fixtures accordingly. If TS configuration redirects a supported shader specifier through `moduleSuffixes`/`rootDirs` or another non-V1 mechanism to a different file, diagnose the conflict or make the virtual shader import explicitly use the core-selected file; never accept different core/editor targets silently. Unrelated ordinary TypeScript resolution stays delegated.

##### C. Canonical files, definitions, checking and diagnostics

- The virtual graph uses absolute slash-separated file IDs, normalizing separators, `.`/`..` and redundant separators without lowercasing or fetching anything. Host native absolute paths (including drive paths) are converted consistently to that namespace. Host realpath resolves symlinks/casing and supplies canonical identities; core uses only supplied canonical IDs/aliases, never calls realpath. Two virtual keys normalizing to one identity are invalid rather than last-write-wins. Entry and alias targets use the same normalization. Duplicate import spellings/host symlink aliases of one file share one module identity; disagreeing open-buffer aliases are errors, matching the existing LSP alias protection.
- A definition identity is `(canonical file ID, declaration identity/range)`, not just its local/exported spelling. Named-import aliases bind to it; separate files can export the same helper name. Parse each source once per graph snapshot, deduplicate imports/definitions, validate signatures, then topologically lower calls and emit only entry-reachable functions once. Do not concatenate authored files or execute marker/builder callbacks. The new DSL marker must follow the existing `shaderSourceWasNotTransformed` fail-fast convention rather than invoke or expose an authored callback at runtime. Stable generated names and ordering must not depend on absolute checkout location or file-map insertion order, so equivalent relative/alias graphs have equivalent artifacts.
- Reject module cycles on source import edges, even if no recursive function call occurs. Also reject direct/indirect helper recursion within an otherwise acyclic graph. DFS must distinguish a repeated completed dependency (valid diamond/duplicate import) from a back edge (cycle). Attribute a module cycle to the closing import and show the ordered file path; attribute function recursion to its closing helper call and show the helper path. No partial artifact.
- Module grammar permits direct, single-declarator top-level `const name = defineShaderFunction(...)` and `const name = defineUniforms(...)`, optionally wrapped in `export`. Helper callbacks have simple explicitly typed `Expr<F32>`/`Expr<Vec2/3/4<F32>>` parameters, optional supported return annotation, and the existing restricted expression or straight-line const/final-return bodies. Accept direct `import type { Expr, F32, Vec2, Vec3, Vec4 } from "shdr"` without a source graph edge. Do not broaden existing Shdr value aliases or fragment annotations as a side effect. Named source imports can alias a helper/schema into a local name; exports must be direct declarations, not `export { name }` barrels, namespace/default imports, or ordinary JS callables. No module-value captures.
- Keep exactly one explicit schema link. An exported schema can have another exported name, but the imported/local binding used by the fragment remains `uniforms` for the existing shorthand `{ uniforms }`; `{ uniforms: other }`, arrays or schema merging stay unsupported. Callback `uniforms` is a separate input binding. An imported schema does not require importing `defineUniforms` in the entry and does not become available inside helpers except as explicitly passed scalar/vector expressions. Same-file ordering and inline chained forms remain compatible.
- Artifact mode requires an entry default fragment. It validates module/import/export shapes and helper/schema definitions in loaded source modules, but does not lower or include a dependency's unrelated default fragment body merely because a named export is used. File-check mode validates all helpers/schemas and the file's own default fragment if present, even when a helper is not entry-reachable. CLI can therefore check helper-only and mixed modules without changing emission reachability.
- Missing file/unsupported specifier is owned by the import source span; missing/nonshader named export by its import specifier; invalid signature/body/capture/default by its defining file; invalid arity/shape by the caller; malformed `{ uniforms }` by the selecting fragment. Definition return mismatches must not be copied to every call. Graph diagnostic `fileName` identifies the original source used to interpret its UTF-16 range, never the requesting entry or generated shader.
- Deduplicate project faults by canonical owner + code + range + message (and routed source where needed), not by message alone. Different call sites remain distinct errors. CLI sorts diagnostics by owner display path/range with existing formatting; file count remains discovered-file count. Missing dependencies yield located shader diagnostics, but permissions/read failures retain the CLI's all-or-nothing input-error behavior. Vite's primary `id`/`loc` and editor publication must use the owning source; publish a shared fault once on its owning URI, including unopened dependencies, and clear it after fix/removal. Never interpret another file's offset using the entry text.

##### D. Atomic consumer changes and inspection counterexamples

- **Vite-only aliases:** using `this.resolve` or `resolve.alias` as the authoritative shader resolver can succeed while CLI/core fails. The shared effective-config loader and pure core resolution rule are mandatory; Vite resolution can remain for ordinary host imports only.
- **Inherited mappings:** treating `paths` inherited from `/work/tsconfig.base.json` as relative to `/work/app/tsconfig.json` selects the wrong directory. Preserve origin when flattening; test a leaf config and equivalent browser absolute targets before claiming alias parity.
- **Suppressed import graph:** `addWatchFile` alone establishes watching, but emitted JSON has no authored import edge. Step 3.1 must maintain reverse dependencies and explicitly invalidate/reload every dependent entry on helper/schema/config change (including missing-file creation, deletion and failed compilations); do not assume Vite's ordinary module graph will infer the edge.
- **Mixed/helper-only exports:** compiling a dependency through Vite's normal runtime transform would require a default fragment and erase its named exports. Load raw source directly in the host graph. Host imports of a fragment's default artifact remain valid; named helper/schema runtime imports must fail with a compile-only explanation. A helper-only module cannot expose a fake default artifact or executable authored exports.
- **Unsaved graph edits:** the existing LSP changed-document path and fixture extension leave other consumers cached. Build/replay a project source snapshot, transform all helper files, bump dependency/project versions and refresh owned diagnostics/hovers on unsaved edits, disk events and inherited-config changes. Per-file mappings and region lists must accompany that snapshot. Preserve `.ts` delegation and stale/disposed hover behavior.
- **Config scope differences:** config-search roots or selected configs differing between hosts can legitimately differ in editor availability/aliases, but cannot prohibit relative dependency resolution. Alias-parity tests must use identical config-search roots and the entry-selection rule above. Tests must cover nearest-excluded/ancestor-included, invalid config, solution references, no-config relative/alias, cross-root dependencies and a dependency excluded from root files but imported normally. These are known implementation seams, not permission to waive R5.
- **Review correction — excluded entry:** a valid `/work/tsconfig.json` including only `other.ts` must not make CLI/Vite reject `/work/scene.shdr.ts` with no imports or only relative imports. Both paths still compile; changing a reachable import to a `paths` alias fails at that import because no config was selected. Add paired no-config/excluded-config success and alias-failure cases to Steps 2.3 and 3.1, plus invalid-config/config-independent compatibility coverage.
- **Review correction — external CLI entry:** running from `/checkout`, explicitly checking `/external/scenes/scene.shdr.ts` importing `../lib/helper.shdr.ts` must load `/external/lib/helper.shdr.ts`, even though the config-search root is `/external/scenes`. Add this CLI success case and equivalent virtual-map compilation in Step 2.3. Cover Vite/editor entries with an external relative dependency and a canonical symlink target as well, including dependency invalidation and owning-file diagnostics. Missing/unreadable external files retain the ordinary missing-import/read-error behavior; outside-root location alone is not a failure. The initial dependency-root restriction was not approved and is withdrawn, not justified as a new language limit.

No material spec change is required by the corrected record: it resolves the spec's stated direct-export, one-schema, acyclic-module and project-selection assumptions without restricting the agreed relative imports. Source-import extension spelling and config-search boundaries are explicit V1 resolver details, not dependency-access boundaries. Historical `spec-2.md` wording in this plan was corrected to the governing `spec.md`; the spec's draft/self-reference status prose is historical and does not introduce a second governing document.

##### E. Representative fixtures locked for subsequent phases

Use a temp project rooted at `/work` with `tsconfig.json` including `src/**/*.shdr.ts`, `noEmit: true`, `allowImportingTsExtensions: true`, and `paths: { "@shader/*": ["./src/lib/*.shdr.ts"] }`. These are three proposed sources, not Phase 0 production additions:

```ts
// /work/src/lib/math.shdr.ts — helper-only, expression body
import { defineShaderFunction, fract } from "shdr";
import type { Expr, F32, Vec2 } from "shdr";

export const ramp = defineShaderFunction(
  (p: Expr<Vec2<F32>>, seed: Expr<F32>) =>
    fract(p.x * 0.1031 + p.y * 0.11369 + seed),
);
```

```ts
// /work/src/lib/shared.shdr.ts — mixed exports, transitive/block helper
import {
  createFragmentShader,
  defineShaderFunction,
  defineUniforms,
  vec4,
} from "shdr";
import type { Expr, F32, Vec2 } from "shdr";
import { ramp as baseGrain } from "./math.shdr.ts";

export const uniforms = defineUniforms((u) => ({ grain: u.f32(0.1) }));
export const filmGrain = defineShaderFunction(
  (p: Expr<Vec2<F32>>, seed: Expr<F32>): Expr<F32> => {
    const value = baseGrain(p, seed);
    return value;
  },
);
export default createFragmentShader(({ uniforms }) => vec4(0, 0, 0, 1));
```

```ts
// /work/src/scene.shdr.ts — alias import and explicit schema
import { createFragmentShader, vec4 } from "shdr";
import { filmGrain as grain, uniforms } from "@shader/shared";

export default createFragmentShader(
  ({ coord, uniforms }) =>
    vec4(grain(coord.xy, uniforms.time) * uniforms.grain, 0, 0, 1),
  { uniforms },
);
```

Compare the alias entry to `./lib/shared.shdr.ts` and a virtual file map containing exactly those canonical IDs plus effective `paths: { "@shader/*": ["/work/src/lib/*.shdr.ts"] }`. Expect the same artifact, two reachable helper definitions, complete grain default metadata, and no shared module's black default fragment. Remove that default export to exercise a helper/schema-only module; add a second entry selecting the same schema for the later isolation gate. Distinct same-named exports and a diamond import are separate positive variants.

Minimal failures: remove `math.shdr.ts` (diagnostic on `"./math.shdr.ts"` in shared); import an absent named export (diagnostic on the entry import specifier); add `import { filmGrain } from "./shared.shdr.ts"` to math and call it (module-cycle closing import with path `shared → math → shared`, deterministic for this entry); define a same-file self-calling helper or a two-helper mutual call (function recursion, not a module-cycle error). Use two entries plus `sqrt(-1)` in the shared helper to prove one defining-file fault, then `root(x) = sqrt(x)` called with `-1` to retain the caller-precondition policy. Malformed/multiple schema links stay negative source-located cases.

Review conclusion: the compiler and host boundaries can accommodate the agreed contract without authored execution or runtime/schema changes. All runtime/config-resolution behavior and the examples above remain **unverified until their owning implementation gates**; Phase 0 completes only the written feasibility decision.

## Phase 1 — Same-file typed helpers

Outcome: a local helper can be authored once, called inside a fragment, and emitted as a typed function in GLSL/WGSL; TypeScript 7 preserves source hovers/diagnostics.
Depends on: Phase 0.
Review boundary: local helpers only; cross-file resolution and imported uniforms remain unsupported until Phase 2. Steps 1.1–1.2 form an atomic user-visible acceptance gate.

### Step 1.1 — Typed local helper through parsing, IR, and both emitters

Status: Pending
Requirements / acceptance: R1–R2, R8, R11–R12; AC1, AC9 (core portion).
Depends on: Step 0.1.
Review boundary: local `defineShaderFunction` syntax and semantics; no module graph or editor claims.

Expected files:

- `packages/shdr/src/dsl.ts`, `packages/shdr/src/types.ts`, `packages/shdr/src/index.ts`, `packages/shdr/test/` — source marker/signature and type-level cases.
- `packages/core/src/parse-shader-file.ts`, `validate-shader-syntax.ts`, `normalize-shader-syntax.ts`, `shader-syntax.ts`, `lower-shader-syntax.ts`, `shader-ir.ts`, `diagnostics.ts` — local function parsing, typed parameters/return, call resolution and source diagnostics.
- `packages/core/src/generate-glsl-expression.ts`, `generate-glsl-fragment.ts`, `generate-wgsl-expression.ts`, `generate-wgsl-fragment.ts`, `shader-local-name.ts`, `compile-fragment-artifact.ts`, `packages/core/test/reusable-local.test.ts` (new) — callable emission/name isolation and focused tests.

Tasks:

- [ ] Recognize top-level `const` helpers with typed `Expr` parameters, supported `import type` from `shdr`, optional return annotations, expression/block bodies, and a marker that does not execute authored functions. Keep ordinary JS callables out of shader lowering.
- [ ] Lower parameter/local references and calls to target-neutral types with inferred/checked returns, no captures, exact shape/arity checks, collision-safe names and direct/indirect local recursion rejection.
- [ ] Emit each reachable local helper in both targets with correct signatures, grouping and builtin/splat support; preserve existing artifact fields and single-source fragments.
- [ ] Add focused success/failure tests for scalar/V2/V3/V4, annotation inference/mismatch, capture, invalid calls, nested helper calls, and locally provable builtin-domain errors versus `root(-1)` precondition behavior. Include real WebGL shader compilation and WGSL module compilation for a representative local helper, not only string snapshots.

Verification:

- Automated: add `packages/core/test/reusable-local.test.ts`, then run `pnpm --dir packages/core exec vitest run --config ../../vitest.config.ts --root . test/reusable-local.test.ts`, `pnpm --filter shdr test`, and `pnpm --filter @shdr/core check` (repo root). Check valid GLSL/WGSL compilation and exact invalid-source ranges; no new errors for existing single-source cases.
- Manual: Not needed; core, type and actual target-compilation tests cover this step's limited scope.

Completion gate: local helper source yields a valid dual-target artifact and both real target compilers accept it; invalid calls/captures/domain cases fail at authored ranges, and existing no-helper compilation still works. **Not a merge gate until Step 1.2 passes.** Evidence: Not run.

### Step 1.2 — Local-helper editor transformation and typed hovers

Status: Pending
Requirements / acceptance: R1–R2, R7, R9, R12; AC1 (editor portion).
Depends on: Step 1.1.
Review boundary: same-file TypeScript 7 virtual transformations/diagnostic routing; no cross-file edits.

Expected files:

- `packages/core/src/create-virtual-source.ts`, `transform-shader-expressions.ts`, `analyze-fragment.ts` — map every helper body's shader expressions alongside fragment expressions.
- `packages/language-service/src/typescript-7-editor-adapter.ts`, `diagnostic-routing.ts`, `packages/language-service/test/reusable-local-editor.test.ts` (new) — typed QuickInfo and routed ranges.
- `apps/editor-fixture/` (if needed for real UI later) — valid local-helper authoring fixture.

Tasks:

- [ ] Rewrite helper expressions in the TypeScript 7 virtual document without executing them or mapping a generated operation to an unrelated original range; preserve existing callback mapping.
- [ ] Route missing annotations, capture, wrong-arity/shape, return-type and builtin-domain diagnostics to original helper/call spans; check typed hovers at definition/usage.
- [ ] Add adapter tests for valid helpers and negative edits, including ordinary `.ts` delegation and existing shader hover/diagnostic regressions.

Verification:

- Automated: add `packages/language-service/test/reusable-local-editor.test.ts`, then run `pnpm --filter @shdr/language-service test` and `pnpm --filter @shdr/core test` (root). Assert hovers/diagnostic ownership and unchanged no-helper behavior.
- Manual: Not needed for this local adapter increment; real VS Code UI is required at Step 3.2/final acceptance.

Completion gate: the TypeScript 7 adapter and core agree on local-helper calls/types/errors with original positions, and existing fragment/ordinary-TS tests stay green. Evidence: Not run.

Phase exit gate: run `pnpm build` and `pnpm exec turbo run check --force` after both steps; the local helper works in both targets and the TypeScript 7 adapter, while old shaders remain accepted. No cross-file or REPL claims yet. Evidence: Not run.

## Phase 2 — Virtual source graph and project-backed checks

Outcome: a browser-supplied virtual graph or project-backed CLI can compile a fragment with imported helpers/uniform schema, diagnose source-file faults and preserve the old single-source API.
Depends on: Phase 1.
Review boundary: core + CLI; no Vite/editor cross-file completion claim until Phase 3.

### Step 2.1 — Environment-neutral named imports and graph compilation

Status: Pending
Requirements / acceptance: R3, R5–R8, R12; AC2, AC4 (core virtual-graph portion).
Depends on: Phase 1 exit.
Review boundary: relative `.shdr.ts` helpers, import aliases and transitive graph in core; custom schemas and project aliases follow.

Expected files:

- `packages/core/src/parse-shader-file.ts`, `shader-syntax.ts`, `shader-ir.ts`, `lower-fragment.ts`, `lower-shader-syntax.ts`, `compile-fragment-artifact.ts`, `diagnostics.ts`, `browser.ts`, `index.ts` — module exports/imports, file-aware diagnostics and virtual input contract.
- `packages/core/src/` (new graph resolver, if needed), `packages/core/test/reusable-graph.test.ts` (new) — pure path/graph logic and tests.

Tasks:

- [ ] Accept helper-only and mixed-export `.shdr.ts` sources; bind direct named imports to stable definitions even with aliases/colliding spellings; follow transitive dependencies without evaluating modules.
- [ ] Define a virtual entry/files API with normalized file identities and relative resolution; report missing exports/files, malformed imports and module/function cycles with a useful path; keep single-string no-import usage unchanged.
- [ ] Carry original file identity plus ranges through graph failures, while preserving legacy single-source diagnostic shapes where possible. Reject partial artifacts and deduplicate repeated helper emission.
- [ ] Test an imported helper from a mixed module, a three-file chain, helper-only modules, alias/cycle/missing-import failures, frozen/deterministic results and default-shader reachability. Check GLSL/WGSL output for reachable helpers, not merely parse success.

Verification:

- Automated: add `packages/core/test/reusable-graph.test.ts`, then run `pnpm --dir packages/core exec vitest run --config ../../vitest.config.ts --root . test/reusable-graph.test.ts` and `pnpm --filter @shdr/core check`. Assertions include browser-safe graph compilation with no Node dependency, file/range fault ownership and unchanged single-source artifacts.
- Manual: Not needed; input map and emitted text are fully observable in focused core tests. Real project resolver and GPU acceptance occur later.

Completion gate: a three-file virtual map produces both target shaders and precise graph diagnostics without filesystem/JS execution; old single-source inputs still compile. **Cross-file public feature not mergeable until Steps 2.2–3.2.** Evidence: Not run.

### Step 2.2 — Imported uniform schema without artifact changes

Status: Pending
Requirements / acceptance: R4, R7–R8, R12; AC3 (compile/type portion).
Depends on: Step 2.1.
Review boundary: named `defineUniforms` import and one explicitly linked schema; no runtime/backend resource changes.

Expected files:

- `packages/core/src/parse-shader-file.ts`, `parse-custom-uniforms.ts`, `lower-fragment.ts`, `shader-ir.ts`, `compile-fragment-artifact.ts`, `packages/core/test/reusable-uniforms.test.ts` (new) — schema resolution/metadata and negative cases.
- `packages/shdr/src/dsl.ts`, `packages/shdr/test/` — check source/host schema typing for an imported definition if declaration types need adjustment.

Tasks:

- [ ] Resolve the selected `{ uniforms }` declaration by named import or existing same-file declaration, without evaluating builder callbacks; retain complete literal defaults and referenced subset.
- [ ] Verify two independent fragments can import one schema, and a helper can only use its fields when explicitly passed arguments.
- [ ] Reject missing, invalid, mismatched or multiply selected definitions at their authored locations while preserving the inline/chained and local named forms.
- [ ] Compare JSON metadata and output bindings to equivalent same-file input; do not add fields or inferred runtime bindings.

Verification:

- Automated: add `packages/core/test/reusable-uniforms.test.ts`; run `pnpm --dir packages/core exec vitest run --config ../../vitest.config.ts --root . test/reusable-uniforms.test.ts test/custom-uniforms.test.ts`, `pnpm --filter shdr test`, and `pnpm --filter @shdr/core check`. Expect identical schema/defaults and no helper capture; runtime independence gets a real check in Step 4.1.
- Manual: Not needed; this step changes compile-time linkage and metadata only.

Completion gate: virtual imports select the same custom schema/metadata as a local definition; malformed links yield original-file diagnostics and all existing custom-uniform fixtures still pass. Evidence: Not run.

### Step 2.3 — Shared TypeScript-project paths and CLI graph checking

Status: Pending
Requirements / acceptance: R5, R7, R9, R12; AC4, AC5 (CLI portion).
Depends on: Steps 2.1–2.2 and Phase 0 resolution rule.
Review boundary: project-backed resolution and CLI check presentation; Vite/editor must reuse the resulting effective graph contract, not invent new alias semantics.

Expected files:

- `packages/cli/src/check.ts`, `discover.ts`, `package.json` (only if config parsing requires a runtime dependency), `packages/cli/test/cli.test.ts` (or new `reusable-graph.test.ts`) — project/relative resolution and one diagnostic per authored fault.
- `packages/core/src/` (graph-input/path normalization contract, if needed) — only environment-neutral changes.
- `packages/project/` (new Node-only shared host package), consumer package manifests/lockfile, `packages/lsp/src/project-discovery.ts` and project fixtures — extract/reuse the Phase 0 project-selection/config/loading contract without adding host dependencies to core. Preserve the LSP discovery facade/tests where practical.

Tasks:

- [ ] Load a selected project's `tsconfig.json` `paths` (including relevant config inheritance), resolve relative/aliased `.shdr.ts` sources with deterministic file identities, and give explicit errors for unsupported/no-config alias use.
- [ ] Check helper-only entries, discovered fragments and their allowed dependencies; report a shared-file error once per check rather than multiplying it by dependents.
- [ ] Use isolated temporary TS projects to test aliases, missing/non-shader files, cyclic graphs and diagnostics at the actual owner file/line, without modifying workspace fixtures during the run. Include no-config/excluded-config no-import and relative-graph successes, alias failures without selected config, and an explicit entry outside cwd importing `../lib/helper.shdr.ts` outside its config-search root.
- [ ] Keep existing CLI discovery, single-file checks and ordinary TypeScript responsibility unchanged.

Verification:

- Automated: add CLI temp-project cases, then run `pnpm --filter @shdr/cli test` and `pnpm --filter @shdr/cli check` (root). Expect distinct successful relative/alias cases and deterministic negative output with no duplicated shared-file fault.
- Manual: Not needed; CLI invocation and file/line output are covered by process-level tests. Final workspace `pnpm shdr check` is gated by Phase 4.

Completion gate: CLI and virtual-map compilation agree on an equivalent graph, helper-only files check without dummy fragments, and no Node filesystem code enters browser core. Evidence: Not run.

Phase exit gate: `pnpm build`, focused core/CLI suites and uncached checks succeed; a project fixture and equivalent virtual map produce the same artifact and file-aware errors. Do not claim Vite/editor alias parity until Phase 3. Evidence: Not run.

## Phase 3 — Consumer integration and project editing

Outcome: static builds and development invalidation, editor project diagnostics/hovers, and current REPL behavior honor the new contract.
Depends on: Phase 2.
Review boundary: no new language shapes or runtime API; fix consumer integration without altering core's browser-safe graph semantics.

### Step 3.1 — Vite source-graph transform and static boundary

Status: Pending
Requirements / acceptance: R5, R8–R9, R12; AC4, AC5 (Vite portions), AC7.
Depends on: Phase 2 exit.
Review boundary: host file loading, dependency watching, artifact output and negative named-runtime imports.

Expected files:

- `packages/vite/src/index.ts`, `packages/vite/test/index.test.ts`, `packages/vite/package.json` — graph-aware transform/error locations and shared `@shdr/project` dependency.
- `apps/vite-basic/src/` (new shared `.shdr.ts` and importing entry fixtures), `apps/vite-basic/verify-build.mjs`, `verify-dev.mjs` — static bundle and invalidation checks with isolated/edit-restoring source handling.

Tasks:

- [ ] Resolve fragments through the same effective project/alias rule as CLI, load reachable `.shdr.ts` sources before transformation and register them as Vite dependencies; keep the default runtime export as JSON artifact data.
- [ ] Handle helper-only modules as compile-time sources and reject ordinary host named imports of helpers/uniform declarations rather than shipping source or a fake callable export.
- [ ] Check a valid imported helper/schema, invalid import attribution, shared-helper edits propagating to two dependent fragments, and schema-default edits changing both artifacts; test restoring/isolating edited source on failure.
- [ ] Inspect both production dual-backend and WebGL-only bundles for compiler/DSL/authored-source leakage while retaining existing artifact type usability.

Verification:

- Automated: extend `packages/vite/test/index.test.ts`, `apps/vite-basic/verify-dev.mjs` and `verify-build.mjs`; run `pnpm --filter @shdr/vite test`, `pnpm --dir apps/vite-basic build`, and `pnpm --dir apps/vite-basic test:dev` after dependency builds. Unit tests prove transform behavior; Vite dev checks prove real dependent invalidation; production checks prove static bundle exclusion. A proposed negative fixture asserts named runtime imports fail clearly.
- Manual: Not needed if the dev-server tests perform actual dependency edits/reloads and the build checks inspect the emitted graph.

Completion gate: both entries update after a shared edit, malformed imports report the correct authored file, the production bundle contains only artifacts/renderer code, and host named helper imports do not execute. Evidence: Not run.

### Step 3.2 — Project-aware editor and LSP diagnostics

Status: Pending
Requirements / acceptance: R5, R7, R9, R12; AC4, AC5 (editor portions).
Depends on: Phase 2 exit and completed Step 3.1 (shared graph/alias contract).
Review boundary: virtual project snapshots, cross-file QuickInfo/ranges and invalidation; ordinary `.ts` remains delegated.

Expected files:

- `packages/language-service/src/typescript-7-editor-adapter.ts`, `typescript-7-checker.ts`, `diagnostic-routing.ts`, `packages/language-service/test/reusable-project-editor.test.ts` (new) — cross-file mapping/refresh.
- `packages/lsp/src/project-discovery.ts`, `server.ts`, `packages/lsp/test/`, language-service/LSP package manifests — shared host-loader integration, project-aware source lookup and file-owned protocol publication/tests.
- `apps/editor-fixture/` (new project helper/fragment fixtures), `apps/editor-fixture/src/extension.test.ts`, `apps/editor-fixture/test.mjs` — real editor coverage.

Tasks:

- [ ] Transform/recheck helper-body operations in their defining file as well as fragments, and map imported call/type errors to callers without attributing a dependency fault to every consumer.
- [ ] Use the same selected TS project's resolution as CLI/Vite, including `paths`, while maintaining consistent open-file unsaved edits, project-version invalidation and hovers after dependency updates.
- [ ] Add valid and negative multi-file project fixtures and LSP/editor tests for definition/call hovers, original ranges, aliases, helper-only files, and unchanged ordinary `.ts` ownership.
- [ ] Extend the real VS Code UI test itself to open helper and fragment fixtures, edit a dependency and check refreshed owning-file diagnostics/hovers; retain its existing diagnostic/hover cases.

Verification:

- Automated: add `packages/language-service/test/reusable-project-editor.test.ts` and applicable LSP/fixture tests, then run `pnpm --filter @shdr/language-service test`, `pnpm --filter @shdr/lsp test`, and `pnpm --dir apps/editor-fixture test` (root). Assert original-file/line routing, QuickInfo, stale-result handling and delegation.
- Manual/live: after `pnpm --dir apps/editor-fixture build`, run `pnpm --dir apps/editor-fixture test:editor` with VS Code installed (or `VSCODE_EXECUTABLE_PATH`); open imported helper and fragment, change a helper, observe updated hover/diagnostic in the owning file and no ordinary `.ts` takeover. Record executable/version and observed result; if VS Code is unavailable, mark this live gate Blocked.

Completion gate: adapter/LSP checks and **real VS Code UI** demonstrate cross-file edit/hover/diagnostic ownership; no test-only virtual result is presented as editor acceptance. Evidence: Not run.

### Step 3.3 — Preserve single-textarea REPL behavior

Status: Pending
Requirements / acceptance: R6, R10–R12; AC8.
Depends on: Phase 1 local helpers and Phase 2 single-string failure contract.
Review boundary: no new tabs/file-picker or automatic fetch; browser compilation/preview behavior only.

Expected files:

- `apps/repl/src/App.tsx` (only if needed), `apps/repl/verify-browser.mjs` — same-file helper and missing-external-file cases.
- `apps/repl/README.md` — document local helper support and explicit virtual-map limit.

Tasks:

- [ ] Compile/render a shader with a local helper from the current textarea; verify both generated target panels and both previews when WebGPU is available.
- [ ] Compile a source importing an external helper without a map; show a clear unresolved-import diagnostic, avoid network loads, preserve the last installed shader/pixels and keep errors shared across backends.
- [ ] Preserve custom-uniform controls, compiler opt-in entry and single-source fallback behavior.

Verification:

- Automated: extend `apps/repl/verify-browser.mjs`, then run `pnpm --dir apps/repl test` after `pnpm build` has provided workspace dist. Assert both rendered paths for valid local helper and no partial replacement/fetch on missing import.
- Manual: Not needed for this step if the browser UI test exercises source edits, diagnostics and installed pixels; document WebGPU-unavailable fallback separately in existing tests.

Completion gate: same-textarea helpers render successfully and missing imported files block both previews without changing the last good image. Evidence: Not run.

Phase exit gate: focused Vite, language-service/LSP, editor UI, and REPL gates all pass on the shared project/virtual graph; `pnpm build` keeps static host bundles compiler-free. Evidence: Not run.

## Phase 4 — Cross-backend and regression acceptance

Outcome: non-degenerate rendered proof for imported helpers/uniforms and no regressions in public/static consumers.
Depends on: Phase 3.
Review boundary: composed behavior, user docs and final audit; do not broaden language syntax to make reference ports pass.

### Step 4.1 — Pinned two-target pixels and independent schema usage

Status: Pending
Requirements / acceptance: R3–R4, R8, R11–R12; AC3 (renderer portion), AC6.
Depends on: Phase 3 exit.
Review boundary: browser integration fixture and reference expectations, not new runtime/binding APIs.

Expected files:

- `apps/vite-basic/src/` (new reused grain/palette-style and imported-uniform fixture, if not already added in Step 3.1), `apps/vite-basic/verify-render.mjs` — static Vite artifact/browser rendering.
- `packages/runtime/test/` (new `verify-reusable-functions.mjs` if needed), `packages/runtime/package.json` only if wiring a new test command — independent renderer state.
- `packages/core/test/` — focused output/binding regression if a browser failure exposes a missing case.

Tasks:

- [ ] Pin resolution, canonical top-left coordinates, mouse, time and custom defaults/overrides; choose finite, non-degenerate sample points and channel tolerances before comparing outputs.
- [ ] Compile/link/run the imported-helper GLSL in real WebGL 2; compile/pipeline/draw the WGSL and sample **presented** WebGPU canvas pixels (not only an offscreen buffer or compilation messages).
- [ ] Compare expected sample colors and backend parity within tolerances; assert reachability/emitted-once, correct uniform metadata/grouping, and no bit-identity claim.
- [ ] Install two artifacts sharing an imported uniform definition into separate renderer instances; update/reset one and check the other's first/current pixels and defaults are unaffected.

Verification:

- Automated: extend `apps/vite-basic/verify-render.mjs` or add the runtime browser test and wire it into `@shdr/runtime`'s script; run `pnpm --dir apps/vite-basic test:render` and `pnpm --filter @shdr/runtime test` after build. Assert real target compilation and WebGL readback versus presented WebGPU pixels for pinned inputs, plus isolated updates.
- Manual: Not needed when Playwright Chromium WebGL 2 and WebGPU are available and the automated test samples the presented canvas. If unavailable, record a Blocked gate rather than accepting module compilation as pixel evidence.

Completion gate: both real targets render the imported helper/default shader at the agreed samples, runtime schema isolation holds and existing WebGL/presented-WebGPU suites pass. Evidence: Not run.

### Step 4.2 — Documentation and complete regression/PR gate

Status: Pending
Requirements / acceptance: R1–R12; AC1–AC9 (aggregate, not replacement for earlier focused gates).
Depends on: Step 4.1.
Review boundary: user-facing examples, unchanged behavior and final diff; no new feature paths.

Expected files:

- `README.md`, `packages/shdr/README.md`, `packages/cli/README.md`, `apps/repl/README.md`, `apps/vite-basic/README.md` (only where examples/contracts change) — authoring/import/domain limits.
- `plans/reusable-functions/plan.md` — execution evidence and any accepted deviations.
- Existing tests/fixtures only where final integration uncovers a regression.

Tasks:

- [ ] Document explicit helper parameters, typed inputs/inferred returns, imported schemas, relative and `tsconfig` aliases, compile-only named exports, no REPL multi-file UI, and the `root(-1)` caller-precondition limitation.
- [ ] Audit exported public types and source/bundle graph for any legacy single-file assumption; keep older no-helper fixtures and original diagnostic ownership intact before removing any compatibility path.
- [ ] Run full workspace build, uncached checks, CLI check, all test suites, real editor UI, formatter and whitespace audit; record revision/environment, failures and evidence in owning gates. Do not mark a waived/blocked GPU or editor check Verified.
- [ ] Review final diff for runtime/IR/binding drift, helper namespace collisions, unnecessary output/golden churn, compiled/authored source leaks and untouched unrelated work; seek review before any push/PR/merge.

Verification:

- Automated (repo root): `pnpm build`, `pnpm exec turbo run check --force`, `pnpm shdr check`, `pnpm test`, `pnpm exec prettier --check README.md packages/shdr/README.md packages/cli/README.md apps/repl/README.md apps/vite-basic/README.md plans/reusable-functions/plan.md` (also check every other changed source/test file), and `git diff --check`. `pnpm test` includes project browser tests but **not** `test:editor`; use Step 3.2's real UI gate separately.
- Manual/live: run `pnpm --dir apps/editor-fixture test:editor` after build with working VS Code; review AC1–AC9 evidence, default-artifact import in a static host, and actual presented GPU screenshots/pixels from Step 4.1. Record tested environment and reviewer; no external approval is assumed.

Completion gate: each AC1–AC9 row below has passing focused and integration evidence, unchanged shader/runtime/static behavior remains verified, and no outstanding blocked live gate is reported as passing. PR creation/merge is a **separate review/approval action**, not an automatic plan step. Evidence: Not run.

Phase exit gate: feature-complete local implementation satisfies the governing spec and is ready for review; if a live gate is unavailable, mark the feature Blocked or seek explicit accepted deviation without silently weakening the spec. Evidence: Not run.

## Final acceptance

| Spec acceptance ID | Owning step / gate | Verification and expected result                                                                                                  | Evidence / status |
| ------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| AC1                | 1.1–1.2            | Typed helper/inference and invalid calls/captures in core + TypeScript 7 hovers/ranges.                                           | Pending; not run  |
| AC2                | 2.1, 2.3           | Virtual + CLI mixed/helper-only/transitive graph, aliases and cycle/missing-export diagnostics; reachable-only emission.          | Pending; not run  |
| AC3                | 2.2, 4.1           | Imported schema metadata/type parity and independent WebGL/WebGPU runtime defaults/updates.                                       | Pending; not run  |
| AC4                | 2.1, 2.3, 3.1–3.2  | Equivalent virtual, project CLI, Vite and editor resolution; unsupported imports fail at authored file/range.                     | Pending; not run  |
| AC5                | 2.3, 3.1–3.2       | Shared fault reported once; dependent Vite rebuild and real editor hover/diagnostic refresh, ordinary `.ts` delegated.            | Pending; not run  |
| AC6                | 1.1, 4.1           | Reachable-once real GLSL ES 3.00/WebGL and WGSL pipeline plus pinned **presented WebGPU** pixels.                                 | Pending; not run  |
| AC7                | 3.1, 4.2           | Host named imports fail and production dual/WebGL-only bundles contain artifact, not authored source/compiler.                    | Pending; not run  |
| AC8                | 3.3                | Local helper renders in REPL; unresolved external import never fetches/replaces installed shader.                                 | Pending; not run  |
| AC9                | 1.1, 4.2           | Direct invalid builtins inside helper diagnosed; `root(-1)` remains documented caller precondition without invalid-pixel promise. | Pending; not run  |

## Rollback and recovery

The feature has no persistent data migration or destructive external operation. Keep old source-only compile and renderer contracts active until graph output and static consumers have passing parity tests. Within an unmerged implementation, revert a failing step and its dependent work as a unit; for a broken public helper path revert the atomic Phase 1 local-helper group or the Phase 2–3 cross-file group rather than leaving exposed syntax with no target/editor/consumer support. A Vite/CLI project-resolution failure must not be hidden by returning a stale or partial artifact; restore the last known-good compile path while fixing resolution. Ordinary runtime failed-replacement preservation remains owned by the existing renderer contract. No commit, push, PR or merge is authorized by this document.

## Deferred checks and accepted deviations

- None accepted. Real VS Code and presented WebGPU gates may be unavailable on a particular machine; record them Blocked with environment details, or obtain explicit acceptance of a deviation and follow-up. A passing mock/WGSL-module test is not a substitute.
- Defer package imports, barrel/namespace imports, a multi-file REPL UI, type-polymorphic helpers, module-value captures, recursion and interprocedural domain proofs per [spec.md](spec.md). Do not attach an implied schedule or treat those as silently supported by this plan.
