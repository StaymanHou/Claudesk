---
name: hmr-stale-across-file-rename
description: A long-lived Vite/HMR dev window can half-apply and fake a regression — after a file RENAME *or* any in-place edit to a component holding useRef/useState. Relaunch before believing a verify result, not just before suspecting the diff.
metadata:
  type: project
---

A long-lived Vite/`pnpm tauri dev` window can silently half-apply its HMR, manifesting as a
phantom "regression" in the running window even though the committed source is correct.

**Two triggers, and the second is the more expensive one:**

**1. A mid-build file RENAME.** In WP3b the `commandPalette.ts`→`paletteCommands.ts` rename left
the dev window's HMR half-applied (export-not-found transients), silently dropping the CM6
language extension → markdown highlighting vanished. The committed code was fine.

**2. ⚠️ An IN-PLACE edit to a component holding `useRef`/`useState` — widened 2026-08-02 (M11
WP4), after this memory was READ and judged inapplicable, costing four wrong theories, a
`/debug-empirical-telemetry` sidebar, and two app relaunches.** HMR preserves module identity
while replacing closures and effect bodies, so **refs, latches and pending state survive in a
shape no code path in the new source can produce.** That makes it strictly worse than the rename
case: a rename fails loudly (export-not-found), whereas a hot-swapped hook tree renders happily
in a state the source cannot explain.

Concretely: `DocsPanel.tsx` took four HMR updates in 31 seconds while a fix was applied, and the
"re-verify" ran ~18s later inside that tree. The panel still blanked, so the fix looked wrong. It
was correct — a fresh launch of the identical source passed every check, and telemetry then
showed a clean single cycle (`body=1, setLoaded=1, cancelledSkip=0`).

**The rule, stated so it fires next time:** *relaunch before believing a verify RESULT* — not
merely before suspecting the diff. Any verify-self observation taken after editing a component
with hook-resident state must follow a full relaunch, never an HMR update. The ~35s relaunch is
always cheaper than the phantom.

**Diagnose:** compare the LIVE module state, never by editing source. Check the served module
directly (`curl "http://[::1]:1420/src/.../Component.tsx" | grep <the-fix>`) to separate "my fix
isn't in the bundle" from "my fix is in the bundle and the runtime state is stale" — those look
identical from the DOM and need opposite responses. Pairs with
[[verify-self-stub-cannot-cross-subprocess-boundary]] (the live window is the ground truth a stub
can't see) and [[strictmode-remount-deadlocks-an-unreleased-fetch-latch]] (the same hook-state
surface, failing for a different reason).
