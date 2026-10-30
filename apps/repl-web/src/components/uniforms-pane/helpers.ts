import type { Uniform } from "./types";

export function createUniform(
  id: string,
  sequence: number,
  existingNames: Iterable<string> = [],
): Uniform {
  const names = new Set(Array.from(existingNames, (name) => name.trim()));
  let nameIndex = sequence + 1;
  while (names.has(`value_${nameIndex}`)) {
    nameIndex += 1;
  }

  return {
    id,
    name: `value_${nameIndex}`,
    type: "float",
    float: {
      value: "0",
      min: "-1",
      max: "1",
    },
    color: {
      draft: "#85befd",
      valid: "#85befd",
    },
  };
}

export function numberDraftError(draft: string, label: string): string | null {
  if (draft.trim() === "") return `${label} is required.`;
  if (!Number.isFinite(Number(draft))) return `${label} must be a number.`;
  return null;
}

export function colorToValidHex(draft: string): string | null {
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(draft.trim());
  if (!match) return null;

  if (match[1].length === 3) {
    return `#${match[1]
      .split("")
      .map((character) => character + character)
      .join("")}`.toLowerCase();
  }

  return `#${match[1]}`.toLowerCase();
}

export function colorDraftError(draft: string): string | null {
  if (draft.trim() === "") return "Color is required.";
  if (!colorToValidHex(draft)) return "Use a hex color such as #85befd.";
  return null;
}

export function nameError(name: string, duplicate: boolean): string | null {
  if (name.trim() === "") return "Name is required.";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return "Use letters, numbers, and underscores; start with a letter or underscore.";
  }
  if (RESERVED_NAMES.has(name)) return "This name is reserved.";
  if (duplicate) return "Names should be unique.";
  return null;
}

const RESERVED_NAMES = new Set([
  "resolution",
  "mouse",
  "time",
  "__proto__",
  "prototype",
  "constructor",
]);
