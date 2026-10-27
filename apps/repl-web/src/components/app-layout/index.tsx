import type { ReactNode } from "react";
import s from "./style.module.css";

export interface AppLayoutProps {
  editor: ReactNode;
  preview: ReactNode;
}

export function AppLayout({ editor, preview }: AppLayoutProps) {
  return (
    <main className={s.main}>
      <section className={s.editorPane} aria-label="Shader source editor">
        {editor}
      </section>
      <section className={s.previewPane} aria-label="Shader preview">
        {preview}
      </section>
    </main>
  );
}
