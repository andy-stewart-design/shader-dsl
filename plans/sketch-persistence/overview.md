# REPL Sketch Persistence Overview

## Purpose and intended change

The web REPL will let you keep a browser-local library of named shader sketches instead of losing everything when you leave the page. The library is a dialog, not a separate workspace or account.

## How it is used

Save a sketch, then use **Save as copy** to try a variation without changing the original. Open the library dialog to switch back; selecting a saved sketch loads it and runs it once. If you have unsaved edits, the REPL asks what to do with them before switching. Export a saved sketch as a JSON file to keep a copy or import it in another browser.

## Mental model

The **draft** is what you're editing, the **saved sketch** is what you last wrote to the library, and the **preview** is what last ran successfully. Those can differ: you can save broken or unfinished code, and merely running a draft does not save it.

## Scope and non-goals

- In scope: explicit saving, a local sketch dialog, and individual JSON imports and exports.
- Out of scope: autosave, bulk backup, accounts, and sync.

## Related documents

- Specification: [spec.md](spec.md)
