export function downloadSketch(json: string, name: string) {
  const filename =
    name
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "sketch";
  const url = URL.createObjectURL(
    new Blob([json], { type: "application/json" }),
  );
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.json`;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
