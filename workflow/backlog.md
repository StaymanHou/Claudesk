# Backlog

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
- **Status:** open

## SURFACE-2026-06-16-CC-EXIT-REQUIRES-TWO-KEYSTROKES (SUPERSEDED by SURFACE-2026-06-16-CC-SLASH-COMMANDS-NEED-CR-NOT-LF)
- **Status:** superseded
- **Note:** The original finding (Ctrl+D x2 required, `/exit\n` doesn't exit) was correct as far as it went, but the follow-up probe revealed the root cause (raw-mode LF vs CR) and a cleaner shutdown path (`/exit\r`). Kept here as a pointer; live finding is the entry above.

## Code-quality findings — wp1-tauri-scaffold (2026-06-16)
- **Pointer:** 4 MAJOR + 5 MINOR findings from `feature-review-quality` on commit `c50a785`. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp1-tauri-scaffold — 2026-06-16` section.
- **Priority:** medium (MAJORs) + low (MINORs)
- **Status:** pending
- **Pickup shape:** run `/feature-refactor` against this feature to clean up scaffold-debt; ideally before WP5's UI lands on top. To dismiss specific findings, edit the WIP's `## Code-Quality Review` section and mark `[DISMISSED]`.

## Code-quality findings — wp2-cc-pty-probe (2026-06-16)
- **Pointer:** 4 MINOR findings from `feature-review-quality` on commit `875e161`. Polish for the kept-in-tree probe harness (shutdown duplication, reader-thread lifecycle comment, WIP state marker drift, ReaderSink enum). See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp2-cc-pty-probe — 2026-06-16` section.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** run `/feature-refactor` against this feature when WP7 starts using the harness as a reference. To dismiss specific findings, edit the WIP's `## Code-Quality Review` section and mark `[DISMISSED]`.

## Code-quality findings — wp3-sublime-cli-probe (2026-06-16)
- **Pointer:** 2 MAJOR + 4 MINOR findings from `feature-review-quality` on commit `cc72c4d`. MAJORs: stuck SURFACED leaf under a `[x]` Phase 1 parent (Work Tree invariant violation), and observation-vs-inference flattening in the invocation matrix (T8/T9/T11 inference-grade rows look identical to T7/T10 observation-grade rows). MINORs: stale state-prose drift, superscript footnote markers, stale `Unvisited:` sequence, runtimes.md timeout-formula deviation. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp3-sublime-cli-probe — 2026-06-16` section.
- **Priority:** medium (MAJORs) + low (MINORs)
- **Status:** pending
- **Pickup shape:** run `/feature-refactor` against this feature when polishing probe writeups; the two MAJORs are quick wins (one delete-leaf, one column-add). To dismiss specific findings, edit the WIP's `## Code-Quality Review` section and mark `[DISMISSED]`.

## Code-quality findings — wp4-thumbnail-rendering-probe (2026-06-17)
- **Pointer:** 2 MINOR findings from `feature-review-quality` on commit `3ae90eb` (0 CRITICAL, 0 MAJOR; a 3rd MINOR — stale Phase-3 tree header — was fixed in-place). Polish on the durable probe pieces: a missing clarifying comment on the center terminal's no-serializer choice, and a `void duration;` scaffolding no-op in `replay.ts`. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp4-thumbnail-rendering-probe — 2026-06-17` section.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** address when lifting `replay.ts`/`frameStats.ts` into Phase 2's filmstrip (those are the reusable pieces). To dismiss, edit the WIP's `## Code-Quality Review` section and mark `[DISMISSED]`.
