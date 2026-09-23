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

Related: [[prove-mechanical-transform-by-rerunning-it]] (the same shape for formatter sweeps:
re-run the transform rather than hand-normalize), [[whole-app-jsdom-boot-via-tauri-mockipc]].
