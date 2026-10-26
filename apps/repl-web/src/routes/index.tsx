import { createFileRoute } from "@tanstack/react-router";
import { Editor } from "../components/editor";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<main className="home-page">
			<header className="home-header">
				<h1>Shdr playground</h1>
				<p>Edit a fragment shader directly in the browser.</p>
			</header>

			<Editor />
		</main>
	);
}
