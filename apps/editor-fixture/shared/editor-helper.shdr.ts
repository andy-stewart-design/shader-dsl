import { defineShaderFunction } from "shdr";
import type { Expr, F32, Vec2 } from "shdr";

const ordinary: string = 1;

export const scale = defineShaderFunction((x: Expr<F32>) => x * 0.5);
