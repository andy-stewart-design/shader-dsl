// Explicit opt-in browser compiler entry. Runtime renderers never import this.
export {
  compileFragmentArtifact,
  type CompileArtifactFailure,
  type CompileArtifactResult,
  type CompileArtifactSuccess,
} from "./compile-fragment-artifact.js";
