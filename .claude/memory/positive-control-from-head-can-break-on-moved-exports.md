---
name: positive-control-from-head-can-break-on-moved-exports
description: A live positive control built by writing `git show HEAD:<file>` over a file can blank the app when THIS feature moved an export that HEAD file imports; build the control from the fixed file with only the behaviour reverted.
metadata:
  type: project
---

A positive control made by swapping a file back to HEAD (the recipe in [[verify-main-thread-freeze-via-sample]] step 6) can fail to LOAD when the feature under test moved or deleted an export the HEAD file imports. The module link fails and the dev app renders a blank `#root`: that looks like a product failure, but it is the control's fault.

Hit at paydown 2026-11-04 WP8 (2026-11-06): the HEAD `SupervisorActivityPopover.tsx` imported `relativeTime` from `diff/diffModel`, which the same feature had moved to `src/state/timeFormat.ts`. The live check read `#root` = 0 children.

**Why:** a deleted ES-module export is a runtime failure here, not just a `tsc` error (CLAUDE.md → "A deleted ES-module export is a RUNTIME failure"). HEAD's file and the working tree's modules no longer agree once the feature moves anything the file imports.

**How to apply:**
- Build the control from the FIXED file, reverting ONLY the behaviour under test (here: drop the focus effect and the scoped `onKeyDown`, and restore the `document` keydown listener). Keep the current imports.
- `./node_modules/.bin/tsc --noEmit` the control before trusting any live reading of it.
- If a swapped-in HEAD file blanks the app, check its imports against this feature's export moves before suspecting the product.
- Restore with `cp` + `shasum`, never `git checkout` ([[git-checkout-no-ops-on-untracked-file]]), and reload the webview: HMR may not recover a blank app.
