import type { UseShdrPreviewOptions } from "../../hooks/use-shdr-preview";
import { useShdrPreview } from "../../hooks/use-shdr-preview";
import s from "./style.module.css";

export type PreviewProps = UseShdrPreviewOptions;

export function PreviewCanvas({ artifact, playing, onError }: PreviewProps) {
  const previewRef = useShdrPreview({ artifact, playing, onError });

  return <div className={s.preview} ref={previewRef} />;
}
