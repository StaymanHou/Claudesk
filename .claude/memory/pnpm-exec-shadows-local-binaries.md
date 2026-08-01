---
name: pnpm-exec-shadows-local-binaries
description: "`pnpm exec tsc --noEmit` runs the PNPM binary, not tsc — prints \"Already up to date\" and exits 0 regardless of type errors. Use ./node_modules/.bin/tsc. Any `pnpm exec <bin>` colliding with a pnpm subcommand has this trap."
metadata:
  type: project
---

`pnpm exec tsc --noEmit` does **not** type-check. It resolves to **pnpm's own binary**, prints `Already up to date. / Done in NNNms`, and exits **0 regardless of type errors** — which is indistinguishable from a passing type-check unless you notice the output is pnpm's rather than tsc's.

**Use instead:** `./node_modules/.bin/tsc --noEmit`, or `pnpm build` (which chains `tsc && vite build`). Same for `eslint` / `vitest` / `prettier` — invoking `./node_modules/.bin/<bin>` directly is the reliable form in this repo.

**The general shape:** any `pnpm exec <name>` where `<name>` collides with a pnpm subcommand or a pnpm-recognized token can be shadowed by pnpm instead of running the local binary. The failure is silent and *positive* — a false green, not an error — so it survives any gate that only checks exit codes.

## ⚠️ Scope correction (2026-08-01, proven) — this is a `pnpm exec` trap, NOT a `pnpm run` trap

The paragraphs above generalize to "any `pnpm exec <name>`" and say "same for eslint / vitest / prettier," which reads as though the `package.json` **scripts** are tainted too. They are not, and that distinction is load-bearing.

**`pnpm run <script>` is safe.** Mutation-tested at the M11.5 repair-(A) verify gate: a deliberate formatting violation was appended to an already-swept file, and `pnpm format:check` (i.e. `pnpm run format:check`, defined as bare `prettier --check .`) returned:

```
EXIT=1
[warn] src/updater/updaterPrefs.ts
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
```

...and exit **0** once reverted. So it genuinely discriminates clean from dirty.

**Why the two differ:** `pnpm run` looks the name up in `package.json`'s `scripts` and executes that script's body with `node_modules/.bin` on `PATH` — there is no name-resolution contest with pnpm's own subcommands. `pnpm exec` resolves `<name>` as a binary and is what can lose to a pnpm-recognized token.

**Practical consequence:** this repo's `format:check` / `lint` / `test` / `build` scripts **are** trustworthy exit-code gates — prefer them in a verification observable, because they are the command the operator actually types. Reaching for `./node_modules/.bin/<bin>` to dodge a hazard that does not apply to the script form costs fidelity: it verifies a path the operator never uses. Keep the direct-binary form for the *ad-hoc* case (`tsc --noEmit`, which has no script) and for anything invoked as `pnpm exec`.

**Why this is worth remembering rather than rediscovering:** it was hit twice in one feature (M11.5 WP1 Phase 1 verify-auto, then again at Phase 3, 2026-07-31), and the phrase is baked into that feature's OC-4 observable outcome — now archived at `workflow-system/state/archive/per-project-cc-model-override.md` — which specifies `pnpm exec tsc --noEmit` verbatim. **Anyone re-running that outcome as written gets a meaningless pass.** When writing an observable outcome or a CI step that shells out to a local dev binary, name the binary path, not `pnpm exec`.

Related: [[bash-cargo-env.md]] (the Rust-side counterpart — cargo/rustc need an explicit PATH prefix in this session's subshells).
