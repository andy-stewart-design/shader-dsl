import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createWebGlRenderer } from "@shdr/runtime/webgl";
import type { CompiledFragmentArtifact } from "shdr";

interface ShaderViewerProps {
  readonly artifact: CompiledFragmentArtifact;
  readonly source: string;
  readonly title: string;
}

type TabId = "source" | "glsl" | "wgsl";

interface Tab {
  readonly id: TabId;
  readonly label: string;
  readonly language: string;
  readonly code: string;
}

export default function ShaderViewer({
  artifact,
  source,
  title,
}: ShaderViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewError, setPreviewError] = useState<string>();
  const [activeTab, setActiveTab] = useState<TabId>("source");
  const [copied, setCopied] = useState(false);

  const tabs: readonly Tab[] = [
    {
      id: "source",
      label: "Shdr source",
      language: "TypeScript",
      code: source,
    },
    {
      id: "glsl",
      label: "Compiled GLSL",
      language: "GLSL ES 3.00",
      code: artifact.glsl,
    },
    {
      id: "wgsl",
      label: "Compiled WGSL",
      language: "WGSL",
      code: artifact.wgsl,
    },
  ];
  const selectedTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]!;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const controller = new AbortController();
    let renderer: { dispose: () => void } | undefined;
    let disposed = false;
    setPreviewError(undefined);

    void createWebGlRenderer(canvas, artifact, {
      animate: true,
      signal: controller.signal,
      onError: (error) => {
        if (!disposed) setPreviewError(error.message);
      },
    }).then(
      (created) => {
        if (disposed || controller.signal.aborted) {
          created.dispose();
          return;
        }
        renderer = created;
      },
      (error: unknown) => {
        if (disposed || controller.signal.aborted) return;
        setPreviewError(
          error instanceof Error
            ? error.message
            : "The shader could not be rendered.",
        );
      },
    );

    return () => {
      disposed = true;
      controller.abort();
      renderer?.dispose();
    };
  }, [artifact]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(selectedTab.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight")
      nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    setActiveTab(tabs[nextIndex]!.id);
    document.getElementById(`shader-tab-${tabs[nextIndex]!.id}`)?.focus();
  }

  return (
    <section
      className="viewer"
      aria-label={`${title} shader preview and source`}
    >
      <div className="preview-frame">
        <canvas
          ref={canvasRef}
          className="shader-canvas"
          aria-label={`Animated ${title} preview`}
        />
        {previewError ? (
          <div className="preview-error" role="alert">
            <strong>Preview unavailable</strong>
            <span>{previewError}</span>
          </div>
        ) : null}
        <span className="preview-badge">WebGL · live</span>
      </div>

      <div className="code-panel">
        <div className="code-panel-header">
          <div>
            <p className="eyebrow">Source &amp; output</p>
            <h2>See how it is made</h2>
          </div>
          <button className="copy-button" type="button" onClick={copyCode}>
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>
        <div className="tabs" role="tablist" aria-label="Shader code formats">
          {tabs.map((tab) => (
            <button
              className="tab"
              id={`shader-tab-${tab.id}`}
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls="shader-code"
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={moveTab}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div
          className="code-wrap"
          id="shader-code"
          role="tabpanel"
          aria-labelledby={`shader-tab-${selectedTab.id}`}
          tabIndex={0}
        >
          <div className="code-meta">
            <span>{selectedTab.language}</span>
            <span>{selectedTab.code.split("\n").length} lines</span>
          </div>
          <pre>
            <code>{selectedTab.code}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
