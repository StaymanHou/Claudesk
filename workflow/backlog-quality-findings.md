# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

# wp1-tauri-scaffold — 2026-06-16

## SURFACE-2026-06-16-QUALITY-WP1-HTML-TITLE
- **File:** `index.html:7`
- **Severity:** MAJOR
- **Finding:** `<title>Tauri + React + Typescript</title>` is the scaffold default; Tauri's window title overrides for the native window but the HTML title leaks into devtools / web inspector.
- **Fix shape:** one-line edit to `<title>Claudesk</title>`.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP1-README-SCAFFOLD-TEXT
- **File:** `README.md`
- **Severity:** MAJOR
- **Finding:** README contains pure scaffold-default text asserting the project is a "template."
- **Fix shape:** replace with a single-line `# Claudesk` pointer to `CLAUDE.md` and `docs/product/vision.md`. (Full README lands in Phase 4 WP34.)
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP1-WINDOW-SIZE
- **File:** `src-tauri/tauri.conf.json:14-18`
- **Severity:** MAJOR
- **Finding:** Default window size 800x600 is too small for the product vision's Mission-Control-style center-stage + filmstrip layout, even at N=1.
- **Fix shape:** bump to ~1280x800 (or similar). Real default will be re-tuned in WP5/Phase 1 polish; this fixes the dev-loop UX in the interim.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP1-DEMO-GREET-COMMAND
- **File:** `src-tauri/src/lib.rs:2-5`
- **Severity:** MAJOR
- **Finding:** The scaffold's `greet` Tauri command + `invoke_handler!` registration is dead code reachable from any frontend code with `@tauri-apps/api/core` access. WP7 will define the real CC-session command surface; the demo command is a permanent reachable surface the team has no plan to support.
- **Fix shape:** remove the `greet` fn and update `invoke_handler!` to `[]` (or remove the call). ~3 lines.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP1-PRETTIER-CONFIG-EMPTY
- **File:** `.prettierrc.json:1`
- **Severity:** MINOR
- **Finding:** `{}` is a no-op; future contributors can't tell whether defaults were deliberate or just unconfigured.
- **Fix shape:** add at least one explicit property documenting intent (e.g. `"trailingComma": "all"`).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP1-ESLINT-CONFIG-NO-COMMENTS
- **File:** `eslint.config.js:7-37`
- **Severity:** MINOR
- **Finding:** No comment explains the flat-config layering or the `react/react-in-jsx-scope: off` + `react/jsx-uses-react: off` new-JSX-transform shim.
- **Fix shape:** 2-line comment block at top.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP1-SMOKE-VALUE-MISMATCH
- **File:** `src/__tests__/smoke.test.ts:5` and `src-tauri/src/lib.rs:20`
- **Severity:** MINOR
- **Finding:** Vitest smoke uses `1+1`, Rust smoke uses `2+2`. Cosmetic inconsistency.
- **Fix shape:** pick one value pair for both.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP1-PNPM-WORKSPACE-COMMENT
- **File:** `pnpm-workspace.yaml:1-2`
- **Severity:** MINOR
- **Finding:** `allowBuilds: { esbuild: true }` ships without comment; the pnpm-v11 migration story (auto-generated stub with literal `set this to true or false` placeholder) is non-obvious.
- **Fix shape:** one-line comment at top citing pnpm v11 migration.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP1-VITE-CONFIG-PROCESS
- **File:** `vite.config.ts:4`
- **Severity:** MINOR
- **Finding:** `// @ts-expect-error process is a nodejs global` is scaffold-default; the proper fix is `import { env } from "node:process"`. The directive will silently bit-rot if `process` ever gets typed.
- **Fix shape:** replace the `@ts-expect-error` line with the proper import.
- **Priority:** low
- **Status:** pending

# wp2-cc-pty-probe — 2026-06-16

## SURFACE-2026-06-16-QUALITY-WP2-SHUTDOWN-DUPLICATION
- **File:** `src-tauri/examples/cc_pty_probe.rs:169` and `:309`
- **Severity:** MINOR
- **Finding:** The 6-line "CC requires Ctrl+D twice" cleanup block is duplicated verbatim between `run_inject` and `run_resize`.
- **Fix shape:** extract a `shutdown_cc(writer, child)` helper so the "send-twice with 300ms gap then drop writer" pattern is grep-able as one canonical reference for WP7.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP2-READER-THREAD-LIFECYCLE-COMMENT
- **File:** `src-tauri/examples/cc_pty_probe.rs:79, 133, 189, 257`
- **Severity:** MINOR
- **Finding:** Reader threads spawn but are inconsistently joined (`_reader_thread` dropped in 3 modes; `drain.join()` used in `run_exit_via`). Lifecycle invariant ("reader thread terminates on PTY EOF when child exits and drops the slave") is load-bearing but not documented in the code.
- **Fix shape:** add a one-line comment at the first reader spawn explaining the EOF-termination invariant.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP2-WIP-STATE-MARKER-DRIFT
- **File:** `workflow/wip/wp2-cc-pty-probe.md:3` vs `:10-11`
- **Severity:** MINOR
- **Finding:** Frontmatter `state: ship (complete)` but body `**State:** plan (complete)` — staleness between the two markers. Frontmatter is canonical per project convention; body line is stale.
- **Fix shape:** drop the redundant body `**State:** ...` line; rely on frontmatter as the single source. (Will be archived by feature-finalize regardless.)
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP2-READER-SINK-ENUM
- **File:** `src-tauri/examples/cc_pty_probe.rs:78, 131, 188, 255`
- **Severity:** MINOR
- **Finding:** Four near-identical reader-thread bodies (Stdout / Channel / CountBytes sinks) — consolidating into a `ReaderSink` enum would single-source the "reader thread pattern" question for WP7 readers.
- **Fix shape:** add `enum ReaderSink { Stdout, Channel(mpsc::Sender<Vec<u8>>), CountBytes }` + one `spawn_reader(reader, sink)` helper.
- **Priority:** low
- **Status:** pending
