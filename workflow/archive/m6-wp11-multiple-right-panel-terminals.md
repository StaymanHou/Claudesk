# Feature: Multiple terminals in the right panel (M6 WP11)

**Workflow:** feature
**State:** COMPLETED 2026-06-28
**Created:** 2026-06-28
**Shipped:** 2026-06-28 — commit `f9e3292` on local `main` (NOT pushed; v0.2.2 via /release later)
**Finalized:** 2026-06-28 — WBS WP11 ✅, parent SURFACE fully resolved, review 0C/0M/3 MINOR backlogged, archived.
**Entry:** spec (complex feature — real UX-shape design choice; new frontend model)
**Drive mode:** autopilot
**Milestone:** M6 (friend-requested QoL — open collection)
**Source:** `SURFACE-2026-06-27-RIGHT-PANEL-TERMINAL-ZOOM-AND-MULTIPLE` part 2 (part 1 = zoom, shipped as WP10)

## Problem Statement

The right-panel **Terminal** slot holds exactly **one** login shell per workspace today
(`RightPanelHost` mounts one `TerminalPane`, which hardcodes the session id
`${workspaceId}-term`). A friend-user (and the operator) want to run more than one shell
per project at once — e.g. a dev server in one, `git` / ad-hoc commands in another —
without losing either. WP11 adds the ability to **open, switch between, and close N
terminals** within the existing Terminal panel.

The backend is already N-ready: `term_spawn` + the session-id-keyed
input/resize/kill commands + the `cc-output-<sid>`/`cc-exit-<sid>` event streams are
session-id-keyed and command-agnostic, and each `XtermPane`'s unmount cleanup reaps its
own backend PTY (`cc_kill` on its keyed `sessionId`, `XtermPane.tsx` ~290–320). So this
is a **frontend-shape change** — a terminal-list model + a sub-tab switcher inside the
Terminal panel — not a backend change.

## User Stories

- As the operator, I want to open a **second (third, …) terminal** in a workspace's right
  panel so I can run a long-lived process (dev server) in one and ad-hoc commands in
  another, without killing either.
- As the operator, I want to **switch between** my open terminals and find each one's
  **scrollback intact** (the inactive ones keep running and buffering, like the CC
  session and the single terminal do today).
- As the operator, I want to **close** a terminal I'm done with (its shell is reaped),
  and have at least one terminal remain (closing the last one is either disallowed or
  re-spawns a fresh one — see AC).
- As the operator, I want **⌘T to open a new terminal** and **⌘W to close the focused
  terminal** when a terminal holds focus, mirroring browser/editor tab muscle-memory —
  in addition to clickable ＋ / ✕ buttons.

## Design Decisions (settled at spec, 2026-06-28)

1. **Layout = sub-tab row (NOT splits).** A thin tab strip *inside* the Terminal panel
   (`●1 │ ●2 │ ●3 │ ＋`), one terminal visible at a time, the rest kept mounted with
   `display:none`. Mirrors the existing Editor/Diff/Terminal panel-tab idiom and the
   editor's `PaneTabs`. **No split panes in v1.** *(Operator chose "Sub-tab row"; aligns
   with `[PRIOR: explicit-selectable-mode-over-inferred-mode]` — the lower-UI-bug-surface
   option for an uncertain-value friend ask; splits drag in reflow/fit/timing surface not
   worth paying down until demand is real. Splits remain a clean future seam on the same
   terminal-list model.)*

2. **Add/close = buttons + chords.**
   - **＋ button** in the terminal sub-tab row → opens a new terminal (new entry, made
     front + focused).
   - **✕ on each tab** (hover-revealed, like the FileTree per-row ✕) → closes that
     terminal.
   - **⌘T** (bare ⌘ + "t", no Shift) → new terminal. Confirmed **unbound** today
     (`panelHost.ts` matches "t" only WITH Shift = ⌘⇧T panel-select; bare ⌘T is free).
   - **⌘W** → close the **focused** terminal — but ONLY when focus is inside a term-pane.
     ⌘W is already the editor close-tab chord (`closeTabChord.ts`, registered in
     `RightPanelHost`'s capture-phase listener). The terminal-close must be scoped via
     the same `deriveRightSurface(document.activeElement) === "terminal"` read WP10 uses,
     and must intercept ⌘W **before** the editor's close-tab handler when a terminal is
     focused (capture-phase ordering / a shared scoped check). When the editor (not a
     terminal) is focused, ⌘W keeps closing the editor tab unchanged.

3. **Persistence = none (ephemeral).** On app restart a workspace re-opens with a
   **single fresh terminal** (current behavior). Terminals are ephemeral like the CC
   session — a re-spawned shell can't restore scrollback or a running process, so
   remembering the count adds state for no real restore value. *(Operator chose "No —
   ephemeral"; matches the WBS lean + the CC-session posture.)*

4. **Keep-mounted per terminal.** Each open terminal's `XtermPane` stays MOUNTED; the
   non-front ones are hidden with `display:none` (consistent with the
   all-panels-stay-mounted invariant and the single-terminal posture today). Scrollback
   + the running shell survive switching between terminals AND switching the right panel
   away (Editor/Diff) AND a center-stage switch.

5. **Distinct session ids.** Drop the hardcoded `${workspaceId}-term` →
   `${workspaceId}-term-<n>` (a stable per-terminal suffix), so each terminal is its own
   backend PTY session and its own `cc-output-<sid>`/`cc-exit-<sid>` stream. The first
   terminal MAY keep `${workspaceId}-term` for continuity, or move to `-term-0`/`-term-1`
   — settle the exact id scheme at plan time (must be stable across re-renders, unique
   per terminal, and collision-free with the CC session id `${workspaceId}`).

## Acceptance Criteria

The feature is done when:

- The Terminal panel shows a **sub-tab row** when ≥1 terminal exists; a ＋ control opens
  a new terminal (made front + focused).
- Opening 2+ terminals and **switching** between them shows each one's **scrollback
  intact** and its shell still running (the inactive ones kept mounted, buffering).
- **Closing** a terminal (✕ or ⌘W-when-terminal-focused) **reaps its shell** (the backend
  PTY session is killed — verifiable via `pgrep` for the shell going away on the
  installed/dev app) and removes its tab; focus/front moves to a sibling terminal.
- **⌘T** opens a new terminal; **⌘W** closes the focused terminal ONLY when a terminal
  holds focus, and leaves the editor's ⌘W close-tab behavior unchanged when the editor is
  focused. ⌘T does not collide with ⌘⇧T (panel-select) or any other chord.
- **Closing the last terminal** behaves per the plan-time decision (see Open Questions) —
  either the close is disallowed (the last tab has no ✕ / ⌘W is inert) OR a fresh
  terminal is re-spawned so the panel is never empty. The chosen rule is consistent and
  documented.
- **Closing the workspace** reaps ALL N shells (the per-pane unmount `cc_kill` covers each
  `XtermPane`; `kill_all` on window close covers any straggler).
- **WP10 zoom coupling:** focus-scoped ⌘+/⌘−/⌘0 zooms **whichever terminal is focused**
  among the N (not only the first). The WP10 router currently drives a single
  `termPaneRef` (`Workspace.tsx`); WP11 must route the zoom to the *focused* terminal's
  handle (thread the focused-terminal handle, or have the router resolve the focused
  term-pane). The `deriveRightSurface` `closest('[data-testid="term-pane"]')` read still
  works for N (each `XtermPane` carries `testId="term-pane"`); the gap is *which* handle
  `setFontSize` is applied to.
- No regression: a workspace with a single terminal behaves exactly as today (the tab row
  may show one tab + ＋, or be minimal for N=1 — a plan-time polish call).
- `tsc --noEmit`, `eslint` (scoped to changed files), and `pnpm vite build` are clean;
  the full vitest suite passes; new pure logic (the terminal-list model + the ⌘T/⌘W
  scoped predicates) has unit coverage.

## Out of Scope

- **Split panes** (side-by-side / stacked simultaneous terminals) — deferred future seam
  on the same terminal-list model; v1 is tabs only.
- **Persisting terminals across app restart** (count or state) — ephemeral by decision 3.
- **Per-terminal naming / renaming** — terminals are numbered (●1/●2/…); custom labels
  are a possible future polish, not v1.
- **Per-terminal working-directory choice** — every terminal `cd`s into the workspace
  project dir (today's behavior). A "new terminal in subdir" affordance is out of scope.
- **Multiple CC sessions** in the LEFT half — WP11 is the RIGHT-panel shell terminal only;
  the left CC terminal stays single (one workspace = one CC session, per vision).
- **A reorder/drag of terminal tabs** — fixed open-order for v1 (the editor PaneTabs don't
  reorder either).

## Technical Constraints

- **No 3rd-party dependency** — pure in-app frontend over confirmed seams. (3rd-party
  probe check: N/A.)
- **Backend is N-ready, do not change it** — `term_spawn`, the session-id-keyed
  input/resize/kill commands, and the `cc-output-<sid>`/`cc-exit-<sid>` streams already
  support N sessions. The per-pane unmount `cc_kill` (`XtermPane.tsx` ~290–320) reaps each
  terminal's shell generically. Confirm during build that no backend change is needed; if
  one IS, surface it (the WBS asserts none).
- **All-panels/workspaces-stay-mounted invariant** (CLAUDE.md) — non-front terminals are
  `display:none`, never unmounted-on-switch. A terminal unmounts ONLY when its tab is
  closed (which is the intended reap) or the workspace closes.
- **Chord-ownership** (`editor/paletteCommands.ts` matrix): ⌘T must be added as a NEW
  bare-⌘ chord (no Shift) — disjoint from ⌘⇧T (panel-select), ⌘P (finder), ⌘1..9
  (editor tab-switch), ⌘W (editor close). ⌘W-for-terminal must be SCOPED so it never
  double-fires with the editor close-tab handler. ⌘⇧+digit is reserved for filmstrip
  (memory `[[cmd-shift-digit-reserved-for-filmstrip]]`) — do NOT bind it.
- **Repo posture: pure logic → vitest, live DOM → MCP-bridge verify-self / Playwright.**
  The terminal-list reducer + the ⌘T / scoped-⌘W predicates are pure → unit-tested; the
  live switch/scrollback/reap behavior is driven via the `tauri` MCP bridge against a
  scratch workspace (`tmp/scratch/scratch-a`), then carried to operator verify-human for
  the `pgrep`-class reap + installed-build smoke test.
- **Verify-self fidelity** (CLAUDE.md): DOM-read / JS-exec / click / screenshot are
  high-fidelity via the bridge; **raw xterm typing is low-fidelity** — trigger terminal
  open/switch/close via clicks + IPC, not by typing into a shell. The shell-reap
  (`pgrep`) outcome is operator-only (backend process the webview can't see).

## Plan-time decisions (settled 2026-06-28, the 5 spec Open Questions)

1. **Last-terminal-close rule = DISALLOW closing the last terminal.** The final tab
   shows no ✕ and ⌘W is inert when only one terminal exists. Mirrors "the Terminal panel
   always has at least one shell"; simplest, no empty-panel state. *(Chosen lean.)*
2. **Session-id scheme = renumber all to `${workspaceId}-term-<n>`** (`n` a monotonic
   counter per workspace, starting at 0). Stable across re-renders (the list entry holds
   its own `sessionId`), unique per terminal, collision-free with the CC id
   (`${workspaceId}`, no `-term-` suffix). **Verified no persisted localStorage state
   keys off the old `${workspaceId}-term` id** (the only terminal-related key,
   `claudesk.terminal.fontSize`, is workspace-agnostic/global) — the rename is safe.
3. **N=1 tab-row presentation = ALWAYS show the sub-tab row** (one tab + ＋). Predictable,
   and the ＋ has a stable home. A single-terminal workspace gets a one-tab row, not a
   bare pane. *(Chosen lean.)*
4. **Max terminal count = soft cap 8.** The ＋ button disables (+ a title hint) at 8
   open terminals per workspace; bounds resource use + keeps the tab row readable. *(Chosen
   lean.)*
5. **WP10 zoom routing = router resolves the focused term-pane's handle at chord time.**
   The terminal-list holds a `Map<sessionId, XtermPaneHandle>` (refs registered per
   mounted pane); the `Workspace` zoom router, on a `deriveRightSurface === "terminal"`
   hit, resolves WHICH terminal handle to drive by reading the focused element's
   `data-session-id` (or the active-terminal id), not a single hardcoded `termPaneRef`.
   This makes the zoom follow the focused terminal among N. *(Chosen lean.)*

## Next Step

No 3rd-party dependency and no technical unknowns. Plan complete — run `/feature-build`
for Phase 1.

## Work Tree

- [x] Phase 1: Terminal-list model + sub-tab switcher  <!-- status: COMPLETE -->
  **Goal:** Replace the single hardcoded `TerminalPane` in `RightPanelHost`'s terminal
  slot with a terminal-list model (N entries, each `{ id, sessionId }`) + a sub-tab row
  (`●1 │ ●2 │ ＋`) that opens / switches / closes terminals via buttons. All terminals
  kept MOUNTED (display:none for non-front); distinct `${workspaceId}-term-<n>` session
  ids. Disallow-closing-last + soft-cap-8 enforced. Buttons only this phase (chords land
  in Phase 2).
  **Observable outcomes:**
  - Browser (MCP bridge, scratch-a workspace): open the Terminal panel → a sub-tab row is
    present (`[data-testid^="term-tab-"]` ≥ 1 tab) with a ＋ control
    (`[data-testid="term-tab-add"]`). Single terminal at start.
  - Browser: click ＋ → a 2nd term-tab appears and becomes active (`aria-selected="true"`);
    a 2nd `[data-testid="term-pane"]` exists in the DOM (both mounted; one visible, one
    display:none). `webview_execute_js` confirms exactly 2 `.xterm` instances under the
    terminal slot, 1 with non-zero offsetParent.
  - Browser: click the first tab → it becomes active; the previously-active pane goes
    display:none, the first becomes visible. Switching back shows scrollback intact
    (the screenshot of pane 1 is unchanged from before the switch).
  - Browser: with 2 terminals, click a tab's ✕ (`[data-testid^="term-tab-close-"]`) → that
    tab + its pane are removed; 1 terminal remains, made active.
  - Browser: with 1 terminal, NO ✕ is rendered on the sole tab
    (`term-tab-close-*` count === 0) — disallow-closing-last.
  - Browser: open terminals up to 8 → the ＋ control is disabled (`disabled` attr present);
    opening is blocked at the cap.
  - CLI: `pnpm exec tsc --noEmit` exits 0; `pnpm exec eslint <changed files>` exits 0;
    `pnpm vite build` exits 0 (no broken imports/JSX across the change).
  - CLI: `pnpm vitest run <new model test>` — the pure terminal-list reducer
    (open/close/switch/cap/last-guard/id-assignment) passes its unit table.
  - [x] P1.1 Pure terminal-list model module (`terminalList.ts`): `TerminalEntry { id;
        sessionId }`, `TerminalListState { entries; activeId; counter }`, and the pure ops
        `openTerminal` (append `-term-<counter>`, cap-8 no-op at limit, new entry active),
        `closeTerminal` (remove by id, disallow-last no-op, reactivate left neighbour),
        `switchTerminal`, `terminalSessionId`, `initialTerminalList`, `isLastTerminal`,
        `canOpenTerminal`. Monotonic counter (never reused id). No React/DOM.  <!-- status: COMPLETE -->
  - [x] P1.2 Unit tests `__tests__/terminalList.test.ts` (17 cases, all pass): open grows
        + activates + monotonic-unique ids; close removes + reactivates left sibling (+ new
        first when first closed); close-last no-op; cap-8 blocks open #9; never-reuse-id
        after close; switch/predicates. id collision-free with the CC id.  <!-- status: COMPLETE -->
  - [x] P1.3 Lifted the terminal-list state into `RightPanelHost` (per-workspace
        `useState(() => initialTerminalList(workspaceId))`, seeded with `-term-0`). Replaced
        the single `<TerminalPane>` with N panes (one per entry, keyed by `entry.id`), each
        in a `.term-pane-slot` shown only when active (display:flex/none — keep-mounted).
        `TerminalPane` now takes an explicit `sessionId` prop (dropped the hardcoded
        `${workspaceId}-term`); forwards it as XtermPane's session key + `data-session-id`
        (the latter for Phase-3 zoom routing). The forwarded `terminalPaneRef` attaches to
        the ACTIVE terminal (Phase 1 keeps WP10 zoom routing to the front terminal; Phase 3
        generalizes to a registry).  <!-- status: COMPLETE -->
  - [x] P1.4 Sub-tab row inside the terminal slot (always shown — plan decision 3): a
        `.term-tab` per entry (`data-testid="term-tab-<id>"`, `aria-selected`, click →
        switch, hover ✕ `data-testid="term-tab-close-<id>"` rendered only when NOT the last
        — disallow-last) + a ＋ `data-testid="term-tab-add"` disabled at cap 8 (title hint).
        Opening flips the panel to terminal + makes the new one active. CSS `.term-tab-*` /
        `.term-panes` / `.term-pane-slot` added to App.css (dark-only, mirrors panel-tab
        tokens).  <!-- status: COMPLETE -->
  - [x] P1.5 Shell-reap-on-close wiring trace: closing a tab → `closeTerminal` removes the
        entry → its `<TerminalPane>` (keyed by `entry.id`) unmounts → XtermPane's existing
        unmount cleanup (`XtermPane.tsx` ~290–320) runs `cc_kill` on that pane's session id.
        Generic + per-pane, so it covers each of the N terminals with NO new backend code.
        Workspace-close reap (all N) + the live `pgrep` confirmation carried to verify-human
        (backend process the webview can't observe).  <!-- status: COMPLETE -->
  - [x] verify-auto  <!-- status: COMPLETE — tsc 0, eslint 0-err (1 pre-existing XtermPane warning), terminalList 17/17 + terminalSlotGuard 7/7 pass -->
  - [x] verify-self  <!-- status: COMPLETE — all 6 Observable Outcomes PASS via MCP bridge (scratch-a). sub-tab row present (1 tab + ＋); ＋ opens a 2nd terminal (2 panes mounted, 1 display:flex / 1 display:none, distinct sessions cc-2/cc-3); tab-switch keeps scrollback intact + independent buffers (MARK_TERM_A vs MARK_TERM_B survived the switch); ✕ closes + removes a terminal + REAPS its shell (pgrep: cc-3's zsh gone, sibling alive); no ✕ on the sole tab (disallow-last); ＋ disabled at cap 8 (8 panes, title "Maximum 8 terminals", held under 10 rapid clicks). BONUS: deferred-spawn-on-reveal confirmed (only active terminals spawn shells; revealing a deferred one spawns it). The plan's pgrep-to-verify-human reap was observable in-session — still carry the INSTALLED-build smoke test to verify-human. -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [x] verify-human  <!-- status: COMPLETE — operator: "all pass vh.4 deferred" (vh.1–3 PASS; vh.4 DEFERRED-TO-RELEASE per [[installed-build-verify-deferred-to-release]]) -->
    - [x] P1.verify-human.1 Real-keyboard pass in a real workspace: open 2–3 terminals
          (＋), run a DIFFERENT command in each (e.g. `ls`, `pwd`, `echo hi`), switch
          between them — each shows its own scrollback + the shell is responsive (you can
          type into the front one).  <!-- status: COMPLETE — operator PASS -->
    - [x] P1.verify-human.2 Close a terminal (its ✕) → its shell is reaped, the sibling
          stays alive + responsive. (Agent already confirmed the pgrep reap via the bridge;
          this is the human sanity pass.)  <!-- status: COMPLETE — operator PASS -->
    - [x] P1.verify-human.3 Close the WORKSPACE with 2+ terminals open → ALL shells reaped
          (no orphan `/bin/zsh` left under the app — `ps -eo pid,ppid,comm | grep zsh`).  <!-- status: COMPLETE — operator PASS -->
    - [x] P1.verify-human.4 INSTALLED-build smoke test (Finder/Dock-launched `.app`, NOT
          `tauri:dev`): open a 2nd terminal → it spawns a real shell with the GUI PATH.  <!-- status: DEFERRED-TO-RELEASE — operator deferred installed-build verify to the /release gate per [[installed-build-verify-deferred-to-release]]; agent carries this to release. term_spawn PATH-spawn parity is already mitigated app-wide by env_path (login-shell PATH captured at setup), so the risk is low. -->
  - **DEFERRED-TO-RELEASE:** P1.verify-human.4 — installed-`.app` term_spawn PATH-spawn parity. Verify at the next `/release` before the Homebrew bump.
  - [x] verify-codify  <!-- status: COMPLETE — terminalList.test.ts (17, pure model) + terminalListWiring.test.ts (7, ?raw structural wiring guard) + terminalSlotGuard still green; full suite 760/760. One obsolete just-written test assertion triaged + auto-fixed (see ## Test Triage). -->

- [x] Phase 2: ⌘T (new) + scoped ⌘W (close-focused) chords  <!-- status: COMPLETE -->
  **Goal:** Add the keyboard affordances on top of Phase 1's buttons. ⌘T opens a new
  terminal (bare ⌘, confirmed unbound). ⌘W closes the FOCUSED terminal — but ONLY when
  focus is inside a term-pane (`deriveRightSurface === "terminal"`), and must intercept
  before the editor's existing ⌘W close-tab handler; when the editor is focused ⌘W keeps
  closing the editor tab unchanged. Both respect the Phase-1 rules (cap-8, disallow-last).
  **Observable outcomes:**
  - Browser (MCP bridge): focus inside a term-pane, dispatch ⌘T (via `webview_execute_js`
    a synthetic `keydown{metaKey:true,key:"t"}` on the term-pane, or the bridge keyboard) →
    a new terminal opens + becomes active (same effect as clicking ＋). At cap 8, ⌘T is a
    no-op (still 8 terminals).
  - Browser: focus inside a term-pane with 2 terminals, dispatch ⌘W → the focused terminal
    closes (1 remains). With 1 terminal, ⌘W is inert (still 1; disallow-last).
  - Browser: focus the EDITOR (not a terminal) with ≥1 editor tab open, dispatch ⌘W → the
    editor's active tab closes (the existing WP13 behavior), the terminal list unchanged —
    proving the scoping (no double-fire, no terminal close from an editor ⌘W).
  - CLI: `pnpm vitest run <chord test>` — the pure ⌘T predicate (bare ⌘+"t", Shift-absent,
    disjoint from ⌘⇧T) and the scoped-⌘W decision (terminal-focused → terminal close;
    else → fall through) pass their truth tables.
  - CLI: `pnpm exec tsc --noEmit` + eslint(changed) + `pnpm vite build` exit 0.
  - [x] P2.1 Pure `newTerminalChord.ts` predicate: `newTerminalChord(e)` = ⌘ present,
        Shift absent, key "t" (case-insensitive). Disjoint from ⌘⇧T (panelForChord requires
        Shift) + every other chord. Added to the chord-ownership matrix in
        `editor/paletteCommands.ts`.  <!-- status: COMPLETE -->
  - [x] P2.2 Wired ⌘T into `RightPanelHost`'s `visible`-gated capture-phase listener (it
        owns the terminal list). On ⌘T: preventDefault + inline `setPanel(→terminal)` +
        `setTerminals(openTerminal)` (the stable setters — no non-stable closure dep). No-op
        at cap (openTerminal guards). Listener deps now `[visible, workspaceId]`.  <!-- status: COMPLETE -->
  - [x] P2.3 Scoped ⌘W: new pure `closeTerminalChord.ts` (`shouldCloseTerminalOnChord`
        deciding terminal-close vs fall-through given isCloseChord + terminalFocused +
        canClose). Wired BEFORE the editor isCloseTabChord branch: when
        `deriveRightSurface(activeElement)==="terminal"` AND not-last, preventDefault +
        stopPropagation + `setTerminals(s=>closeTerminal(s, s.activeId))` (reads latest in
        the updater → stale-closure-safe; `terminalsRef` supplies the canClose read).
        Editor-focused ⌘W + last-terminal ⌘W both fall through/inert unchanged.  <!-- status: COMPLETE -->
  - [x] P2.4 Unit tests `__tests__/terminalChords.test.ts` (15, all pass): ⌘T predicate
        (fires bare ⌘T, rejects ⌘⇧T/no-⌘/other-letters, case-insensitive) + exclusivity vs
        panelForChord/isCloseTabChord/isPaletteChord + the scoped-⌘W decision truth table
        (routes only on ⌘W+terminal-focused+can-close; editor-focused + last-terminal →
        no route).  <!-- status: COMPLETE -->
  - [x] verify-auto  <!-- status: COMPLETE — tsc 0, eslint 0-err/0-warn (5 changed files), terminalChords 15/15 pass -->
  - [x] verify-self  <!-- status: COMPLETE — all 5 Observable Outcomes PASS via MCP bridge (scratch-a). Synthetic ⌘T/⌘W keydown reached the capture-phase document listener reliably (chords intercepted at DOM level, before xterm — NO dispatch-fidelity boundary hit). ⌘T(term focused)→opens (1→2); ⌘W(term focused)→closes focused (2→1); ⌘W(editor focused)→closes EDITOR tab (1→0), terminal untouched (scoping proven, no double-fire); ⌘W on last terminal→inert (stays 1); ⌘T at cap 8→no-op (stays 8). -->
  - [x] verify-human  <!-- status: COMPLETE — operator: "all pass" (all 3 physical-keyboard checks PASS) -->
    - [x] P2.verify-human.1 PHYSICAL keyboard ⌘T → opens a new terminal.  <!-- status: COMPLETE — operator PASS -->
    - [x] P2.verify-human.2 PHYSICAL ⌘W (terminal focused) → closes the focused terminal, window stays open.  <!-- status: COMPLETE — operator PASS -->
    - [x] P2.verify-human.3 PHYSICAL ⌘W (editor focused) → closes the EDITOR tab, terminals untouched.  <!-- status: COMPLETE — operator PASS -->
  - [x] verify-codify  <!-- status: COMPLETE — terminalChords.test.ts (15, pure predicates) + extended terminalListWiring.test.ts (+4 Phase-2 guards: ⌘T branch, scoped-⌘W routing, the load-bearing scoped-⌘W-BEFORE-editor-⌘W ordering assertion, stopPropagation swallow). Full suite 779/779. No triage. -->

- [x] Phase 3: WP10 zoom coupling — zoom follows the focused terminal  <!-- status: COMPLETE -->
  **Goal:** The WP10 focus-scoped ⌘+/⌘−/⌘0 zoom currently drives a single `termPaneRef`
  (`Workspace.tsx`). With N terminals, route the zoom to WHICHEVER terminal is focused.
  Replace the single ref with a per-terminal handle registry; the router resolves the
  focused terminal's handle at chord time (Plan-time decision 5).
  **Observable outcomes:**
  - Browser (MCP bridge): open 2 terminals; focus terminal A, ⌘+ → terminal A's xterm
    font grows (its `.xterm` computed font-size increases) while terminal B's is
    unchanged; focus terminal B, ⌘+ → B grows. ⌘0 resets the focused one. (Read font-size
    via `webview_get_styles` / `webview_execute_js` on each pane's `.xterm`.)
  - Browser: focus the editor → ⌘+ zooms the EDITOR (terminals unchanged) — WP4/WP10
    routing for non-terminal right-surface still holds.
  - CLI: `pnpm exec tsc --noEmit` + eslint(changed) + `pnpm vite build` exit 0; full
    vitest suite passes (no regression in the existing WP10/zoom tests).
  - [x] P3.1 + P3.2 — SIMPLER THAN PLANNED (no registry needed). The Phase-1 wiring
        already binds the forwarded `terminalPaneRef` to the ACTIVE terminal's pane
        (`ref={t.id === terminals.activeId ? terminalPaneRef : undefined}`). Because the
        focused terminal is ALWAYS the active one (the rest are display:none/unfocusable),
        the WP10 router (`Workspace.applyTerminalZoom → termPaneRef.current`) already zooms
        the focused terminal. Switching the active tab re-binds the object ref to the new
        active pane during commit, so a later zoom chord lands on it. The plan's
        per-terminal handle registry (`Map<sessionId, handle>` + ancestry read) would be
        redundant complexity — the active-ref resolves "which of N is focused" for free.
        Deviation documented (see ## Discoveries). Strengthened the binding comment +
        added a structural guard test pinning the active-ref invariant.  <!-- status: COMPLETE -->
  - [x] P3.3 Confirmed a NEWLY-opened terminal seeds from the shared key: XtermPane's
        `Terminal` constructor reads `fontSize: loadTerminalFontSize()` (XtermPane.tsx
        ~229), so a new terminal matches the current zoom — no per-terminal drift, no new
        code.  <!-- status: COMPLETE -->
  - [x] verify-auto  <!-- status: COMPLETE — tsc 0, eslint 0-err/0-warn (2 changed files), terminalListWiring 12/12 (incl. the Phase-3 active-ref guard) -->
  - [x] verify-self  <!-- status: COMPLETE — all 4 Observable Outcomes PASS via MCP bridge (scratch-a). Focus term-1 + ⌘+ → term-1 font 11→14 (the focused one grows); switch to term-0 + ⌘+ → term-0 14→17 while term-1 stays 14 (zoom FOLLOWS the focused terminal among N — the active-ref rebinds on switch); new 3rd terminal spawned at 17px (matches the shared key — no drift); editor-focused ⌘+ → editor 10→11, terminal key stays 17 (editor zoom + terminal zoom stay separate, the WP4/WP10 split-routing holds). Read the actual cell font via .xterm-rows span computed + the persisted claudesk.terminal.fontSize key. -->
  - [x] verify-human  <!-- status: COMPLETE — operator: "all pass" (all 3 physical-keyboard checks PASS) -->
    - [x] P3.verify-human.1 PHYSICAL ⌘+/⌘−/⌘0 zooms whichever terminal is focused.  <!-- status: COMPLETE — operator PASS -->
    - [x] P3.verify-human.2 PHYSICAL: a new terminal appears at the current shared zoom.  <!-- status: COMPLETE — operator PASS -->
    - [x] P3.verify-human.3 PHYSICAL: editor ⌘+ zooms the editor, terminals unaffected.  <!-- status: COMPLETE — operator PASS -->
  - [x] verify-codify  <!-- status: COMPLETE — active-ref invariant (zoom-follows-focused mechanism) already pinned by terminalListWiring.test.ts's "forwards terminalPaneRef ONLY to the active terminal's pane" guard; shared-key seed is XtermPane's existing constructor behavior. Live zoom-px behavior bridge-verified (not forced into a brittle unit test — repo posture: live DOM → bridge, wiring → ?raw guard). Full suite 780/780, no triage. -->

## Current Node
- **Path:** Feature > finalize
- **Active scope:** review-quality COMPLETE (0C/0M/3 MINOR, all auto-backlogged). SHIPPED (f9e3292). Ready for /feature-finalize.
- **Blocked:** none
- **Unvisited:** finalize
- **Open discoveries:** the 2 Phase-3 notes (build deviation + shared-zoom confirmation) — informational, not blocking

**Relevance check (before Phase 3):**
- Requester still needs this: yes — the WP10↔WP11 zoom coupling is an explicit spec AC + WBS task ("If WP10 shipped: confirm focus-scoped zoom routes to whichever terminal is focused").
- Requirements unchanged: yes — focus-scoped ⌘+/⌘−/⌘0 must zoom the FOCUSED terminal among N, not just the first.
- Solution still feasible: yes — Phase 1 already added `data-session-id` on each term-pane; the router just needs to resolve the focused term's handle instead of the single `termPaneRef`.
- No superior alternative discovered: yes — the registry/ancestry-read approach (plan decision 5) remains the clean fit.
**Verdict:** proceed

## Code-Quality Review — Multiple terminals in the right panel (M6 WP11)

Reviewer (code-quality-reviewer subagent) on ship commit `f9e3292`. Verdict: **0 CRITICAL,
0 MAJOR, 3 MINOR** — "well-built... nothing here warrants a refactor pass." All 3 MINORs
auto-backlogged (Mode 3) → `workflow/backlog-quality-findings.md`.

### Strengths
- Clean pure-core/wiring split (`terminalList.ts` side-effect-free reducer, 17-case table).
- Keep-mounted + per-pane-unmount-reaps-PTY reuses XtermPane's existing cleanup — N
  terminals get correct shell-reaping with zero new backend code.
- Monotonic never-reused `counter` (a stale `cc-output-<sid>` stream can't re-bind a fresh
  terminal) — documented at the field.
- Phase-3 build deviation (skipping the planned registry once the active-ref was found to
  resolve "which of N is focused") is the right call + documented as a deviation.
- Chord disambiguation rigorously reasoned + pinned by structural guards incl. the
  scoped-⌘W-before-editor-⌘W source-position assertion.

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [RightPanelHost.tsx ⌘T/⌘W branches vs addTerminal/closeTerminalById] The keydown branches
  re-inline the open/close bodies (to keep the `[visible, workspaceId]` listener free of
  non-stable deps) rather than calling the helpers — a logic duplication across ~250 lines
  that could diverge. A `useCallback`/ref-to-callback would let both call sites share one
  impl without re-registering the listener. (Intent sound + commented.)
- [RightPanelHost.tsx term-tab-row] The sub-tab row has `role=tablist/tab` + `aria-selected`
  but no `aria-controls`→pane / `role=tabpanel` linkage. Consistent with the existing
  Editor/Diff/Terminal row (not a regression); a11y polish.
- [terminalList.ts TerminalEntry] `id` and `sessionId` are distinct fields but always set
  equal in v1 (speculative-generality seam for a future rename/label). Cheap + documented;
  borderline.

### Assessment
Well-built; pure-reducer-plus-wiring-guard is the repo idiom; correctness-sensitive details
(monotonic ids, reactivate-left, disallow-last, keep-mounted reap) each reasoned + tested;
Phase-3 simplification shows good judgment. Advances rather than encumbers the codebase. Only
debt is minor (the handler/branch duplication). No refactor pass warranted.

### If you disagree
Dismiss any finding by editing this section + marking the line `[DISMISSED]` before finalize.

## Retrospect
- **What changed in our understanding:** Phase 3 (zoom coupling) turned out to need NO new code — Phase 1's active-ref wiring (binding the single `terminalPaneRef` to whichever terminal is active) already makes zoom follow the focused terminal, because the focused terminal is always the active one (the rest are `display:none`/unfocusable). The plan's per-terminal handle registry was redundant.
- **Assumptions that held:** the backend was genuinely N-session-ready (term_spawn + session-id-keyed commands + per-pane unmount `cc_kill`) — confirmed by `pgrep` showing each closed terminal's shell reaped with zero new backend code. The MCP-bridge synthetic-keydown reached the capture-phase chord listeners reliably (these chords are DOM-level, before xterm), so the agent drove the chord + zoom verify-self live rather than carrying it to the operator.
- **Assumptions that were wrong:** my first verify-self read of the live xterm font size hit a timing artifact (read the computed `.xterm-rows` font *before* xterm committed `setFontSize`+refit) — the persisted localStorage key was the reliable source of truth. Also the initial `pgrep` "no shells" scare was a bad grep filter, not a real spawn failure.
- **Approach delta:** spec→plan→3 phases as planned, with two simplifications taken on evidence: (a) Phase 3's registry dropped for the active-ref; (b) the ⌘T/⌘W keydown branches inline the stable setters rather than calling the helper closures (to keep the `[visible, workspaceId]` listener dep-clean) — flagged as a MINOR duplication. One operator clarification mid-Phase-3 confirmed SHARED (not per-terminal) zoom was intended. No back-loops.

## Test Triage — terminalListWiring.test.ts (the `not.toContain` hardcoded-id assertion)
Classification: Obsolete test — the assertion I just wrote is too broad (matches prose, not code)
Confidence: high
Evidence: `TerminalPane.tsx`'s header COMMENT still mentions `${workspaceId}-term` (explaining the old id it replaced), so a bare substring `not.toContain("`${workspaceId}-term`")` fires on the comment even though the CODE no longer derives that id.
Action: Auto-fixed the test — dropped the over-broad negative substring assertion; the positive `workspaceId={sessionId}` assertion already proves the code passes the explicit sessionId (the real invariant). No code change.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
[BUILD-DEVIATION-2026-06-28] Phase 3 — implemented SIMPLER than the plan. The plan's
decision-5 per-terminal handle registry (Map<sessionId, handle> + activeElement ancestry
read) was found redundant: Phase-1 already binds the single forwarded `terminalPaneRef` to
the ACTIVE terminal, and since the focused terminal is always the active one, the WP10
router already zooms the focused terminal. No registry built. Not a plan-was-wrong
back-loop — the plan over-specified a mechanism; the simpler correct path was taken +
documented + structurally guarded. (Aligns with the cap-bug-surface lean.)

[CONFIRMED-2026-06-28] Phase 3 — operator confirmed SHARED zoom (one
`claudesk.terminal.fontSize` for all terminals + CC, applied to the focused one
immediately, others converge on refit) is the intended behavior — NOT per-terminal
independent zoom. Matches WP10's existing CC↔right shared-key decision. No design change;
the current build stands.
