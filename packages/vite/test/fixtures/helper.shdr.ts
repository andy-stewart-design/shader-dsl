import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";

export const helper = defineShaderFunction((x: Expr<F32>) => x);
