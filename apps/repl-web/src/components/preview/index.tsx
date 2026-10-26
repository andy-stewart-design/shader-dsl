import type { UseShdrPreviewOptions } from "../../hooks/use-shdr-preview";
import { useShdrPreview } from "../../hooks/use-shdr-preview";
import s from "./style.module.css";

export type PreviewProps = UseShdrPreviewOptions;

export function Preview({ artifact, onError }: PreviewProps) {
  const previewRef = useShdrPreview({ artifact, onError });

  return <div className={s.preview} ref={previewRef} />;
}
