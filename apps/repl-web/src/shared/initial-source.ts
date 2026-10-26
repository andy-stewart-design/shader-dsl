export const initialShaderSource = `const uv = coord.xy / uniforms.resolution;
const color = vec4(uv.x, uv.y, 0, 1);

return color;`;
