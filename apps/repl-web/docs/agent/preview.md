# REPL preview workflow

Source editing and preview installation are separate. Main, Utils, and Uniforms edits update the draft. The preview keeps the last successfully installed shader until an explicit human Run or an approved `apply_sketch` operation compiles, installs, and confirms the first frame.

## Apply boundary

- Run is the explicit manual action and uses **Option/Alt+Enter**.
- An agent apply must use the current draft revision and is rejected when stale.
- Applied identity is confirmed only after compilation, renderer installation, and the first completed draw.
- A failed compile leaves the installed preview unchanged. Backend, installation, and draw failures also return structured errors, but do not assume an interrupted installation has rolled back. Read `get_app_state` before deciding what to do next.
- Runtime controls are not a substitute for applying source. They do not edit Main or Utils.

The app may have separate WebGL 2 and WebGPU previews. WebGPU can be unavailable while WebGL remains usable. The shader artifact is compiled for both targets; backend availability is a preview concern, not a language feature.

## Runtime controls

After a successful apply, the preview can expose controls for the declared float and color uniforms. Float controls use the saved finite min/max range and color controls use the saved color. These controls patch the installed preview values; they do not rewrite the draft definitions. The automatic `resolution`, `mouse`, and `time` inputs are runtime inputs and are not editable through the authoring tools.

## Capturing a preview

`capture_preview` reads only the active, applied preview canvas. It requires the expected applied revision and never applies a draft or changes runtime controls. By default it returns a PNG bounded to at most 512 pixels on its longest edge without upscaling. `maxDimension: "native"` requests native dimensions; an integer from 64 through 2048 chooses another bound. Native captures remain subject to the app's pixel/byte limits. A stale, unavailable, replaced, or failed canvas is an error rather than permission to return old pixels.

Documentation is static. It does not include the current draft, uniform values, applied revision, canvas, pixels, backend status, or any other live app state. Use the separate authoring/state tools for those values.
