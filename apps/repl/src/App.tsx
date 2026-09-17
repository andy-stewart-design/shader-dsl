import { generateFragment, lowerFragment } from "@shdr/core";
import type {
  ShaderDiagnostic,
  ShaderTarget,
  TextRange,
} from "@shdr/core";
import { useState } from "react";
import "./App.css";

const INITIAL_SOURCE = `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const color = vec4(uv.x, uv.y, 0, 1);

  return color;
});
`;

const TARGETS: readonly {
  readonly target: ShaderTarget;
  readonly label: string;
  readonly language: string;
}[] = [
  { target: "glsl-es-300", label: "GLSL ES 3.00", language: "GLSL" },
  { target: "wgsl", label: "WGSL", language: "WGSL" },
];

interface CompilationSuccess {
  readonly ok: true;
  readonly diagnostics: readonly [];
  readonly outputs: Readonly<Record<ShaderTarget, string>>;
}

interface CompilationFailure {
  readonly ok: false;
  readonly diagnostics: readonly ShaderDiagnostic[];
  readonly outputs?: undefined;
}

type Compilation = CompilationSuccess | CompilationFailure;

function App() {
  const [source, setSource] = useState(INITIAL_SOURCE);
  const [compiledSource, setCompiledSource] = useState(INITIAL_SOURCE);
  const [compilation, setCompilation] = useState<Compilation>(() =>
    compileBothTargets(INITIAL_SOURCE),
  );
  const isDirty = source !== compiledSource;

  const compile = () => {
    setCompilation(compileBothTargets(source));
    setCompiledSource(source);
  };

  return (
    <div className="repl-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Shdr proof of concept</p>
          <h1>Fragment shader REPL</h1>
          <p className="subtitle">
            Lower TypeScript-shaped shader source once, then inspect both browser-generated targets.
          </p>
        </div>
        <button className="compile-button" type="button" onClick={compile}>
          Compile both targets
        </button>
      </header>

      <main className="workspace">
        <section className="panel source-panel" aria-labelledby="source-title">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Input</p>
              <h2 id="source-title">Shader source</h2>
            </div>
            <span className={`status ${isDirty ? "status-pending" : "status-ready"}`}>
              {isDirty ? "Uncompiled changes" : "Compiled"}
            </span>
          </div>
          <textarea
            aria-label="Shader source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                compile();
              }
            }}
            spellCheck={false}
          />
          <p className="keyboard-hint">
            Compile with <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd>
          </p>
        </section>

        <section className="panel diagnostics-panel" aria-labelledby="diagnostics-title">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Shared semantic pass</p>
              <h2 id="diagnostics-title">Diagnostics</h2>
            </div>
            <span className={`status ${compilation.ok ? "status-ready" : "status-error"}`}>
              {compilation.ok
                ? "No errors"
                : `${compilation.diagnostics.length} error${compilation.diagnostics.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="diagnostics" aria-live="polite">
            {compilation.ok ? (
              <p className="empty-state">No shared compiler diagnostics.</p>
            ) : (
              <ol>
                {compilation.diagnostics.map((diagnostic, index) => {
                  const location = sourceLocation(compiledSource, diagnostic.range);
                  return (
                    <li key={`${diagnostic.code}-${diagnostic.range.start}-${index}`}>
                      <div>
                        <strong>{diagnostic.code}</strong>
                        <span>{location}</span>
                      </div>
                      <p>{diagnostic.message}</p>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>

        <section className="outputs" aria-label="Generated shader targets">
          {TARGETS.map(({ target, label, language }) => (
            <article className="panel output-panel" key={target}>
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">{language} backend</p>
                  <h2>{label}</h2>
                </div>
                <span
                  className={`status ${compilation.ok ? "status-pending" : "status-error"}`}
                  title={
                    compilation.ok
                      ? "Runtime validation is added in the next REPL step."
                      : "Generation is blocked by shared source diagnostics."
                  }
                >
                  {compilation.ok ? "Generated · validation pending" : "Blocked"}
                </span>
              </div>
              <pre data-target={target}>
                <code>
                  {compilation.ok
                    ? compilation.outputs[target]
                    : "Fix the shared source diagnostics to generate this target."}
                </code>
              </pre>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

function compileBothTargets(source: string): Compilation {
  const lowered = lowerFragment(source);
  if (!lowered.ok) {
    return { ok: false, diagnostics: lowered.diagnostics };
  }

  return {
    ok: true,
    diagnostics: [],
    outputs: {
      "glsl-es-300": generateFragment(lowered.ir, "glsl-es-300"),
      wgsl: generateFragment(lowered.ir, "wgsl"),
    },
  };
}

function sourceLocation(source: string, range: TextRange): string {
  const prefix = source.slice(0, range.start);
  const lines = prefix.split("\n");
  return `Line ${lines.length}, column ${(lines.at(-1)?.length ?? 0) + 1}`;
}

export default App;
