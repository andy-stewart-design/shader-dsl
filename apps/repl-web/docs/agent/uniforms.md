# REPL uniforms and implicit values

The generated callback exposes `coord`, `uniforms`, and `u`. `u` and `uniforms` are aliases of the same namespace. The default fields are:

- `u.resolution: Expr<Vec2<F32>>` — drawing-buffer width and height.
- `u.mouse: Expr<Vec2<F32>>` — the runtime mouse input exposed by the renderer.
- `u.time: Expr<F32>` — the runtime time input exposed by the renderer.

`coord: Expr<Vec4<F32>>` is the fragment coordinate. The usual pixel-to-UV conversion is `coord.xy / u.resolution`; coordinates are top-left-origin.

## Uniforms pane

The app's Uniforms pane supports two editable declaration kinds:

- **float**: `name`, finite `value`, finite `min`, and finite `max`, with `min < max` and `value` within the range. In generated shader source it behaves as `u.name: Expr<F32>`.
- **color**: `name` and a valid 3- or 6-digit hex color. It becomes a normalized `u.name: Expr<Vec3<F32>>`.

Names must be valid identifiers, unique, and cannot be `resolution`, `mouse`, `time`, `__proto__`, `prototype`, or `constructor`. The app's generated definition currently emits only `f32` and `vec3` declarations, even though the underlying full `shdr` package has broader uniform types.

```ts example=uniforms
// The Uniforms pane has a float named gain and a color named tint.
const uv = coord.xy / u.resolution;
const color = vec3(uv.x, uv.y, 0) * u.gain + u.tint * 0.1;
return vec4(color, 1);
```

The defaults and definitions are source/draft data. Changing a control in the preview can change an installed uniform value, but that live value is not part of documentation responses or authoring context. It is not safe to assume that a draft edit has changed the installed shader until the explicit Run/apply completes.

The REPL does not provide a generic editor declaration for textures. Runtime texture policy and host resources are outside this editor surface; use `sample` only when a real declared texture resource exists in a supported full-file integration.
