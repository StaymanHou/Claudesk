---
name: hmr-stale-across-file-rename
description: A long-lived Vite/HMR dev window across a mid-build file RENAME can half-apply and fake a regression — relaunch before suspecting the diff.
metadata:
  type: project
---

A long-lived Vite/`pnpm tauri dev` window across a **mid-build file rename** can silently half-apply its HMR, manifesting as a phantom "regression" in the running window even though the committed source is correct. In WP3b the `commandPalette.ts`→`paletteCommands.ts` rename left the dev window's HMR half-applied (export-not-found transients), silently dropping the CM6 language extension → markdown highlighting vanished. The committed code was fine.

**Diagnose/fix:** relaunch or hard-reload the window BEFORE suspecting the diff. Confirm empirically by comparing the LIVE module state, not by editing source — e.g. via Playwright `browser_evaluate` against the dev server, build the editor both the old and new way and compare CM6 highlight classes (they were byte-identical: `ͼ25/ͼ28/ͼ24`, language facet `markdown`). Reinforces the WP3a inspect-don't-guess lesson — and pairs with [[verify-self-stub-cannot-cross-subprocess-boundary]] (the live window is the ground truth a stub can't see).
