---
name: pnpm-exec-shadows-local-binaries
description: "`pnpm exec tsc --noEmit` runs the PNPM binary, not tsc — prints \"Already up to date\" and exits 0 regardless of type errors. Use ./node_modules/.bin/tsc. Any `pnpm exec <bin>` colliding with a pnpm subcommand has this trap."
metadata:
  type: project
---

`pnpm exec tsc --noEmit` does **not** type-check. It resolves to **pnpm's own binary**, prints `Already up to date. / Done in NNNms`, and exits **0 regardless of type errors** — which is indistinguishable from a passing type-check unless you notice the output is pnpm's rather than tsc's.

**Use instead:** `./node_modules/.bin/tsc --noEmit`, or `pnpm build` (which chains `tsc && vite build`). Same for `eslint` / `vitest` / `prettier` — invoking `./node_modules/.bin/<bin>` directly is the reliable form in this repo.

**The general shape:** any `pnpm exec <name>` where `<name>` collides with a pnpm subcommand or a pnpm-recognized token can be shadowed by pnpm instead of running the local binary. The failure is silent and *positive* — a false green, not an error — so it survives any gate that only checks exit codes.

**Why this is worth remembering rather than rediscovering:** it was hit twice in one feature (M11.5 WP1 Phase 1 verify-auto, then again at Phase 3, 2026-07-31), and the phrase is baked into that feature's OC-4 observable outcome — now archived at `workflow-system/state/archive/per-project-cc-model-override.md` — which specifies `pnpm exec tsc --noEmit` verbatim. **Anyone re-running that outcome as written gets a meaningless pass.** When writing an observable outcome or a CI step that shells out to a local dev binary, name the binary path, not `pnpm exec`.

Related: [[bash-cargo-env.md]] (the Rust-side counterpart — cargo/rustc need an explicit PATH prefix in this session's subshells).
