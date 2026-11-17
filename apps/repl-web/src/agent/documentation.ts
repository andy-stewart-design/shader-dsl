import overview from "../../docs/agent/overview.md?raw";
import language from "../../docs/agent/language.md?raw";
import builtins from "../../docs/agent/builtins.md?raw";
import utilities from "../../docs/agent/utilities.md?raw";
import uniforms from "../../docs/agent/uniforms.md?raw";
import preview from "../../docs/agent/preview.md?raw";

const documentation = {
  overview: { title: "REPL shader authoring overview", content: overview },
  language: { title: "REPL shader language", content: language },
  builtins: { title: "REPL math builtins", content: builtins },
  utilities: { title: "REPL utilities and constructors", content: utilities },
  uniforms: { title: "REPL uniforms and implicit values", content: uniforms },
  preview: { title: "REPL preview workflow", content: preview },
} as const satisfies Record<
  string,
  { readonly title: string; readonly content: string }
>;

export const DOCUMENTATION_TOPICS = [
  { topic: "overview", title: documentation.overview.title },
  { topic: "language", title: documentation.language.title },
  { topic: "builtins", title: documentation.builtins.title },
  { topic: "utilities", title: documentation.utilities.title },
  { topic: "uniforms", title: documentation.uniforms.title },
  { topic: "preview", title: documentation.preview.title },
] as const satisfies readonly {
  readonly topic: keyof typeof documentation;
  readonly title: string;
}[];

export type DocumentationTopic = (typeof DOCUMENTATION_TOPICS)[number]["topic"];
export type DocumentationTopicInfo = (typeof DOCUMENTATION_TOPICS)[number];

const topicIndex = DOCUMENTATION_TOPICS;

export function getDocumentation(input?: { readonly topic?: string }) {
  const topic = input?.topic ?? "overview";
  const entry = DOCUMENTATION_TOPICS.find(
    (candidate) => candidate.topic === topic,
  );

  if (!entry) {
    return {
      ok: false as const,
      error: {
        code: "unknown-topic" as const,
        message: `Unknown documentation topic ${JSON.stringify(topic)}.`,
      },
      topics: topicIndex,
    };
  }

  return {
    ok: true as const,
    topic: entry.topic,
    title: entry.title,
    content: documentation[entry.topic].content,
    topics: topicIndex,
  };
}
