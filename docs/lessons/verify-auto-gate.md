# `pnpm verify:auto` — why the gate is ONE command

`CLAUDE.md` states the rule: **`pnpm verify:auto` IS the per-phase verify-auto gate — run that one
command, not a remembered list.** This doc holds the *why*, which is empirical on both halves.

## The gate, in order

```
lint → format:check → tsc --noEmit → check:link → vitest → cargo fmt --check → cargo clippy --all-targets -D warnings → cargo test
```

Proven to exit non-zero on **both** a Prettier violation and a `cargo fmt` violation — i.e. the two
halves that were previously unenforced are now both actually enforced by the single entry point.

## Why one command and not a documented list

Added 2026-08-18 (paydown WP5) to close `SURFACE-2026-08-01-NOTHING-ENFORCES-FORMAT-CHECK`.

**There is no CI and no git hook in this project.** A gate spelled out only as prose is a gate that
gets *partially* skipped — some steps run, the forgotten one is the one that would have caught the
defect, and the run still reports green. Collapsing the list into one script removes the recall step
entirely, which is the only mechanism available here.

## `cargo fmt --check` is in there deliberately

The Rust side had the **identical** unenforced gap. Found at paydown WP1: `cargo fmt` silently
reformatted a file that task never touched — direct evidence the frontend's "nothing enforces
`format:check`" finding applied verbatim to Rust. Rather than file it as a second pass, both halves
became one command.

## The two formatter traps that motivated it

- **A Prettier reflow silently broke a `?raw` guard**, which then reported green while checking
  nothing — which is why `pnpm format:check` is a gate step and not an optional tidy-up. A source-text guard asserting a multi-token pattern depends on where the formatter chose
  to wrap; run `format:check` *before* trusting such a guard, and re-run the decisive mutation
  **after** any reformat. (Full catalogue: [`source-text-guards.md`](source-text-guards.md) §3.)
- **`cargo clippy --lib` silently misses test-code lints.** The full invocation is
  `cargo clippy --all-targets -- -D warnings` — use `--all-targets`, never `--lib`:
  `--lib` skips the test target, so `erasing_op`, `non_snake_case`, `vec_init_then_push`, and
  `assertions_on_constants` in test code go unreported while still failing `-D warnings` at a later
  full sweep. Running `--all-targets` per phase surfaces them early rather than at a final sweep
  (M9 WP6.5, 2026-07-08).

## `check:link` — the only step that can see a deleted export at runtime

Added 2026-09-23 (paydown 2026-09-23 WP3). `tooling/link-check/linkCheck.mjs` runs the real
production build (rollup, `write: false`, ~2s) over **both** webview entries (`index.html` +
`pip.html`) and fails if any static import cannot be bound.

**Why it is not a Vitest test:** under Vitest, importing a module whose consumer names a missing
export **does not throw**. The module runner reads the binding as a property, so it is silently
`undefined` (probed: a consumer of `{ present, missing }` evaluated to `[1, null]`, no error). In the
webview the same import is `SyntaxError: Importing binding name … is not found`, and it aborts
`main.tsx` before React mounts. That is the M13.5 WP3 blank app. No Vitest import or render can see
this class, so the gate needs a real linker. `tsc` also catches it, but a plan can accept a red `tsc`
(M13.5 did), and `pnpm exec tsc` is a false green here.

**Mutation-proven 2026-09-23, each mutant run individually, each restored via `cp` + `shasum`:**
un-exporting `newWorkspaceChord` (main entry) and `computePanelSize` (PiP-only) each fail it, naming
the binding. **Polarity control:** a missing name imported unqualified but used only as a **type**
passes. It is erased, exactly as it is at runtime. The same name used as a **value** fails.

**Blind to:** destructured *dynamic* imports (`const { X } = await import("./y")` is a property read;
`main.tsx`'s dev-only probe harnesses use it), and CJS-interop differences for node_modules
dependencies between the bundled build and the unbundled dev server. It renders nothing, so
evaluation-time and mount-time throws belong to the boot render smoke (`src/__tests__/appBoot.test.tsx`).

## Standing style rules (the short version — these live in `CLAUDE.md`)

- Frontend: ESLint + Prettier, TypeScript strict, React 19 function components only.
- Backend: no `unwrap()` outside tests; `?` with typed error returns (`thiserror`).

## Related

- [`source-text-guards.md`](source-text-guards.md) — the ways a guard stops checking, including the
  formatter-reflow case above.
