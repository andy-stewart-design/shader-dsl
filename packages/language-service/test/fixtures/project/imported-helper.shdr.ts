import { defineShaderFunction } from "shdr";
import type { Expr, F32, Vec2 } from "shdr";

export const scale = defineShaderFunction((x: Expr<F32>) => x * 0.5);
