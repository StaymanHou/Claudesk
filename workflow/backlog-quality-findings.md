# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

# wp5-frontend-ui-prototype — 2026-06-18

3 MINOR findings from `feature-review-quality` on ship commit `777c0b8` (0 CRITICAL, 0 MAJOR). All cosmetic stylesheet/intent-clarity nits, zero correctness impact. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-18-QUALITY-WP5-FILMSTRIP-FLEX-SHRINK
- **File:** `src/App.css:88`
- **Finding:** `.filmstrip` declares `flex-shrink: 0`, but its parent `.app-shell` is `display: grid` (not flex) — the property is inert. The grid row sizing (`grid-template-rows: auto 1fr`) is what reserves the strip.
- **Why it matters:** dead/misleading style declaration in a substrate file Phase 2 (WP16 filmstrip) will build on; a reader may infer a flex layout that doesn't exist.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-18-QUALITY-WP5-XTERMPANE-EFFECT-DEP
- **File:** `src/components/workspace/XtermPane.tsx:60`
- **Finding:** the xterm mount `useEffect` keys on `[workspaceId]`, but CenterStage uses `key={ws.id}` so a changed id already forces a fresh component instance. `[]` would express once-per-mount intent more honestly.
- **Why it matters:** slight intent-obscuring; a maintainer may think id-change-driven re-mount is a supported path when component identity already guarantees it.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-18-QUALITY-WP5-GLOBAL-H1-RULE
- **File:** `src/components/picker/ProjectPicker.tsx:91` (+ `src/App.css` global `h1`)
- **Finding:** the global `h1 { text-align: center }` rule now has a single consumer (the picker heading); reads as leftover scaffold generality.
- **Why it matters:** trivial; cosmetic clarity of the stylesheet's global section.
- **Priority:** low
- **Status:** pending

# wp1-tauri-scaffold — 2026-06-16

> **ALL RESOLVED 2026-06-17 (refactor pass).** All 9 findings fixed. See `workflow/backlog.md` → wp1 pointer for the per-fix summary.

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

> **RESOLVED 2026-06-17 (refactor pass):** 3 fixed (shutdown-divergence comment, reader-thread EOF lifecycle comment, stale `**State:**` line). 1 DISMISSED: `ReaderSink` enum — explicit inline readers are clearer for reference/`examples/` code; the EOF invariant is now single-sourced by the lifecycle comment.

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

# wp3-sublime-cli-probe — 2026-06-16

> **ALL RESOLVED 2026-06-17 (refactor pass).** All 6 findings fixed (2 MAJOR + 4 MINOR). See `workflow/backlog.md` → wp3 pointer for the per-fix summary.

## SURFACE-2026-06-16-QUALITY-WP3-STUCK-SURFACED-LEAF
- **File:** `workflow/wip/wp3-sublime-cli-probe.md` (Work Tree, leaf below P1.4)
- **Severity:** MAJOR
- **Finding:** Work Tree contains an unchecked leaf `- [ ] SURFACED — ST 'osascript activate' …` under Phase 1, but Phase 1's parent is `[x]`. Violates the global "parent's checkbox may only be `[x]` when ALL children are `[x]`" invariant. The discovery is correctly logged in §Discoveries and the feedback memory exists; the leaf should either be marked `[x]` (closed via the memory artifact) or removed from the tree (SURFACED belongs in §Discoveries, not as a perpetually-open child).
- **Fix shape:** delete the leaf line from the Work Tree (the §Discoveries entry already captures the lesson; no work-item action remains).
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP3-OBSERVATION-VS-INFERENCE-FLATTENING
- **File:** `workflow/wip/wp3-sublime-cli-probe.md` (Invocation matrix tables, T8/T9/T11 rows)
- **Severity:** MAJOR
- **Finding:** T8/T9/T11 rows present inference-grade data (footnoted inconclusive, race-affected, or derived from `--help`) in the same shape as observation-grade rows (T7, T10). A future contributor cannot tell at-a-glance which rows are runtime-reproducible vs. documentation-derived; this asymmetry is load-bearing because the §Decision relies on the matrix.
- **Fix shape:** add a column "Source" with values `observed | inferred` (or a leading row-prefix marker like ⚠️/†), and a one-line legend above the table.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP3-STATE-PROSE-DRIFT
- **File:** `workflow/wip/wp3-sublime-cli-probe.md:15`
- **Severity:** MINOR
- **Finding:** Frontmatter says `state: ship (complete)` but the H2-equivalent prose line on line 15 says `**State:** plan (complete)`. Dual-source state representations drift; the prose line should mirror frontmatter or be removed.
- **Fix shape:** remove the duplicated `**State:**` prose line (frontmatter is canonical), or align it.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP3-FOOTNOTE-MARKERS
- **File:** `workflow/wip/wp3-sublime-cli-probe.md` (Invocation matrix footnotes)
- **Severity:** MINOR
- **Finding:** Superscript ¹/² footnote markers force readers to scroll; table headers don't carry the numbers. Grep-unfriendly.
- **Fix shape:** use `[note 1]` style or inline parenthetical at the row, or move the inconclusive notes into the "Notes" column directly.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP3-UNVISITED-STALE
- **File:** `workflow/wip/wp3-sublime-cli-probe.md:50` (Current Node block)
- **Severity:** MINOR
- **Finding:** `Unvisited:` lists `ship → review-quality → finalize` but ship is already complete (per frontmatter + `ship_commit: cc72c4d`). The sequence-of-execution field wasn't refreshed when the state advanced. Per SURFACE-2026-05-06-FINALIZE-BEFORE-SHIP-ORDER-FLIP rationale, stale `Unvisited:` is a small confabulation channel for downstream skills.
- **Fix shape:** finalize will overwrite this anyway; the discipline of updating `Unvisited:` on every state exit is the load-bearing rule worth noting.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-06-16-QUALITY-WP3-RUNTIMES-TIMEOUT-FORMULA
- **File:** `runtimes.md` (multiple entries)
- **Severity:** MINOR
- **Finding:** All four sub-3s entries (`pnpm install`, `pnpm test`, `pnpm lint`, `cargo test`) record `**Use timeout:** 120000` instead of the formula's `ceil(observed * 1.5 + 60) * 1000` (which would yield ~62000–65000 ms). The 120000 matches the Bash tool's default; the registry is recording a constant rather than computing from data.
- **Fix shape:** either apply the formula consistently to all entries, or document the override policy (e.g., "clamp small values to a 120s safety floor") in `~/.claude/CLAUDE.md`'s registry rules.
- **Priority:** low
- **Status:** pending

# wp4-thumbnail-rendering-probe — 2026-06-17

> **ALL RESOLVED 2026-06-17 (refactor pass).** Both MINOR findings fixed. See `workflow/backlog.md` → wp4 pointer for the per-fix summary.

## SURFACE-2026-06-17-QUALITY-WP4-CENTER-SERIALIZER-COMMENT
- **Severity:** MINOR (low)
- **Location:** src/probe/Harness.tsx (center terminal build, ~L84-101)
- **Finding:** The center (active) terminal is built without a `SerializeAddon` while every background terminal loads one. This is correct (the center is rendered normally, never serialized into a tile) but silent — a one-line comment ("center renders normally; no serializer needed") would save the next reader a double-take.
- **Suggested action:** Add the clarifying comment. Throwaway-code polish; trivial.

## SURFACE-2026-06-17-QUALITY-WP4-REPLAY-VOID-DURATION
- **Severity:** MINOR (low)
- **Location:** src/probe/replay.ts (~L99-103)
- **Finding:** The `if (events.length === 0) return {stop}` early-out followed by `void duration;` with a "touch duration" comment reads as leftover scaffolding rather than load-bearing logic — minor dead-code smell in otherwise clean durable code.
- **Suggested action:** Drop the `void duration;` no-op (and its comment), or fold the empty-events guard more cleanly. `replay.ts` is the durable piece Phase 2 may lift, so worth a quick tidy then.

(Note: a third MINOR — Phase 3 Work Tree header stale at NOT-STARTED — was RESOLVED in-place at review time, not backlogged.)
