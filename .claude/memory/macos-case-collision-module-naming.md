---
name: macos-case-collision-module-naming
description: On macOS case-insensitive FS, foo.ts and Foo.tsx collide (tsc TS1149/TS1261) — name pure modules case-distinct from their PascalCase component siblings.
metadata:
  type: project
---

macOS's case-insensitive filesystem treats `foo.ts` and `Foo.tsx` as the **same path** → tsc errors TS1149 ("differs only in casing") / TS1261. Hit in WP3b P1.1: a pure `commandPalette.ts` module next to the `CommandPalette.tsx` component collided.

**Rule:** name pure-logic modules **case-distinctly** from their PascalCase component siblings — e.g. `paletteCommands.ts` + `CommandPalette.tsx`, NOT `commandPalette.ts` + `CommandPalette.tsx`. The repo's existing split already follows this elsewhere (`fontZoom.ts`, `editorLoad.ts` vs `EditorPanel.tsx`); keep it.
