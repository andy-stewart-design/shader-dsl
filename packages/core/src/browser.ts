// Explicit opt-in browser compiler entry. Runtime renderers never import this.
export {
  compileFragmentArtifact,
  type CompileArtifactFailure,
  type CompileArtifactResult,
  type CompileArtifactSuccess,
} from "./compile-fragment-artifact.js";
export type { ShaderGraphDiagnostic } from "./diagnostics.js";
export {
  type ShaderVirtualGraphInput,
  type LowerShaderGraphFailure,
  type LowerShaderGraphResult,
  type LowerShaderGraphSuccess,
} from "./shader-module-graph.js";
