---
name: synthetic-tab-seam-reusable-readonly-buffer
description: The WP12 synthetic-tab seam renders programmatic read-only content as an editor tab; consumers must supply font-size + decorations (it doesn't inherit the editor's live zoom).
metadata:
  type: project
---

The WP12 editor synthetic-tab seam is a proven, generic surface for rendering programmatic read-only content into the editor as a tab — `EditorSplit.addSynthetic(id, label, onLineClick?)` + `setSyntheticContent(id, content, highlights?)`, rendered by `SyntheticView` (CM6 read-only), with clicks reported as 1-based buffer line numbers via the `onLineClick` callback. WP7's "Find Results" tab is the first consumer (`formatFindResults` → text + lineMap + highlight spans; a clicked line → `lineMap[line-1]` → `openFile(path, matchTargetFor(match))`).

**Gotcha for future consumers:** `SyntheticView` does NOT inherit the editor's *live* zoom. It reads `loadFontSize()` once inside a `useMemo` (keyed on `[onLineClick, highlights]`), so it only picks up the persisted font size at (re)render — unlike `EditorPanel`, which live-reconfigures via `fontSizeCompartment`. A consumer that wants live-zoom tracking must wire it itself. This one-shot read is likely deliberate — see [[cm6-dont-copy-compartment-by-analogy]] (don't reflexively add a compartment). Highlight decorations are likewise consumer-supplied (passed as `highlights` spans → `Decoration.mark(.cm-synthetic-hit)`).
