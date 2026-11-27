# A dependency spike must live outside the repo tree

**Hit 2026-08-01 (M11 WP1)** while spiking two markdown renderers. `git status` caught it before
any commit, and it was reverted.

## The trap

The repo's `tmp/` being gitignored does **not** isolate a pnpm install. Running `pnpm add` inside
`tmp/` still **rewrites the tracked `pnpm-lock.yaml`**: pnpm resolves upward to the workspace root
and ignores gitignore when it does (the tell is `../..` in its progress output).

**`package.json` is left untouched.** So the usual "did I add a dep?" check, grepping
`package.json`, reports clean while the lockfile is dirty.

## The rule

- Put library bake-offs and "just try it in a sandbox dir" spikes in the **session scratchpad**,
  outside the repo.
- When verifying a no-footprint claim, check **`pnpm-lock.yaml` explicitly**, not just
  `package.json`.

## Not to be confused with

`[[pnpm-exec-shadows-local-binaries]]` is a different trap: `pnpm exec <bin>` silently shadows a
local binary.
