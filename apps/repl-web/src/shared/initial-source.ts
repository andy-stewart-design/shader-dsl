export const initialShaderSource = `const uv = coord.xy / u.resolution;
const color = vec4(uv.x, uv.y, 0, 1);

return color;`;
