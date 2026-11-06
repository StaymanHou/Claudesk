---
name: prove-render-unchanged-via-head-worktree
description: To prove a component refactor changed no RENDERED output without launching the app, render the real component at HEAD (a detached git worktree, node_modules symlinked) and in the working tree with the same throwaway renderToStaticMarkup+jsdom dump spec, then diff after normalizing ONLY the intended change — exit 0 is the proof.
metadata:
  type: feedback
---

When a change is meant to be **invisible to the user** (a data-structure swap, a hoist, a
testid/class change), passing render tests only show the properties those tests happen to
assert. They do not show that *nothing else moved*: section titles, ordering, a dropped attribute. A
before/after diff of the real rendered markup does, and it needs no live app.

**Recipe (paydown WP5, 2026-09-23 — `SettingsPanel` hotkey group):**

1. `git worktree add --detach <scratchpad>/headtree HEAD`, then
   `ln -s <repo>/node_modules <scratchpad>/headtree/node_modules`. There's no reinstall, and
   `pnpm-lock.yaml` is untouched.
2. Write ONE throwaway spec in the scratchpad (`// @vitest-environment jsdom`, the same
   `vi.mock("@tauri-apps/api/core" | "/event")` stubs the render tests use). It renders the
   real component with `renderToStaticMarkup`, selects the subtree, and writes
   `outerHTML.replace(/></g, ">\n<")` to a path taken from an env var.
3. Copy it into `src/__verify_tmp/` in **both** trees. Run vitest in each with a different `OUT=`.
   **Delete both copies** afterwards, and confirm with `git status`.
4. `sed` the HEAD dump to apply **only the intended change**, then `diff` it against the
   working-tree dump. **Exit 0 is the proof.** Also eyeball the raw diff first, so you can see
   every hunk is the intended one.
5. `git worktree remove --force <scratchpad>/headtree`, then check `git worktree list`.

**Why not the alternatives:** `git stash`/`checkout` to render HEAD in place risks the dirty
tree ([[git-checkout-no-ops-on-untracked-file]]). A hand-written expected-HTML fixture only
encodes what you thought to check. Launching the app costs far more and adds the bridge
caveats in `docs/lessons/mcp-tauri-bridge-caveats.md`.

**Limits:** this only covers the RESTING DOM. `useSettingControl` seeds asynchronously, so only
the default-state render is reachable, the same limit `hotkeyGroupRender.test.tsx` documents.
It proves "unchanged", not "correct". Pair it with the mutants that prove the new guards
bite.

**⚠️ When content arrives through effects, use a LIVE mount instead (paydown WP13, 2026-11-06).**
`renderToStaticMarkup` runs no effects. For `ProjectPicker` that means `recents` stays `[]` and
**no row renders in either tree**, so the diff passes even with the row component deleted (the
fixture makes right and wrong identical; source-text-guards entry 15). The variant that worked
for `SettingsPanel` (8 fixtures) and `ProjectPicker` (8 fixtures):
- In the throwaway spec, mount with `createRoot` + `act` + `mockIPC(cb, {shouldMockEvents:true})`
  + `mockWindows("main")`, wait for effects (~30 ms in `act`), drive clicks/filters per fixture,
  and dump `innerHTML` **plus the sorted IPC call list plus the callback arguments** (e.g.
  `onOpen`). Same HEAD-worktree recipe otherwise.
- Pick fixtures so every branch renders once (gate on/off, each announcement kind, a missing
  profile, an open dialog), run HEAD twice to prove the dump deterministic, and keep a positive
  control (one mutated attribute must change the dumps).
- jsdom lacks `scrollIntoView`; stub it on `Element.prototype` in the spec if a dialog calls it.

**An identical render does NOT prove the extraction's new prop seams are pinned.** After WP13,
passing `workflowApplicable={true}` to every row, or making the row's × and commit callbacks
no-ops, passed all 750 picker/app tests. So after extracting a component, **mutate each new prop
to a constant or no-op** and add a live test for any that survive.

Related: [[prove-mechanical-transform-by-rerunning-it]] (the same shape for formatter sweeps:
re-run the transform rather than hand-normalize), [[whole-app-jsdom-boot-via-tauri-mockipc]].
