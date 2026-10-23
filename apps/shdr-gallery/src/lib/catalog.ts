import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  benDayArtifact,
  circlesArtifact,
  horizonArtifact,
  infiniteArtifact,
  mobyArtifact,
  plasmaArtifact,
  screamArtifact,
} from "./artifacts.mjs";
import type { CompiledFragmentArtifact } from "shdr";

export interface ShaderReference {
  readonly slug: string;
  readonly title: string;
  readonly number: string;
  readonly description: string;
  readonly sourceFile: string;
  readonly artifact: CompiledFragmentArtifact;
  readonly source: string;
}

interface ReferenceDefinition extends Omit<
  ShaderReference,
  "artifact" | "source"
> {
  readonly artifact: CompiledFragmentArtifact;
}

// Authored source is read during Astro's server build, never sent through a
// browser loader (the matching artifacts are static Vite imports). The value
// is injected by astro.config.mjs, whose URL remains anchored to the app
// source even when this module is bundled for a production build.
const sourceRoot = resolve(import.meta.env.SHDR_GALLERY_ROOT, "src/shaders");

async function sourceFor(fileName: string): Promise<string> {
  return readFile(resolve(sourceRoot, fileName), "utf8");
}

const definitions: readonly ReferenceDefinition[] = [
  {
    slug: "horizon-burn",
    title: "Horizon Burn",
    number: "01",
    description:
      "A slow-burning horizon with film grain and a warm, atmospheric glow.",
    sourceFile: "horizon-burn.shdr.ts",
    artifact: horizonArtifact,
  },
  {
    slug: "plasma",
    title: "Plasma",
    number: "02",
    description:
      "Layered waves of electric color, drifting through an endless field of plasma.",
    sourceFile: "plasma.shdr.ts",
    artifact: plasmaArtifact,
  },
  {
    slug: "circles-circling",
    title: "Circles Circling",
    number: "03",
    description:
      "Orbiting satellites and soft circles choreographed into a luminous loop.",
    sourceFile: "circles-circling.shdr.ts",
    artifact: circlesArtifact,
  },
  {
    slug: "infinite-squircle",
    title: "Infinite Squircle",
    number: "04",
    description:
      "A geometric study that folds a rounded square into an infinite tunnel.",
    sourceFile: "infinite-squircle.shdr.ts",
    artifact: infiniteArtifact,
  },
  {
    slug: "moby-gradient",
    title: "Moby Gradient",
    number: "05",
    description:
      "Noisy color layers, rotation, and vignette combine into a living gradient.",
    sourceFile: "moby-gradient.shdr.ts",
    artifact: mobyArtifact,
  },
  {
    slug: "scream-wave",
    title: "Scream Wave",
    number: "06",
    description:
      "An expressive, high-energy waveform with reflections and a cinematic grade.",
    sourceFile: "scream-wave.shdr.ts",
    artifact: screamArtifact,
  },
  {
    slug: "ben-day-spotlight",
    title: "Ben Day Spotlight",
    number: "07",
    description:
      "A graphic spotlight rendered in halftone dots, with a playful pop-art pulse.",
    sourceFile: "ben-day-spotlight.shdr.ts",
    artifact: benDayArtifact,
  },
];

export const references: readonly ShaderReference[] = await Promise.all(
  definitions.map(async (definition) => ({
    ...definition,
    source: await sourceFor(definition.sourceFile),
  })),
);

export const referenceSummaries = references.map(
  ({
    artifact: _artifact,
    source: _source,
    sourceFile: _sourceFile,
    ...summary
  }) => summary,
);

export function referenceForSlug(slug: string): ShaderReference | undefined {
  return references.find((reference) => reference.slug === slug);
}
