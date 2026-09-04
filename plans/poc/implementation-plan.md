# Shader DSL POC Implementation Plan

This plan turns [`spec.md`](./spec.md) into small, independently verifiable implementation steps. The editor experience is the first go/no-go gate because it is the least certain and most important part of the POC.

## Working agreement

For each step:

1. Implement only that step's stated scope.
2. Add or update its automated verification where possible.
3. Run the listed verification.
4. Record any deviation or new decision in this plan or the specification.
5. Stop for review before beginning the next step.

A step is complete only when its verification passes. Later phases should not compensate for a failing earlier step.

## Proposed workspace

```text
apps/
  editor-fixture/          Real VS Code/TypeScript 7 acceptance fixture
  vite-basic/              Vite and WebGL integration fixture
  repl/                    Browser REPL

packages/
  shdr/                    Public `shdr` types and runtime sentinels
  core/                    Babel parsing, virtual source, IR, semantics, GLSL
  language-service/        TypeScript 7 editor adapter and diagnostic routing
  vite/                    Vite adapter

plans/poc/
  spec.md
  implementation-plan.md
```

The public `shdr` package is included explicitly because shader source imports must resolve before the Vite transform and while TypeScript 7 checks the virtual file.

---

# Phase 0 — Workspace and test foundation

## Step 0.1 — Normalize the Turborepo tasks

**Work**

- Add root `check` and `test` scripts while retaining the existing development scripts.
- Add Turbo `check` and `test` tasks.
- Update build outputs to include `dist/**` for packages.
- Keep TypeScript pinned to the repository version.
- Do not add release, Changesets, or remote-cache configuration.

**Verify**

```sh
pnpm install
pnpm build
pnpm check
pnpm test
```

At this step, empty task graphs are acceptable, but every command must exit successfully.

**Done when**

The root has one stable command each for build, type checking, and tests.

## Step 0.2 — Create the initial packages

**Work**

Create minimal workspace packages:

- `shdr`
- `@shdr/core`
- `@shdr/language-service`
- `@shdr/vite`

Each package should have:

- A package manifest
- A strict TypeScript configuration extending the shared configuration
- `build`, `check`, and `test` scripts where applicable
- A minimal exported entry point

`@shdr/language-service` starts as an adapter shell. Its final runtime format will be selected by the TypeScript 7 editor feasibility spike rather than assuming the legacy tsserver plugin format.

**Verify**

```sh
pnpm build
pnpm check
pnpm test
```

Also import each package from a small package-local smoke test to verify workspace resolution.

**Done when**

All package entry points resolve and the complete workspace builds from a clean checkout.

## Step 0.3 — Add shared test infrastructure

**Work**

- Add Vitest and a minimal shared configuration.
- Add one passing test in each package that will contain logic.
- Add fixture helpers that read `.shdr.ts` files as text rather than allowing ordinary `tsc` to check them.
- Ensure tests run deterministically and do not depend on the current working directory.

**Verify**

```sh
pnpm test
```

Intentionally break one smoke assertion once to confirm Turbo reports the owning package and failure clearly, then restore it.

**Done when**

A package can add a `*.test.ts` file and have it run from both the package and repository root.

---

# Phase 1 — Public shader types and source recognition

## Step 1.1 — Implement branded public shader types

**Work**

In `packages/shdr`, define:

- `F32`
- `Vec2<F32>`
- `Vec4<F32>`
- `Expr<T>`
- `DefaultUniforms`
- `FragmentContext`
- `FragmentShaderSource`

For the POC, expose only the minimum swizzles `.x`, `.y`, and `.xy`. Full vector component and swizzle support is deferred. `Vec2` and `Vec4` must remain structurally incompatible.

**Automated verification**

Add compile-time tests asserting:

- `coord.xy` is `Expr<Vec2<F32>>`.
- `coord.x` and `coord.y` are `Expr<F32>`.
- `Vec2<F32>` is not assignable to `Vec4<F32>`.
- Scalar expressions do not expose vector swizzles.
- `FragmentShaderSource` is assignable to `string`, but a plain `string` is not assignable to `FragmentShaderSource`.

Use `@ts-expect-error` only for deliberate negative assertions.

**Done when**

The public type package passes positive and negative TypeScript tests without relying on `any`.

## Step 1.2 — Add the public DSL declarations

**Work**

Add public declarations or sentinel implementations for:

```ts
createFragmentShader(callback);
vec4(x, y, z, w);
```

Add a non-public `shdr/internal` export containing:

```ts
__shdr_internal_f32(value);
__shdr_internal_div(left, right);
```

Use the exact overload matrix from the specification. Do not expose a permissive implementation signature in emitted declarations. Runtime sentinel implementations may throw a clear “shader source was not transformed” error.

**Automated verification**

Inspect or type-check the emitted declarations and assert:

- Valid division overloads infer the expected expression type.
- `Vec2 / Vec4` has no matching overload.
- Numeric conversion returns `Expr<F32>`.
- `vec4` accepts exactly four scalar expressions and returns `Expr<Vec4<F32>>`.
- The top-level `shdr` export does not expose internal helpers.

**Done when**

A generated virtual file can import all required public and internal declarations without using ambient globals.

## Step 1.3 — Parse and recognize the strict shader boundary

**Work**

In `@shdr/core`, parse source with Babel Parser 8 using its TypeScript syntax plugin and return a `ShaderFileInfo` containing at least:

- The `createFragmentShader` import
- Constructor imports
- The default export call
- Callback parameter and body ranges
- The complete shader callback range

Keep Babel AST types private to the parser adapter. Downstream compiler stages consume normalized core syntax types and source ranges. Recognize only the strict forms listed in the specification, including imports from exactly `"shdr"`.

**Automated verification**

Add table-driven fixtures for:

- The valid target source
- Wrong module specifier
- Aliased import
- Namespace import
- Missing default export
- Multiple shader calls
- Async callback
- Wrong parameter shape
- Reserved `__shdr_internal_` identifier

Each invalid fixture must return a source-ranged shader diagnostic rather than throw.

**Done when**

The compiler reliably identifies one valid shader region and rejects every explicitly unsupported boundary form.

## Step 1.4 — Validate the initial syntax subset

**Work**

Walk the callback and accept only:

- Simple `const` declarations with initializers
- One final `return`
- Numeric literals
- Local identifiers
- Parentheses
- `/`
- Supported constructor calls
- Supported property access

Reject every unsupported syntax category named in the specification.

**Automated verification**

Add one focused negative fixture for each rejected category, including `let`, assignment, unary minus, `+`, `if`, nested function, closure capture, type annotation, and non-final return.

Assert diagnostic code, message category, and original range. Avoid full-message snapshots unless wording itself is important.

**Done when**

Unsupported JavaScript cannot silently pass through as shader code.

---

# Phase 2 — Virtual TypeScript transformation

## Step 2.1 — Build a mapped-text writer

**Work**

Implement a small writer that can:

- Copy an original source range and create an identity mapping
- Append generated text without an identity mapping
- Associate a generated range with an original expression range
- Return `VirtualSource`
- Translate original offsets to generated offsets
- Translate generated ranges back to original ranges

Implement the mapping precedence rule from the specification: smallest containing mapping wins, with identity mappings winning equal-specificity ties.

**Automated verification**

Test mapping behavior independently with synthetic strings:

- Exact identity mapping
- Generated prefix before copied source
- Generated wrapper around copied source
- Nested expression mappings
- Equal-range identity/expression precedence
- Unmapped generated text

**Done when**

Mapping can be verified without invoking TypeScript or shader transformation logic.

## Step 2.2 — Transform numeric literals

**Work**

Inside the shader callback only, transform:

```ts
0;
```

into:

```ts
__shdr_internal_f32(0);
```

Inject a collision-safe import from `shdr/internal`. Preserve source outside the shader callback byte-for-byte apart from the generated helper import.

**Automated verification**

Golden-test:

- A literal in `vec4`
- Multiple literals
- A literal inside parentheses
- A literal outside the callback, which must remain unchanged
- Original-to-generated and generated-to-original mappings for each literal

**Done when**

Every shader numeric literal has virtual `Expr<F32>` semantics and maps back to its exact source literal.

## Step 2.3 — Transform one division

**Work**

Transform:

```ts
coord.xy / uniforms.resolution;
```

into a call to `__shdr_internal_div`. Preserve identity mappings for identifiers and operands, and map the generated helper call to the complete binary expression.

**Automated verification**

Assert:

- Exact generated virtual source
- Mapping of `coord`, `xy`, `uniforms`, and `resolution`
- Mapping of the generated helper call to the original binary expression
- Source outside the callback is unchanged

**Done when**

The target operator expression has a deterministic virtual representation and complete mappings.

## Step 2.4 — Transform nested and parenthesized division

**Work**

Support recursive division transformation while preserving TypeScript associativity and explicit parentheses.

Cover at least:

```ts
a / b / c;

a / (b / c);

1 / 2 / uniforms.time;
```

**Automated verification**

Golden-test generated code and every nested mapping. Confirm inner generated ranges resolve to inner source expressions and outer ranges resolve to outer expressions.

**Done when**

Nested operators and literals transform correctly without relying on offsets from a fully reprinted AST.

## Step 2.5 — Stabilize the virtual-source API

**Work**

Expose a discriminated result:

```ts
interface CreateVirtualSourceSuccess {
  readonly ok: true;
  readonly virtualSource: VirtualSource;
  readonly diagnostics: readonly [];
}

interface CreateVirtualSourceFailure {
  readonly ok: false;
  readonly diagnostics: readonly ShaderDiagnostic[];
  readonly shaderRegion?: TextRange;
}

type CreateVirtualSourceResult =
  | CreateVirtualSourceSuccess
  | CreateVirtualSourceFailure;

createVirtualSource(
  source: string,
  fileName?: string,
): CreateVirtualSourceResult;
```

Return `VirtualSource` only on success. Return source-ranged diagnostics in original-source coordinates for invalid boundaries and unsupported syntax. If the callback boundary was recognized before validation failed, return its original-source `shaderRegion` as routing metadata without returning partial virtual source.

**Automated verification**

Add API-level tests covering:

- Valid target file
- Invalid shader boundary
- Unsupported callback syntax
- Repeated calls producing identical output and mappings

**Done when**

The language-service package can consume virtual source through one stable, filesystem-independent API.

---

# Phase 3 — TypeScript 7 checking and editor integration

## Step 3.0 — Prove a TypeScript 7 editor extension point

**Work**

Before implementing a checker adapter, investigate TypeScript 7's native language-server and editor APIs using the pinned repository version. Build the smallest real VS Code experiment that attempts to:

- Detect a `.shdr.ts` callback region
- Suppress or replace native diagnostics within that region
- Supply alternate hover text within that region
- Preserve ordinary TypeScript diagnostics and hovers outside that region

Do not add a TypeScript 6 compatibility dependency or rely on the legacy tsserver plugin API. Record the API or protocol used and any unstable dependencies.

**Verification**

Open a real `.shdr.ts` file in VS Code and demonstrate replacement diagnostics and hover text inside the callback while an ordinary TypeScript error and hover outside the callback remain visible.

**Done when**

A documented TypeScript 7 integration path can satisfy the editor-routing requirements, or the POC stops with evidence that TypeScript 7 does not yet expose the required extension point.

**Result — complete**

The pinned TypeScript 7.0.2 native language server does not ship middleware, content mappers, or another extension point that can selectively replace its diagnostics. The content-mapper protocol found on the `microsoft/typescript-go` main branch is not present in either the pinned package or the investigated `TypeScriptTeam.native-preview` 0.20260708.2 extension and is therefore not the selected path.

The successful path gives `.shdr.ts` a dedicated `shdr-typescript` VS Code language ID. A Shdr extension owns diagnostics and hovers for that language, checks virtual source through the unstable `typescript/unstable/sync` API, and maps results back with `@shdr/core`. The API surface used by the spike is `API`, the virtual `fs.readFile` hook, `updateSnapshot`, `getDefaultProjectForFile`, `Program` diagnostics, and `Checker` type queries. Ordinary code inside a shader module is preserved through identity mappings; ordinary `.ts` files remain owned by the standard TypeScript editor provider.

`apps/editor-fixture` includes an automated real-VS-Code Extension Development Host test. Against VS Code 1.127.0 and TypeScript 7.0.2 it proves that only the ordinary outside diagnostic remains, shader hover reports `Expr<Vec2<F32>>`, outside hover reports `string`, and unsupported shader syntax reports one Shdr diagnostic.

## Step 3.1 — Define the TypeScript 7 checker adapter

**Work**

Using the TypeScript 7 API or protocol selected in Step 3.0, define an adapter that checks the virtual shader file with normal project context and resolves both `shdr` and `shdr/internal`.

The adapter must expose compiler-independent core data for:

- Semantic diagnostics
- QuickInfo at a generated position
- The inferred type of a named declaration for test assertions

TypeScript 7 API and protocol types must not leak into `@shdr/core`.

**Automated verification**

Assert that the valid target source produces:

```text
uv: Expr<Vec2<F32>>
color: Expr<Vec4<F32>>
```

Also assert that no helper import or module-resolution diagnostics occur.

**Done when**

The transformed file is checked by real TypeScript 7 declarations rather than a mocked type system, through an isolated adapter.

**Result — complete**

`@shdr/language-service` now exposes `TypeScript7CheckerAdapter`. It overlays generated shader code through TypeScript 7's virtual `fs.readFile` callback, opens the real configured project, and returns only project-owned diagnostic, QuickInfo, declaration-type, and range data. Callers explicitly dispose checked snapshots and the adapter; TypeScript 7 API, AST, project, checker, and snapshot types remain private to the implementation and do not appear in emitted declarations. The package emits ESM so it can consume the browser-compatible ESM core directly; editor-specific bundles may wrap it in their required host format.

The project fixture resolves the built declarations for both `shdr` and the generated `shdr/internal` helper import. Automated tests check the transformed source with TypeScript 7.0.2 and assert zero semantic or module-resolution diagnostics, `uv: Expr<Vec2<F32>>`, `color: Expr<Vec4<F32>>`, and generated-position QuickInfo for `uv`.

## Step 3.2 — Prove invalid operator diagnostics

**Work**

Check this invalid source through the virtual project:

```ts
const invalid = coord.xy / coord;
```

Map TypeScript’s overload diagnostic from the generated helper call back to the original binary expression.

**Automated verification**

Assert:

- Exactly one relevant shader-operation diagnostic is surfaced.
- Its range is the original `coord.xy / coord` expression or `/` token according to the final mapping policy.
- The diagnostic does not expose internal helper names in its user-facing message.
- No `Expr<never>` result is accepted silently.

**Done when**

Invalid division gives one understandable source-ranged error.

**Result — complete**

The checker adapter now recognizes TypeScript 7's no-overload diagnostic when it occurs within a generated `__shdr_internal_div` call. It expands the generated diagnostic from the highlighted operand to the complete helper call, maps that call through the expression mapping to the original binary expression, and publishes a sanitized operator message built from TypeScript's inferred operand types. Internal helper names remain private.

The invalid-project fixture verifies exactly one relevant diagnostic for `coord.xy / coord`, mapped to that complete original expression with the message `Operator "/" cannot be applied to types "Expr<Vec2<F32>>" and "Expr<Vec4<F32>>".` The underlying TypeScript recovery type is not `Expr<never>`, and the overload failure is always surfaced rather than accepted silently.

## Step 3.3 — Implement QuickInfo mapping

**Work**

Map an original hover position into virtual source, request QuickInfo, and map the returned span back to original source.

Limit the POC to identifiers and supported property accesses inside the callback. Delegate positions outside the callback unchanged.

**Automated verification**

Assert QuickInfo for:

- `coord`
- `coord.xy`
- `uniforms.resolution`
- `uv` at its declaration
- `uv` at later references
- `uv.x`

Assert exact display text only against the pinned TypeScript version.

**Done when**

The target source reports `uv` as `Expr<Vec2<F32>>` at original source positions.

**Result — complete**

`CheckedVirtualSource.getQuickInfoAtOriginalPosition()` now maps an original identifier or property-access position into generated source, asks the TypeScript 7 checker for type and symbol information, and maps the returned identifier span back to original coordinates. Only identity-backed identifier spans are returned, preventing generated helper names from appearing when hovering rewritten operators or numeric literals. Property-access punctuation is normalized to the property name. Positions outside the callback follow the same identity path and retain ordinary TypeScript information and ranges.

Pinned TypeScript 7.0.2 tests cover `coord`, `coord.xy`, `uniforms.resolution`, `uv` at its declaration and later reference, and `uv.x`. They also verify property-dot normalization, unchanged QuickInfo outside the callback, and no QuickInfo for the rewritten `/` token.

## Step 3.4 — Implement semantic diagnostic routing

**Work**

Create a routing layer that:

- Preserves original syntactic diagnostics
- Uses virtual semantic diagnostics for the complete shader callback
- Uses original semantic diagnostics outside the callback
- Adds core shader diagnostics
- Removes native cascading errors from the original callback
- Deduplicates diagnostics crossing the callback boundary

Keep this logic independent of the concrete TypeScript 7 editor adapter so it can be unit tested directly.

**Automated verification**

Cover:

- Valid shader callback with native `/` and `uv.x` errors hidden
- Invalid shader division surfaced once
- Unsupported shader syntax surfaced by the core
- An ordinary TypeScript error before the callback preserved
- An ordinary TypeScript error after the callback preserved
- A syntactic error preserved

**Done when**

One diagnostic API produces the intended combined view without leaking internal helper diagnostics.

**Result — complete**

`routeShaderDiagnostics()` is a pure routing layer over project-owned ranges and diagnostic records; it has no TypeScript 7 session or editor dependency. It preserves all original syntactic diagnostics, keeps original semantic diagnostics only outside the callback, maps virtual semantic diagnostics only into the callback, adds sanitized shader-operation and core diagnostics, suppresses original callback cascades and cross-boundary semantic diagnostics, and deduplicates equivalent results. Generated-only and internal-helper diagnostics are dropped when they cannot map safely.

Unit tests cover native `/` and `uv.x` cascades being hidden, ordinary errors before and after the callback, mapped and deduplicated virtual callback errors, one invalid-division diagnostic, unsupported syntax from the core, preservation of a native syntactic error without a duplicate core parser error, and removal of helper import/name diagnostics.

## Step 3.5 — Implement the TypeScript 7 editor adapter

**Work**

Implement the editor integration path proven in Step 3.0. Expose only the capabilities required for the POC:

- Semantic diagnostics
- Syntactic diagnostics if routing requires them
- QuickInfo or hover information

Cache virtual files and checker state by source/project version. Delegate unsupported behavior to TypeScript 7's normal editor tooling. Keep native API or protocol details inside `@shdr/language-service`.

**Automated verification**

Exercise the adapter through the narrowest realistic test harness available for the selected TypeScript 7 integration and verify:

- Shader requests route through virtual source.
- Non-shader files delegate unchanged.
- Updating a source snapshot invalidates cached virtual state.
- No TypeScript 6 compiler or tsserver package is loaded.

**Done when**

The package exposes a TypeScript 7-compatible editor adapter whose routing behavior is covered without relying only on manual VS Code testing.

**Result — complete**

`TypeScript7EditorAdapter` now provides the editor-facing document API for diagnostics and QuickInfo. For `.shdr.ts`, it checks both original and virtual snapshots, routes them through `routeShaderDiagnostics()`, maps hover information, and retains core diagnostics when transformation fails. Recognized-but-invalid callbacks carry `shaderRegion` routing metadata without exposing partial virtual source. Non-shader files return an explicit delegation result so the standard TypeScript provider remains their sole owner.

Document results are cached by resolved file name, source version, project version, and source text. Source changes replace and dispose stale original/virtual snapshots; project-version changes dispose all document state and recreate the TypeScript 7 checker. Tests cover shader routing and hover, explicit non-shader delegation, source and project cache invalidation, mapped invalid division, unsupported callback syntax, preserved TypeScript syntax errors, pinned TypeScript 7.0.2 resolution, and absence of loaded TypeScript 6 or tsserver modules.

The VS Code fixture now consumes this adapter instead of importing TypeScript's unstable API or implementing checker logic itself. Its thin provider converts compiler-independent diagnostics and QuickInfo to VS Code objects, watches `tsconfig.json` to advance the project version, and leaves non-shader language IDs untouched. The real Extension Development Host diagnostics-and-hover test passes through this packaged integration.

## Step 3.6 — Create the real editor fixture

**Work**

Create `apps/editor-fixture` containing:

- The target `gradient.shdr.ts`
- An invalid shader variant or an easy documented edit
- An ordinary TypeScript file with a deliberate test location
- The configuration required to activate `@shdr/language-service` through the selected TypeScript 7 integration
- Workspace instructions for selecting the pinned TypeScript 7 version

Do not claim standalone `tsc --noEmit` support.

**Manual verification**

In VS Code:

1. Use the workspace TypeScript 7 version.
2. Restart the TypeScript editor service or extension.
3. Open `gradient.shdr.ts`.
4. Confirm no native `/` or cascading `uv.x` errors are surfaced.
5. Hover `uv` and confirm `Expr<Vec2<F32>>`.
6. Change the division to `coord.xy / coord` and confirm one mapped diagnostic.
7. Restore it and test nested division.
8. Confirm an ordinary TypeScript error outside the callback still appears.

Record the pinned VS Code and TypeScript versions used for the successful run.

**Done when**

The complete editor checklist passes against the real TypeScript 7 editor service.

**Result — complete**

`apps/editor-fixture` now contains the target shader, a mapped invalid-division variant, an ordinary TypeScript provider fixture, pinned workspace settings, and complete setup/manual-verification instructions. The Extension Development Host test automates initial diagnostic and hover behavior, a live edit to invalid division, restoration through valid nested division, the standalone invalid fixture, and ordinary `.ts` provider ownership. The successful run used VS Code 1.127.0 and TypeScript 7.0.2. The fixture explicitly documents that standalone `tsc --noEmit` does not receive shader semantics.

## Phase 3 gate — Go/no-go decision

Proceed only if all of the following are true:

- Operator syntax remains unchanged in source.
- Correct QuickInfo appears in VS Code.
- Native arithmetic and cascade errors are hidden inside the callback.
- Invalid shader division produces a mapped diagnostic.
- Ordinary TypeScript diagnostics remain intact elsewhere.

If the gate fails, document exactly which TypeScript 7 editor capability is missing before investing in IR or GLSL generation.

**Gate result — go**

All five conditions pass in the real VS Code fixture: source operator syntax is unchanged, `uv` reports `Expr<Vec2<F32>>`, callback-native cascades are absent, invalid division produces one source-mapped sanitized diagnostic, and ordinary TypeScript diagnostics and hovers remain intact outside the shader boundary and in ordinary `.ts` files.

---

# Phase 4 — Shader semantics and typed IR

## Step 4.0 — Generalize syntax and virtual operations without expanding the language

**Work**

Refactor the existing division- and constructor-specific internal representation before semantic lowering depends on it:

- Replace `ShaderDivisionExpressionSyntax` with an operator-neutral binary-expression node carrying a `ShaderBinaryOperator` whose only accepted value remains `"/"`.
- Replace `ShaderConstructorCallSyntax` with a direct call-expression node carrying its callee name and arguments. Classify constructors and future built-in functions during semantic analysis rather than in normalized syntax.
- Rename constructor-only import and validation records to shader-callable terminology while preserving the current `createFragmentShader` and `vec4` import boundary.
- Add compiler-owned virtual-operation metadata that records each generated binary operation's operator plus original and generated ranges, including nested operations.
- Replace division-specific language-service diagnostic discovery with operator-neutral routing driven by that metadata. TypeScript 7 API types remain private to the checker adapter.
- Add exhaustive checks to project-owned syntax visitors so new node kinds produce compile-time failures in every transformer or analyzer that must handle them.

Do not accept any new statements, operators, calls, properties, imports, or callback forms in this step. Preserve current generated source, source mappings, diagnostics, QuickInfo, and editor behavior.

**Automated verification**

Update the existing parser, transformation, mapping, checker, routing, and real-editor tests. Add focused assertions that:

- `/` normalizes as a generic binary expression.
- `vec4(...)` normalizes as a generic direct call.
- Nested divisions produce distinct, correctly ranged virtual-operation records.
- Invalid division still produces one sanitized source-mapped diagnostic without helper leakage.
- Unsupported operators and calls remain unsupported.

**Done when**

No project-owned normalized syntax node or language-service operator diagnostic path is structurally named for division or constructors, while the accepted POC language and observable editor behavior remain unchanged.

**Result — complete**

Normalized syntax now uses generic binary-expression and direct call-expression nodes. Binary syntax and virtual metadata share the closed `ShaderBinaryOperator` value `"/"`; call nodes carry a callee name and ordered arguments. Parser import records and validation use shader-callable terminology while preserving the strict `createFragmentShader` and `vec4` boundary and existing user-facing diagnostics.

Each generated binary helper call now has compiler-owned `VirtualOperation` metadata containing its operator and exact original/generated ranges, including independent nested-operation records. The TypeScript 7 checker discovers and sanitizes overload failures from this metadata rather than helper names or division-specific syntax. A nested invalid-operation test verifies that the smallest containing operation receives the diagnostic. Syntax transformers use exhaustive project-owned node switches.

Core, language-service, workspace build/check/test, and the real VS Code Extension Development Host checklist pass with unchanged generated source, mappings, diagnostics, QuickInfo, and accepted language.

## Step 4.1 — Define source-ranged shader types and IR

**Work**

Define the minimal IR for:

- Numeric literals
- Built-in inputs
- Default uniforms
- Local references
- Swizzles
- Binary operations, with `"/"` as the only accepted operator
- Calls classified as constructors or built-in functions, with `vec4` as the only accepted target
- `const` declarations
- Final return

Represent shader value types dimensionally as scalar or vector records so the IR can represent vector sizes 2, 3, and 4 even though the accepted POC source currently produces only `F32`, `Vec2<F32>`, and `Vec4<F32>`. Represent binary expressions, calls, and swizzles with generic structural nodes rather than division-, `vec4`-, or fixed-property-specific shapes. Keep their accepted operator, target, and component sets closed to the current POC.

Keep the IR target-neutral: represent semantic built-ins such as fragment position and default uniforms without GLSL or WGSL spellings, resource bindings, declarations, or coordinate conversions. Define fragment position semantically as top-left-origin pixel coordinates with +X right, +Y down, half-integer pixel centers, and `0..1` fragment depth. Both backends must consume the exact same IR object, and target-specific generation must not mutate it.

Every expression must carry a resolved shader type and original source range. Keep TypeScript and Babel AST nodes out of the public IR.

**Automated verification**

Construct one IR module directly in a test and assert its type relationships, dimensional vector representation, generic binary/call/swizzle nodes, target-neutral built-in and uniform records, absence of target-language names, and serializable shape.

**Done when**

The target shader can be represented without TypeScript-specific nodes.

**Result — complete**

`@shdr/core` now exports a serializable, target-neutral shader IR. `ShaderValueType` distinguishes `f32` scalars from dimensioned vectors of size 2, 3, or 4. The expression union contains generic numeric literal, built-in input, default uniform, local reference, swizzle, binary, and classified call nodes; every expression carries a resolved value type and original source range. Swizzles store component indices, binary nodes share `ShaderBinaryOperator`, constructor and future built-in calls share one call shape, and local declarations/references share module-local symbol IDs.

`ShaderModule` contains a fragment stage and an ordered union of source-ranged const-declaration and return statements. Target concepts remain semantic (`fragment-position`, `resolution`, `mouse`, and `time`): no GLSL/WGSL names, bindings, declarations, or coordinate conversions appear in the IR. A directly constructed target-shader module verifies node relationships, dimensional `Vec3` representability without source-language support, complete expression ranges, JSON serialization, exhaustive traversal, and absence of target spellings.

## Step 4.2 — Lower built-ins, uniforms, literals, and locals

**Work**

Lower:

- `coord`
- `uniforms.resolution`, `.mouse`, and `.time`
- Numeric literals
- `const` declarations
- Local references
- Final return

Maintain a local symbol table and reject unknown or forward references.

**Automated verification**

Add focused IR assertions for each expression category and diagnostics for unknown identifiers, invalid uniform names, duplicate locals, and references before declaration. Assert that fragment position is represented by a target-neutral semantic identifier without coordinate conversion or backend naming.

**Done when**

The non-operator structure of the target shader lowers into source-ranged IR.

**Result — complete**

`lowerShaderSyntax()` now converts normalized callback syntax into a target-neutral `ShaderModule` for the completed semantic subset. It lowers numeric literals to `f32`, `coord` to the semantic `fragment-position` built-in with `Vec4<f32>` type, and `uniforms.resolution`, `.mouse`, and `.time` to typed default-uniform references. Normalized callback syntax now retains the complete final-return range so IR statements and expressions both preserve original-source coordinates.

Declarations are processed sequentially through a module-local symbol table. Successful const declarations receive stable numeric symbol IDs, and local-reference nodes retain both source names and declaration IDs while sharing the resolved initializer type. Lowering reports dedicated source-ranged diagnostics for unknown identifiers/closure captures, forward and self references, duplicate/context-conflicting locals, bare `uniforms`, and unknown default uniforms. Tests cover every completed expression category, symbol/type relationships, exact source ranges, deterministic final-return lowering, target-name isolation, and all required failure cases.

## Step 4.3 — Lower and type swizzles

**Work**

Support `.x`, `.y`, and `.xy` on the allowed vector types. Move the current property-name whitelist out of structural syntax validation: semantic analysis must classify uniform access versus swizzling and reject unknown uniforms, unavailable components, unsupported swizzle spellings, and scalar swizzles. Keep the accepted property set unchanged.

**Automated verification**

Test every accepted type/property pair and representative rejected pairs. Assert both inferred IR type and source-ranged diagnostic.

**Done when**

Swizzle semantics match the public TypeScript expression types.

**Result — complete**

Direct, non-computed property access is now normalized structurally without a global property-name whitelist. Semantic lowering first distinguishes direct `uniforms.<name>` access from value swizzles, then recursively lowers the swizzle receiver and validates its resolved shader type. On both `Vec2<f32>` and `Vec4<f32>`, `.x` and `.y` lower to `f32` and `.xy` lowers to `Vec2<f32>` using component-index IR (`0`, `1`, and `[0, 1]`). The same rules apply through local references and nested property expressions.

`SHDR1204` reports precise property-name ranges for scalar swizzles, components unavailable on the receiver dimension, and well-formed but unsupported POC swizzle spellings. Unknown uniform names remain `SHDR1203` semantic diagnostics now that arbitrary direct property names reach lowering. Tests cover every accepted vector-type/property pair, vector locals, representative scalar/unavailable/unsupported failures, structural-versus-semantic validation ownership, and matching positive/negative public `Expr<T>` TypeScript types.

## Step 4.4 — Lower and type division

**Work**

Implement the exact division matrix from the specification in the shader semantic analyzer.

**Automated verification**

Create a single parity matrix that runs every valid and invalid pair through:

1. Virtual TypeScript checking
2. Shader semantic analysis

Assert that both systems agree on success/error and result type.

**Done when**

No division rule exists in only one of the two type systems.

**Result — complete**

Semantic lowering now recursively lowers both operands of a binary expression and resolves `/` through the exact closed matrix: `F32/F32`, `Vec2/F32`, `Vec2/Vec2`, `Vec4/F32`, and `Vec4/Vec4`. Successful operations produce generic `ShaderBinaryExpression` IR with the original operator-expression range and the resolved scalar/vector result type. `SHDR1205` rejects all other dimension combinations on the complete source expression with the same sanitized operand-type message used by the TypeScript 7 adapter.

One nine-case parity matrix exercises every `F32`, `Vec2`, and `Vec4` left/right pair through both virtual TypeScript checking and semantic lowering, comparing acceptance, result types, diagnostic messages, and source ranges. A focused core test additionally verifies that nested left-associative division produces the corresponding nested binary IR, exact inner/outer ranges, and propagated result types.

## Step 4.5 — Lower and type `vec4`

**Work**

Support four initial `vec4` constructor forms:

```ts
vec4(x: Expr<F32>, y: Expr<F32>, z: Expr<F32>, w: Expr<F32>)
vec4(xy: Expr<Vec2<F32>>, z: Expr<F32>, w: Expr<F32>)
vec4(value: Expr<F32>)
vec4(value: Expr<Vec4<F32>>)
```

All forms produce `Expr<Vec4<F32>>` through the TypeScript 7 checker adapter and `Vec4<F32>` in IR. The unary scalar form has splat semantics; the unary `Vec4` form has copy/identity semantics. Represent constructor arguments as an ordered expression list rather than scalar-specific fields. Require the final callback result to be `Vec4<F32>`. Do not add `Vec3`, mixed component packing, or other GLSL constructor combinations in this step.

**Automated verification**

Create a constructor parity matrix that runs four-scalar construction, `vec4(uv.xy, 0, 1)`, scalar splat, `Vec4` copy, wrong arity, and unsupported vector argument combinations through both the TypeScript 7 checker and shader semantic analysis. Also test unsupported call targets, inferred result types, and invalid final return type.

**Done when**

All four supported `vec4` forms lower to the same typed constructor IR shape with no diagnostics, and the complete target shader lowers to a typed IR module with no diagnostics.

**Result — complete**

The public `shdr` package and semantic lowerer now support exactly the four-`F32`, `Vec2<F32>`-plus-two-`F32`, scalar-splat, and `Vec4<F32>` copy/identity `vec4` forms. Calls recursively lower an ordered argument list, are semantically classified as the `vec4` constructor, and produce generic call IR with resolved `Vec4<f32>` type and the complete original call range. This includes full lowering of the idiomatic target form `vec4(uv.xy, 0, 1)` after `uv` division and swizzle lowering.

`SHDR1206` reports unmatched constructor arity/type combinations on the call, while unsupported semantic call targets retain a callee-ranged `SHDR1106`. `SHDR1207` requires the final callback expression to resolve to `Vec4<f32>`. An eight-case constructor parity matrix verifies all four valid forms and representative invalid arity/vector placements against the real TypeScript 7 overloads. Core and public type tests cover ordered call IR, unary splat and copy calls, local return linkage, unsupported targets, invalid final returns, and the absence of a permissive emitted implementation signature.

## Step 4.6 — Stabilize target-neutral lowering through typed IR

**Work**

Expose `lowerFragment(source)` as the target-neutral lowering boundary used by `compileFragment`, returning typed IR and original-source diagnostics. Code generation may still be absent. Keep lowering independent of the eventual GLSL/WGSL target-selection API so source is parsed and typed once before backend generation.

**Automated verification**

Assert the complete IR for the target shader and focused properties rather than relying only on a large snapshot.

**Done when**

One core API parses, validates, types, and lowers the target source deterministically.

---

# Phase 5 — GLSL ES 3.00 and WGSL generation

## Step 5.1 — Emit GLSL expressions

**Work**

Generate GLSL for:

- Float literals, normalized to valid GLSL float syntax
- Canonical top-left fragment position constructed from `gl_FragCoord`, with Y converted as `u_resolution.y - gl_FragCoord.y`
- Uniform references, including the implicit `resolution` dependency introduced by fragment-position conversion
- Local references
- Swizzles
- Division with correct grouping
- `vec4` construction

Prefer correctness over minimal parentheses.

**Automated verification**

Add expression-level tests, including nested division and `1 / 2`. Verify generated numeric literals such as `0.0` and `1.0`. Assert the GLSL coordinate conversion preserves half-integer pixel centers and maps top and bottom rows to the canonical top-left orientation.

**Done when**

Every expression IR node has deterministic valid GLSL output.

## Step 5.2 — Emit the GLSL fragment module

**Work**

Generate:

- `#version 300 es` as the first directive
- Precision declaration
- Explicitly or backend-implicitly referenced default uniforms only
- `out vec4 shdr_fragment_color`
- Local declarations with resolved GLSL types
- Final output assignment

**Automated verification**

Snapshot the complete expected target shader and assert that unused `mouse` and `time` uniforms are omitted. Add a shader that references `coord` without explicitly reading `uniforms.resolution` and assert that GLSL still emits `u_resolution` for coordinate conversion.

**Done when**

The target source produces the expected standalone fragment shader.

## Step 5.3 — Validate generated GLSL in WebGL 2

**Work**

Create a minimal browser test harness with a hard-coded fullscreen-triangle vertex shader. Compile and link the generated fragment shader in a real WebGL 2 context and capture compile/link logs.

**Automated verification**

Run the browser test and assert:

- A WebGL 2 context is available.
- Vertex and fragment compilation succeed.
- Program linking succeeds.
- Shader logs are empty or contain no errors.

Provide a manual fallback command if CI WebGL is unavailable, but keep the automated test enabled where supported.

**Done when**

A browser GPU driver accepts the generated GLSL shader.

## Step 5.4 — Emit WGSL from the same typed IR

**Work**

Add a WGSL backend for the complete accepted POC IR:

- Float literals
- Fragment position
- Default uniforms
- Local references and declarations
- Swizzles
- Division with correct grouping
- Both supported `vec4` constructor forms
- A fragment entry point returning `@location(0) vec4<f32>`

Define a deterministic POC bind-group/binding layout for referenced default uniforms. Use WebGPU fragment position directly for the DSL's canonical top-left framebuffer coordinates; do not introduce an implicit WGSL `resolution` dependency unless source semantics require it. Keep all WGSL spellings, attributes, bindings, and layout rules out of the IR.

**Automated verification**

Add expression-level and complete-module WGSL snapshots. Assert explicit WGSL type spellings, deterministic bindings, correct constructor forms, valid numeric literals, direct fragment-position use, no unnecessary coordinate conversion, and the required fragment entry-point attributes.

**Done when**

The target shader's existing typed IR deterministically generates a standalone WGSL fragment module without GLSL-specific data being added to the IR.

## Step 5.5 — Prove backend parity at the IR boundary

**Work**

Lower the target source once and pass the exact same typed IR object to both generators. Neither generator may mutate it. Keep backend selection in code generation rather than parsing, validation, or semantic analysis.

**Automated verification**

Deep-freeze one lowered module, generate GLSL and WGSL from it, and assert:

- Both generators succeed from that object.
- Source ranges and resolved shader types remain unchanged.
- GLSL contains no WGSL attributes or type syntax.
- WGSL contains no GLSL directives, storage qualifiers, or `gl_FragCoord`.
- Backend-specific coordinate handling does not alter the IR.
- Repeated and differently ordered generation is deterministic.

**Done when**

One semantic result demonstrably supports both target languages without target-conditioned lowering.

## Step 5.6 — Complete the multi-target compile API

**Work**

Finalize the public multi-target boundary:

- `lowerFragment(source)` returns target-neutral typed IR and original-source diagnostics.
- `generateFragment(ir, target)` emits `"glsl-es-300"` or `"wgsl"` from an existing IR.
- `compileFragment(source, { target })` is the single-target convenience API returning generated output, IR, and diagnostics.

Do not infer a target from ambient browser capabilities. Define behavior clearly for unsuccessful compilation, such as omitting generated output and optionally retaining partial IR.

**Automated verification**

Test lowering once followed by both generators, both `compileFragment` targets, successful compilation, syntax failure, semantic failure, unknown runtime target values, and deterministic repeated compilation. Assert that selecting a target changes only code generation.

**Done when**

Consumers can compile one fragment source to either target without using internal compiler functions or changing semantic results.

---

# Phase 6 — Vite integration

## Step 6.1 — Implement the Vite transform

**Work**

Create a Vite plugin that:

- Runs with `enforce: "pre"`
- Recognizes `.shdr.ts` IDs while handling Vite query strings
- Calls `compileFragment` with the explicit `"glsl-es-300"` target
- Converts diagnostics to Vite errors with source locations
- Returns JavaScript module source using `JSON.stringify` for safe string escaping
- Returns no source map for the POC

**Automated verification**

Call the plugin transform hook in isolation and assert:

- Non-shader files return `null`.
- Valid shader files return `export default "..."` JavaScript.
- Generated output contains no original `shdr` import.
- Invalid shader files throw a correctly located Vite error.

**Done when**

Vite receives valid JavaScript rather than raw GLSL or untransformed shader TypeScript.

## Step 6.2 — Create the vanilla Vite fixture

**Work**

Create `apps/vite-basic` using vanilla TypeScript. Import `gradient.shdr.ts`, create a WebGL 2 canvas, compile the shader, and bind `u_resolution`.

Do not run ordinary `tsc --noEmit` over the shader file; document the standalone TypeScript limitation.

**Automated verification**

```sh
pnpm --filter vite-basic build
```

Assert the production bundle contains the generated GLSL and not the original operator expression.

**Done when**

A production Vite build imports the shader as `FragmentShaderSource` and completes successfully.

## Step 6.3 — Verify Vite development mode

**Work**

Run the fixture through the Vite dev server and verify the pre-transform is used during module requests. Add a basic shader-file edit/reload check; full HMR state preservation is not required.

**Verification**

- Automated request test against the Vite dev server
- Manual edit of `gradient.shdr.ts` followed by a successful browser reload

**Done when**

Both Vite development and production use the same `@shdr/core` compilation path.

## Step 6.4 — Add the rendered-gradient browser test

**Work**

Use Playwright to load `vite-basic`, wait for a successful draw, and sample representative canvas pixels with tolerance.

**Automated verification**

Assert:

- No shader compile or link error is shown.
- The center pixel is approximately half red and half green.
- Top- and bottom-row samples confirm top-left-origin Y semantics.
- Blue is approximately zero.
- Alpha is opaque.

**Done when**

The DSL source is proven end-to-end from Vite transform to GPU pixels.

---

# Phase 7 — Browser REPL

## Step 7.1 — Create the minimal REPL UI

**Work**

Create `apps/repl` with:

- A textarea containing the target shader source
- Generated-output panes or a target selector for GLSL ES 3.00 and WGSL
- A diagnostics pane shared by both targets
- Per-target validation status
- A compile button or debounced input handler

Lower the source once per edit and generate both outputs from that semantic result.

Do not add Monaco or a framework requirement solely for the POC.

**Manual verification**

Edit the source and confirm that both generated outputs and shared diagnostics update without a server-side compiler call.

**Done when**

The target-neutral compiler and both generators run directly in the browser bundle.

## Step 7.2 — Validate both targets and render GLSL output

**Work**

Reuse the WebGL 2 renderer from `vite-basic`. On successful compilation, compile/link and render the generated GLSL fragment shader. Preserve the last successful render when the current source is invalid.

When `navigator.gpu` is available, request a device, create a shader module from the generated WGSL, inspect `getCompilationInfo()`, and show errors or success in the REPL. WGSL/WebGPU rendering is not required. If WebGPU is unavailable, show a clear manual-validation limitation rather than reporting success.

**Automated verification**

A WebGL browser test edits a literal, recompiles, and confirms the canvas output changes. Add focused tests for target selection and validation-result display. Run WGSL browser compilation where the test environment exposes WebGPU; otherwise record the pinned manual browser result.

**Manual verification**

In a WebGPU-capable browser, compile the target source, inspect both generated outputs, confirm GLSL renders successfully, and confirm WGSL module compilation reports no errors.

**Done when**

The browser can compile one source through the shared core, validate both generated shader languages, and render the GLSL result.

## Step 7.3 — Bind all default uniforms

**Work**

Provide runtime values for:

- `resolution`
- `mouse`
- `time`

Define `coord` and mouse coordinates with one target-neutral top-left pixel origin, +X right, +Y down, and half-integer pixel centers. Browser pointer values enter this convention without a Y flip. Resize the canvas and viewport consistently. Assert that the WGSL mapping uses fragment position directly and the GLSL generator performs the required `resolution.y - gl_FragCoord.y` conversion.

**Automated verification**

Add small renderer tests or browser assertions showing that each uniform location is bound when explicitly or implicitly referenced. Add top/bottom coordinate-orientation assertions and one manual example for `time` or `mouse` only if the current shader subset can express a visible use.

**Done when**

All fixed POC uniforms have documented, consistent runtime behavior.

## Step 7.4 — Confirm core browser boundaries

**Work**

Audit `@shdr/core` and both code generators for Node-only imports and filesystem access. Measure and record the REPL production bundle size, including Babel Parser and both backends.

**Automated verification**

```sh
pnpm --filter repl build
```

The browser build must complete without Node polyfills.

**Done when**

The same core package runs under both Vite’s Node process and the browser.

---

# Phase 8 — POC closeout

## Step 8.1 — Run the complete acceptance suite

**Automated verification**

Run from a clean checkout:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm test
```

Then run the Vite and REPL browser tests.

**Manual verification**

Repeat the Phase 3 VS Code checklist using the pinned workspace TypeScript version. In the browser REPL, record successful GLSL rendering and successful WGSL shader-module compilation from the same source and IR.

**Done when**

Every final acceptance criterion in `spec.md` has a passing automated test or an explicitly recorded manual result.

## Step 8.2 — Document known limitations and usage

**Work**

Replace the starter README with:

- The target DSL example
- Workspace commands
- VS Code workspace-TypeScript setup
- Vite plugin setup and its explicit GLSL target
- Multi-target REPL instructions
- The standalone `tsc` limitation
- The exact supported syntax and both shader targets
- Default uniform and cross-target coordinate semantics
- WGSL generation and the WebGPU-rendering non-goal

Link to the specification and this plan rather than duplicating detailed design material.

**Verification**

Follow the README from a clean checkout without relying on undocumented local setup.

**Done when**

Another developer can run the editor fixture, Vite demo, and REPL from the README alone.

## Step 8.3 — Record the POC decision

**Work**

Write a short outcome document containing:

- Whether the editor hypothesis succeeded
- What remained fragile
- TypeScript and VS Code versions tested
- GLSL/WebGL and WGSL/WebGPU compilation results
- Same-IR backend parity result
- Bundle-size observation
- Recommended next milestone
- Whether to pursue standalone `tsc` integration

**Done when**

The repository contains enough evidence to make a go/no-go decision without reconstructing the experiment from commit history.

---

# Phase gates summary

| Gate           | Required evidence                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Editor gate    | Real VS Code hover, suppressed native errors, mapped invalid-operation diagnostic, unaffected ordinary TypeScript     |
| Compiler gate  | Target source lowers to target-neutral typed IR; virtual TypeScript and semantic analyzer pass the same rule matrices |
| GLSL gate      | Generated GLSL ES 3.00 compiles and links in WebGL 2                                                                  |
| Backend gate   | The same frozen IR generates GLSL and WGSL while preserving canonical top-left coordinates and `0..1` fragment depth  |
| Vite gate      | Development and production GLSL transforms render the expected gradient                                               |
| Browser gate   | The same core generates both targets, renders GLSL, and compile-validates WGSL in the browser                         |
| POC completion | Clean full test run, documented manual editor verification, and recorded outcome                                      |
