import { readFile } from "node:fs/promises";

export function readShaderFixture(name: string): Promise<string> {
  const fixtureUrl = new URL(`./fixtures/${name}.shdr.ts`, import.meta.url);

  return readFile(fixtureUrl, "utf8");
}
