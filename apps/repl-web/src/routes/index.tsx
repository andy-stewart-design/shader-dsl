import { createFileRoute } from "@tanstack/react-router";
import { Editor } from "../components/editor";
import { Preview } from "../components/preview";
import { useShdrCompilation } from "../hooks/use-shdr-compilation";
import { initialShaderSource } from "../shared/initial-source";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const {
    artifact,
    compileError,
    runtimeError,
    onChange,
    onPreviewError,
    apply,
  } = useShdrCompilation();

  return (
    <main className="home-page">
      <section className="home-editor-pane" aria-label="Shader source editor">
        <Editor initialDoc={initialShaderSource} onChange={onChange} />
        <div className="home-editor-status">
          {compileError ? (
            <pre className="home-error" role="alert">
              {compileError}
            </pre>
          ) : null}
          {runtimeError ? (
            <pre className="home-error" role="alert">
              Preview error: {runtimeError}
            </pre>
          ) : null}
          <div className="home-controls">
            <button type="button" onClick={apply} aria-keyshortcuts="Alt+Enter">
              Apply
            </button>
            <span>Option + Return</span>
          </div>
        </div>
      </section>

      <section className="home-preview-pane" aria-label="Shader preview">
        {artifact ? (
          <Preview artifact={artifact} onError={onPreviewError} />
        ) : null}
      </section>
    </main>
  );
}
