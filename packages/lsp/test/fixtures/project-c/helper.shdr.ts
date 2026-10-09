import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";

export const scale = defineShaderFunction((x: Expr<F32>) => x * 0.5);
