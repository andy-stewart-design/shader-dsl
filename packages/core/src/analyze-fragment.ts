import {
  createVirtualSourceFromParsed,
  type CreateVirtualSourceResult,
} from "./create-virtual-source.js";
import {
  lowerParsedFragment,
  type LowerFragmentResult,
} from "./lower-fragment.js";
import {
  parseShaderFile,
  type ParseShaderFileResult,
} from "./parse-shader-file.js";

export interface FragmentAnalysis {
  readonly parsed: ParseShaderFileResult;
  readonly virtual: CreateVirtualSourceResult;
  readonly lowered: LowerFragmentResult;
}

/** One parse for editor transformation, target-neutral lowering, and diagnostic routing. */
export function analyzeFragment(
  source: string,
  fileName = "shader.shdr.ts",
): FragmentAnalysis {
  const parsed = parseShaderFile(source, fileName);
  return {
    parsed,
    virtual: createVirtualSourceFromParsed(source, parsed),
    lowered: lowerParsedFragment(parsed),
  };
}
