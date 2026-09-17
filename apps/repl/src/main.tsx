import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const root = document.querySelector<HTMLDivElement>("#root");
if (!root) throw new Error("The REPL requires a #root element.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
