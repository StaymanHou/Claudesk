# Backlog

> **Scaffold-debt refactor pass — DONE 2026-06-17.** The 4 code-quality finding blocks below (6 MAJOR + 15 MINOR across wp1/wp2/wp3/wp4) were cleared via `/feature-refactor` before WP5. 20 findings fixed, 1 dismissed with rationale (WP2 `ReaderSink` enum — see that WIP's Code-Quality Review). Detail file: [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md). Next up: **WP5 (frontend UI prototype — tab-shell substrate)**, the Phase 1 critical-path build start.

## Code-quality findings — wp8-sublime-hotkey (2026-06-19)
- **Pointer:** 3 MINOR findings from `feature-review-quality` on ship commit `74dfc2c` (0 CRITICAL, 0 MAJOR). MINOR #1 (stale "global-shortcut handler" rationale in the WIP Discoveries + the SURFACE-...-ARCH-SUBLIME-LAUNCH-MECHANISM entry) was FIXED IN-PLACE — the launch is frontend-initiated via `sublime_open`, not from a global-shortcut handler. The 2 remaining are cosmetic doc nits (inconsistent WP3 probe-section citation shorthand in `sublime/mod.rs`; `chord.ts` "Phase 2" header tag reads oddly standalone). The feature survived a mid-flight OS-global→in-app spec reversal with no live remnants. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp8-sublime-hotkey — 2026-06-19` section.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** both remaining MINORs are 1-line comment edits — fold into the WP8 arch-resync at finalize, a `/feature-refactor` pass, or leave. Dismiss any via the WIP's `## Code-Quality Review` section.

## Code-quality findings — wp7-pty-cc-session (2026-06-19)
- **Pointer:** 4 MINOR findings from `feature-review-quality` on ship commit `50ca322` (0 CRITICAL, 0 MAJOR). Low-stakes: (1) `cc_kill` comment says SIGTERM but code does `/exit\r`→SIGKILL (comment drift); (2) `kill_all` serializes 3s grace windows under the registry lock — blocks window close at N>1 (Phase-2 N-clamp concern); (3) `onSessionId` inline-arrow in the spawn-effect dep array (safety is incidental via the phase guard, not structural); (4) rAF fit+focus pattern duplicated mount/post-spawn. Backend module rated the strongest part of the diff. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp7-pty-cc-session — 2026-06-19` section.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** all four are cleanup/comment fixes — fold into a `/feature-refactor` pass or the Phase-2 multi-workspace work (the `kill_all`-scaling + `onSessionId`-dep ones naturally pair with the WP13 N-clamp lift). Dismiss any via the WIP's `## Code-Quality Review` section if not worth it.

## Code-quality findings — wp6-project-config-store (2026-06-18)
- **Pointer:** 2 MAJOR + 3 MINOR findings from `feature-review-quality` on ship commit `525b7e8` (0 CRITICAL). MAJORs: the picker's IPC boundary has no error handling (mount loader silently swallows a rejected `list_projects`, masking a malformed `projects.json` as empty; mutation handlers drop rejections as unhandled promise rejections). MINORs: `add_project` doesn't refresh recents (asymmetry vs `handleRemove`), `add_project`/`record_open` byte-identical bodies, `now_ms()` `unwrap_or(0)` sentinel collides with recency ordering. Backend rated exemplary. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp6-project-config-store — 2026-06-18` section.
- **Priority:** medium (MAJORs — picker error-surfacing, load-bearing for Phase 2 multi-workspace shell) + low (MINORs)
- **Status:** pending
- **Pickup shape:** address the IPC error-handling MAJOR in a `/feature-refactor` pass or fold into the Phase 2 picker work; the MINORs are low-effort polish. Dismiss any via the WIP's `## Code-Quality Review` section if not worth it.

## SURFACE-2026-06-19-ARCH-SUBLIME-LAUNCH-MECHANISM
- **Source:** feature:build (WP8 Phase 1)
- **Target level:** product:arch
- **Type:** tech-debt
- **Summary:** WP8 launches Sublime via `std::process::Command`, not `tauri-plugin-shell` as arch.md:27,113 state.
- **Context:** WP8's `sublime_open` command (called from the frontend button + in-app ⌘⇧E handler) spawns `subl`/`open` directly; a std spawn is the natural fit (consistent with cc_session spawning `claude`) and avoids an unneeded plugin + capability surface. [Corrected 2026-06-19 per review-quality: original said "backend-initiated from the global-shortcut handler" — that handler was torn out; the launch is frontend-initiated.] Same class of as-built delta as WP7's portable-pty-vs-tauri-plugin-pty.
- **Suggested action:** Resync arch.md:27,113 at WP8 finalize to reflect the std-process launch. Note arch.md's OS-global global-shortcut + Accessibility flow (arch.md:26,88,96,97,114,162-168,193) is ALSO superseded by WP8's in-app-keybinding spec — resync those lines too.
- **Priority:** low
- **Status:** RESOLVED 2026-06-19 (WP8 finalize) — arch.md resynced (tech-stack, diagram, component table, happy-path, Key Decision, PATH prereq) + CLAUDE.md resynced (tech stack, project tree, prereqs, Key Decisions, WP8 headline, status line). Launch now documented as `std::process::Command` via `sublime_open`; OS-global + Accessibility flow removed.

## SURFACE-2026-06-19-ARCH-SUBL-PROJECT-FLAG-SUPERSEDED
- **Source:** feature:build (WP8 Phase 1)
- **Target level:** product:arch
- **Type:** tech-debt
- **Summary:** arch.md:113,167 still say hotkey-pop uses `subl --project <file>` when a `.sublime-project` exists; the WP3 probe superseded this.
- **Context:** WP3 found `subl --project` does NOT activate Sublime Text on cold start, which contradicts the hotkey-pop intent. The correct invocation is `subl <dir>` (ST auto-loads any project file in the folder). WP8 follows the WP3 contract; arch.md was never updated.
- **Suggested action:** Resync arch.md:113,167 at WP8 finalize to drop the `--project` mention.
- **Priority:** low
- **Status:** RESOLVED 2026-06-19 (WP8 finalize) — arch.md component table + happy-path now say `subl <dir>` / "never `--project`/`--new-window`"; the `subl --project` mention is gone.

## SURFACE-2026-06-18-MEMORY-MD-PRETTIER-NITS
- **Source:** feature:build (WP6 Phase 2 — gate run)
- **Target level:** product:wbs (housekeeping; no WP)
- **Type:** tech-debt
- **Summary:** `pnpm format:check` flags two tracked files as not Prettier-clean: `.claude/memory/macos-tcc-permissions-granted.md` and `.claude/memory/tauri-command-removal-needs-invoke-sweep.md`. Pre-existing (last touched in commit `90ae5ef`, before WP5); unrelated to WP6 source.
- **Context:** `.prettierignore` lists `docs/`, `workflow/`, `CLAUDE.md`, `runtimes.md` as hand-authored prose exempt from Prettier, but NOT `.claude/memory/`. These memory files are likewise hand-authored prose and arguably belong in the ignore list — or should be one-shot `prettier --write`-formatted. Either way, not WP6's job.
- **Suggested action:** Either add `.claude/memory/` to `.prettierignore` (consistent with the other hand-authored-prose exemptions) OR run `pnpm format` once to normalize them. Decide in a housekeeping pass.
- **Priority:** low
- **Status:** open

## SURFACE-2026-06-18-PICKER-SCALES-TO-MANY-PROJECTS
- **Source:** feature:build (WP5 Phase 2 verify-human — operator request)
- **Target level:** product:wbs (WP6 — Project config store + picker wiring)
- **Type:** new-work (picker UX at real scale)
- **Summary:** The project picker must scale to 20+ rotating projects (the operator's actual workflow) and KEEP every project indefinitely — entries leave only on explicit manual delete, never auto-eviction. WP5 added the UI-only pieces against mock data: a scrollable recents list (`max-height:60vh; overflow-y:auto`) + a per-row delete (×) button that filters the mock array. The real-data pieces remain for WP6: persistence-backed delete via `remove_project` (not just in-memory filter), recency ordering via `record_open`/`last_opened_at`, and — once N is large — a filter/search box over the list (NOT built in WP5).
- **Context:** The keep-everything/manual-delete semantics are already the design intent (CLAUDE.md: flat `projects.json`, ≤100 entries, read-on-open). WP5's mock proves the layout; WP6 has the real store to wire delete + ordering + (new) search against.
- **Suggested action:** In WP6: wire `remove_project` to the × button; order the list by `last_opened_at` desc; add a filter/search input above the recents list (incremental substring match on display_name + path) gated on the list being long enough to warrant it.
- **Priority:** medium (load-bearing for WP6 picker usability at the operator's real project count)
- **Status:** RESOLVED 2026-06-18 — WP6 (commit 525b7e8) wired `remove_project` to the × (real persistence), ordered recents by `last_opened_at` desc, and added an always-present filter/search input (case-insensitive substring on `display_name` + `project_path`; pure `matchesFilter`, 6 vitest cases). Operator-approved in native shell.

## SURFACE-2026-06-16-ARCH-THUMBNAIL-MECHANISM-NONVIABLE
- **Source:** feature:research (WP4 thumbnail-rendering probe)
- **Target level:** docs/product/arch.md §"Phase 1 thumbnail-rendering probe" (+ Phase 2 §B.1 filmstrip)
- **Type:** doc-correction (load-bearing for Phase 2 filmstrip/PiP design)
- **Summary:** arch.md describes the thumbnail mechanism as "mount each background xterm full-size off-screen (`left:-99999px`) and render the filmstrip tile as a `scale(0.15)` live mirror of that off-screen DOM." This is **non-viable**: (1) a DOM node has one parent, so one xterm subtree can't appear in both an off-screen container and a filmstrip tile; (2) xterm.js `RenderService` registers an `IntersectionObserver({threshold:0})` that auto-pauses the renderer for off-viewport terminals — so the off-screen DOM you'd mirror is stale anyway (PR xtermjs/xterm.js#1144).
- **Suggested action:** WP4's decision report (P3.4/P3.5) corrects the arch.md text. Real mirror mechanisms are: relocate the single element (focused tile only), `cloneNode` per frame, or — recommended — `@xterm/addon-serialize` `serializeAsHTML()` from the buffer (works while renderer paused). Also note the architectural gift: off-viewport/collapsed workspaces get renderer-pause for free in Phase 2.
- **Priority:** medium (resolved by WP4 report; not blocking any Phase 1 build)
- **Status:** RESOLVED 2026-06-17 — WP4 (commit 3ae90eb) corrected arch.md §"Phase 1 thumbnail-rendering probe" (CORRECTION + OUTCOME blocks) and §B.1 filmstrip text, and proved `serializeAsHTML()` viable + beating cloneNode. See `docs/product/wp4-thumbnail-probe-outcome.md`.

## SURFACE-2026-06-16-CC-SLASH-COMMANDS-NEED-CR-NOT-LF
- **Source:** feature:build (WP2 probe — original surface SURFACE-2026-06-16-CC-EXIT-REQUIRES-TWO-KEYSTROKES, superseded after a 2026-06-16 follow-up observable probe)
- **Target level:** product:wbs (WP7 — PtyCcSession)
- **Type:** new-work (WP7 design constraint — load-bearing)
- **Summary:** Claude Code's TUI runs in raw mode. `\n` (LF) is treated as a literal character, NOT as Enter. **`\r` (CR, byte `0x0d`) is the Enter key.** Every slash-command byte-injection MUST end in `\r` to actually execute. Writing `/cmd\n` silently produces typed-but-not-executed bytes — autocomplete may appear but the command never runs.
- **Context:** WP2's original (b) finding claimed `/help\n` worked because the autocomplete dropdown appeared in the output. The follow-up probe showed the dropdown is a typeahead UI side-effect, NOT command execution. Comparing `/help\n` vs `/help\r` proves it: LF gives the dropdown; CR gives `/help`'s actual body (keyboard-shortcut list + doc link). Same rule for `/exit`: `/exit\n` types-but-doesn't-execute; `/exit\r` cleanly exits with code 0 in <5s.
- **Suggested action:** WP7's `CcSession::send_slash_command(cmd)` writes `format!("{cmd}\r").as_bytes()` to the PTY. Shutdown path can use either `Ctrl+D x2` (still works, the original finding) OR the cleaner `/exit\r` (one deterministic byte sequence, no race window). Reference code shapes: `src-tauri/examples/cc_pty_probe.rs::run_exit_via` with `&[b"/exit\r"]` (cleanest), or with `&[&[0x04], &[0x04]]` (control-char fallback). The harness now has both paths and the `inject` vs `inject-cr` modes demonstrate the LF/CR distinction directly.
- **Priority:** high (load-bearing for all of WP7's byte-injection paths, not just shutdown)
- **Status:** RESOLVED 2026-06-19 (WP7, commit `50ca322`) — `cc_session::slash_command_bytes(cmd)` strips any trailing CR/LF and appends exactly one `\r`; it is the single chokepoint for all Claudesk-originated slash commands (currently `kill()`'s `/exit\r`, plus Phase-2 injection). Codified by `slash_command_appends_cr_not_lf` + `slash_command_does_not_double_terminate` + `slash_command_preserves_arguments` cargo tests. verify-human confirmed a typed slash command executes on Enter against the real `claude` binary.

## SURFACE-2026-06-16-CC-EXIT-REQUIRES-TWO-KEYSTROKES (SUPERSEDED by SURFACE-2026-06-16-CC-SLASH-COMMANDS-NEED-CR-NOT-LF)
- **Status:** superseded
- **Note:** The original finding (Ctrl+D x2 required, `/exit\n` doesn't exit) was correct as far as it went, but the follow-up probe revealed the root cause (raw-mode LF vs CR) and a cleaner shutdown path (`/exit\r`). Kept here as a pointer; live finding is the entry above.

## Code-quality findings — wp1-tauri-scaffold (2026-06-16)
- **Pointer:** 4 MAJOR + 5 MINOR findings from `feature-review-quality` on commit `c50a785`. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp1-tauri-scaffold — 2026-06-16` section.
- **Priority:** medium (MAJORs) + low (MINORs)
- **Status:** RESOLVED 2026-06-17 (refactor pass) — all 9 fixed: HTML title → Claudesk, README scaffold text replaced, window 800x600→1280x800, demo `greet` command + handler removed, `.prettierrc.json` given explicit `trailingComma: "all"`, eslint flat-config comment added, smoke values aligned (1+1 both sides), pnpm-workspace migration comment added, `vite.config.ts` `@ts-expect-error` → `import process from "node:process"`.

## Code-quality findings — wp2-cc-pty-probe (2026-06-16)
- **Pointer:** 4 MINOR findings from `feature-review-quality` on commit `875e161`. Polish for the kept-in-tree probe harness (shutdown duplication, reader-thread lifecycle comment, WIP state marker drift, ReaderSink enum). See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp2-cc-pty-probe — 2026-06-16` section.
- **Priority:** low (all)
- **Status:** RESOLVED 2026-06-17 (refactor pass) — 3 fixed (shutdown-paths-diverged clarifying comment, reader-thread EOF lifecycle comment, stale `**State:**` body line dropped); 1 DISMISSED (`ReaderSink` enum — explicit inline readers are clearer for reference/`examples/` code; the EOF invariant is now single-sourced by the lifecycle comment). Rationale in the WIP's Code-Quality Review section.

## Code-quality findings — wp3-sublime-cli-probe (2026-06-16)
- **Pointer:** 2 MAJOR + 4 MINOR findings from `feature-review-quality` on commit `cc72c4d`. MAJORs: stuck SURFACED leaf under a `[x]` Phase 1 parent (Work Tree invariant violation), and observation-vs-inference flattening in the invocation matrix (T8/T9/T11 inference-grade rows look identical to T7/T10 observation-grade rows). MINORs: stale state-prose drift, superscript footnote markers, stale `Unvisited:` sequence, runtimes.md timeout-formula deviation. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp3-sublime-cli-probe — 2026-06-16` section.
- **Priority:** medium (MAJORs) + low (MINORs)
- **Status:** RESOLVED 2026-06-17 (refactor pass) — all 6 fixed: stuck SURFACED leaf deleted from Work Tree, both invocation matrices gained a `Source: observed|inferred` column + legend (all ST rows correctly marked `inferred` per the consent rule), footnotes folded inline (superscripts removed), stale `**State:**` body line dropped, `Unvisited:`/Current Node updated to complete, runtimes.md 120s-safety-floor policy documented as an intentional clamp.

## Code-quality findings — wp4-thumbnail-rendering-probe (2026-06-17)
- **Pointer:** 2 MINOR findings from `feature-review-quality` on commit `3ae90eb` (0 CRITICAL, 0 MAJOR; a 3rd MINOR — stale Phase-3 tree header — was fixed in-place). Polish on the durable probe pieces: a missing clarifying comment on the center terminal's no-serializer choice, and a `void duration;` scaffolding no-op in `replay.ts`. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp4-thumbnail-rendering-probe — 2026-06-17` section.
- **Priority:** low (all)
- **Status:** RESOLVED 2026-06-17 (refactor pass) — both fixed: center-terminal no-serializer clarifying comment added in `Harness.tsx`; `void duration;` no-op removed from `replay.ts` (dropped the unused local destructure; `CastData.duration` field retained).

## Code-quality findings — wp5-frontend-ui-prototype (2026-06-18)
- **Pointer:** 3 MINOR findings from `feature-review-quality` on ship commit `777c0b8` (0 CRITICAL, 0 MAJOR). All cosmetic stylesheet/intent-clarity nits, zero correctness impact: inert `flex-shrink` on `.filmstrip` (grid parent), `XtermPane` effect dep could be `[]`, single-consumer global `h1` rule. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp5-frontend-ui-prototype — 2026-06-18` section.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** address in a `/feature-refactor` pass (or fold into WP16 filmstrip work for the `.filmstrip` nit); dismiss via the WIP's `## Code-Quality Review` section if not worth it.
