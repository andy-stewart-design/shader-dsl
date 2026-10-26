import { createFileRoute } from "@tanstack/react-router";
import { useCodeEditor } from "../hooks/use-code-editor";

const initialDoc = `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const color = vec4(uv.x, uv.y, 0, 1);

  return color;
});`;

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	const editorRef = useCodeEditor({
		initialDoc,
		ariaLabel: "Shader source",
	});

	return (
		<main className="home-page">
			<header className="home-header">
				<h1>Shdr playground</h1>
				<p>Edit a fragment shader directly in the browser.</p>
			</header>

			<section
				aria-labelledby="shader-source-heading"
				className="home-editor-section"
			>
				<div className="home-editor-heading">
					<h2 id="shader-source-heading">Shader source</h2>
					<span className="home-editor-filename">fragment.shdr.ts</span>
				</div>
				<div className="home-editor-panel">
					<div className="home-editor-host" ref={editorRef} />
				</div>
			</section>
		</main>
	);
}
