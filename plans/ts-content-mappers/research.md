# TypeScript 7.1 content mappers and Shdr

**Status:** Research / candidate tooling direction. No implementation or extension migration is committed.

## Summary

TypeScript 7.1 content mappers are directly relevant to Shdr: they provide an official integration point for turning a custom source format into virtual TypeScript, with mappings back to the authored source. This is substantially the model our language-service integration already implements manually.

The main compatibility issue is the authoring extension: the implementation reviewed rejects mapper extensions ending in a native TypeScript source extension, including `.shdr.ts`. A prototype would therefore need a foreign extension such as `.shdr`, rather than simply registering our existing suffix.

Content mappers could reduce custom typechecking/editor plumbing. They would not replace the Shdr compiler or add general operator overloading to TypeScript.

## Sources

- [Colin McDonnell's tweet](https://x.com/colinhacks/status/2112649295858118927) — original discovery link, retained for posterity.
- [Announcing TypeScript 7.1 Beta](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/) — particularly **Content Mappers**, **Snapshots**, and **File System APIs**.
- [Content-mapper implementing PR: microsoft/typescript-go#4712](https://github.com/microsoft/typescript-go/pull/4712).
- [Official HTML content-mapper sample](https://github.com/DanielRosenwasser/content-mapper-sample).
- [Sample protocol definitions](https://github.com/DanielRosenwasser/content-mapper-sample/blob/main/dhtml-content-mapper/src/protocol.ts).
- [Reserved source-extension check](https://github.com/microsoft/TypeScript/blob/main/tsc/internal/contentmapper/contentmapper.go) — `HasReservedSourceExtension`.
- [Configuration validation](https://github.com/microsoft/TypeScript/blob/main/tsc/internal/tsoptions/tsconfigparsing.go) — use of the reserved-extension check.
- [Custom-extension resolution limitation: microsoft/TypeScript#64546](https://github.com/microsoft/TypeScript/issues/64546).

These API and implementation links describe beta-era behavior and may change. Recheck against the exact TypeScript version used for any prototype; the branch links above are not immutable snapshots.

## How content mappers work

A project registers a mapper package and source extensions in a top-level `contentMappers` field in `tsconfig.json`. The mapper returns a virtual representation that TypeScript can understand, along with mappings between generated and original source regions.

TypeScript uses that representation for checking and editor services. Mappings allow diagnostics and language-service results to refer back to the authored file rather than generated helper code. The protocol also supports mapper-provided diagnostics in original-source coordinates, not just remapped TypeScript diagnostics.

The announcement describes command-line use through `tsc --runExternalCode`. Content mappers execute external code; editor use also requires the relevant trust and permission settings. The protocol uses an external JSON-RPC/stdio process declared through the mapper package's `typescript.contentMapper.exec` metadata.

## What Shdr already does

### Virtual TypeScript

Shdr's `.shdr.ts` files are TypeScript-shaped, but shader expressions have domain-specific semantics. For example, vector arithmetic needs checking rules that ordinary TypeScript arithmetic does not provide.

Our existing path:

1. Parse and validate the supported shader syntax.
2. Rewrite shader expressions into typed internal helper calls.
3. Check the virtual source in a TypeScript project.
4. Map diagnostics and hover information back to authored source.
5. Combine TypeScript results with Shdr-specific diagnostics.

Relevant implementation:

- [`packages/core/src/create-virtual-source.ts`](../../packages/core/src/create-virtual-source.ts): creates virtual shader TypeScript.
- [`packages/core/src/transform-shader-expressions.ts`](../../packages/core/src/transform-shader-expressions.ts): rewrites arithmetic and other supported shader expressions.
- [`packages/core/src/mapped-text-writer.ts`](../../packages/core/src/mapped-text-writer.ts): records source mappings and operator metadata.
- [`packages/language-service/src/typescript-7-checker.ts`](../../packages/language-service/src/typescript-7-checker.ts): manages virtual files, TypeScript snapshots, checking, and mapped QuickInfo.
- [`packages/language-service/src/diagnostic-routing.ts`](../../packages/language-service/src/diagnostic-routing.ts): routes and sanitizes original-source, generated-source, and core diagnostics.
- [`apps/editor-fixture/src/extension.ts`](../../apps/editor-fixture/src/extension.ts): custom VS Code integration.
- [`packages/lsp/README.md`](../../packages/lsp/README.md): private LSP integration and its current limits.

At the time of this investigation, the project uses TypeScript **7.0.2**, including `typescript/unstable/sync`. It does not have a content-mapper implementation.

### Shader compilation remains separate

Our core compiler validates shader semantics and lowers to target-neutral IR, then generates GLSL and WGSL. CLI checking and Vite integration use that compiler path; they are not simply wrappers around TypeScript's virtual-source checker.

Relevant implementation:

- [`packages/core/src/lower-fragment.ts`](../../packages/core/src/lower-fragment.ts).
- [`packages/core/src/compile-fragment-artifact.ts`](../../packages/core/src/compile-fragment-artifact.ts).
- [`packages/cli/src/check.ts`](../../packages/cli/src/check.ts).
- [`packages/vite/src/index.ts`](../../packages/vite/src/index.ts).

## Potential benefits

- **Standard command-line integration:** let a content-mapper-capable `tsc` check the virtual shader representation as part of the project, instead of requiring our private TypeScript adapter for that work.
- **Standard editor integration:** potentially replace substantial custom diagnostic/hover plumbing and enable more TypeScript language-service features without implementing each one ourselves.
- **Shared transformation:** adapt our existing virtual-source transformation and mappings rather than designing a second shader representation for tooling.
- **Unified diagnostics:** surface core/parser errors through mapper-provided diagnostics alongside mapped TypeScript errors, subject to validating protocol behavior.
- **Less unstable API coupling:** potentially remove some direct dependence on the private TypeScript 7.0 integration APIs.

These are opportunities, not verified feature parity. Existing mapping metadata will need an adapter to the mapper protocol, and the current operator-specific diagnostic sanitization may still need custom handling.

## Constraints and open questions

### 1. `.shdr.ts` is not directly eligible

The reviewed implementation checks registered extensions for native TypeScript source suffixes. Both `.ts` and `.shdr.ts` are rejected. A foreign extension such as `.shdr` is the likely prototype route.

Changing extensions would affect imports, project discovery, syntax highlighting, Vite, fixtures, and documentation. Do not treat this as a drop-in TypeScript upgrade. Revalidate this restriction before choosing a migration strategy.

### 2. Mapping and diagnostic fidelity

We need to preserve ordinary code outside shader regions while exposing transformed shader expressions. Verify mappings for rewritten operators, swizzles, helper functions, imports, and incomplete/invalid edits. Position encoding and source-range conventions must be translated correctly.

The existing checker converts overload failures into source-level operator diagnostics and removes internal helper names. Determine how much of this behavior can be retained through the mapper protocol without keeping a separate checking adapter.

### 3. Cross-file and project behavior

Verify `.shdr` module graphs, explicit imports, `paths` aliases, project references, generated helper imports, file creation/deletion, and snapshot invalidation. Custom extensions are not necessarily tried during extensionless module resolution; explicit extensions may be required.

### 4. Host support and permissions

Validate the exact TypeScript compiler and language-server/editor versions. Announcement support in VS Code does not establish support or installation behavior in every editor, including Zed. External-code execution and workspace trust requirements must be documented for CLI/CI and editor users.

### 5. Compilation is still our responsibility

A virtual TypeScript representation is a checking/tooling model, not GLSL/WGSL compilation. Keep core validation, shader-domain restrictions, typed IR, target generation, and Vite/runtime integration authoritative.

Do not assume TypeScript emit produces a usable Shdr runtime artifact. Any emit/declaration behavior needs a separate experiment and explicit design.

## Recommended next step: bounded proof of concept

Build an isolated mapper for a small `.shdr` fixture before changing the public authoring format or replacing existing tooling.

Acceptance checks:

1. Reuse `createVirtualSource` and adapt its mappings to the protocol.
2. Check valid and invalid vector/scalar arithmetic through `tsc --runExternalCode --noEmit`.
3. Verify source-level diagnostics without leaked internal helper names, including core syntax/semantic errors.
4. Verify hover, completion, navigation, and rename behavior in a supported editor; record limitations rather than assuming parity.
5. Verify a cross-file helper import and a `paths` alias in real project context.
6. Exercise edits that add/remove generated imports and edits containing invalid/incomplete syntax.
7. Keep GLSL/WGSL generation and runtime behavior unchanged through the existing compiler.
8. Record the exact compiler/editor versions, configuration, permissions, and extension-resolution behavior.

The resulting decision should compare the reduction in custom tooling against the cost of moving away from `.shdr.ts`. Until then, retain the existing adapter and keep `shdr check` and ordinary TypeScript checking as distinct tools.

## Relationship to earlier plans

The [completed next-milestone plan](../_completed/next-milestone/plan.md), under **Standalone TypeScript**, explicitly deferred `tsc` integration until an official content-mapping/virtual-file API became viable. TypeScript 7.1 is a concrete reason to revisit that decision, not evidence that the migration is already solved.
