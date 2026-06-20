# Feature: WP5 — RightPanelHost + panel-switch hotkeys

**Workflow:** feature
**State:** verify-codify (all phases complete) — ready to ship
**Created:** 2026-06-20
**Entry:** spec (complex feature)
**Milestone:** 2
**WP:** WP5
**Drive mode:** autopilot (standing directive: halt at WP boundaries)

## Problem Statement

The right half of each workspace is currently wired ad-hoc in `Workspace.tsx`: a hardcoded `useState<"editor" | "diff">` plus a clickable segmented toggle shipped as a WP4 **stopgap** (`Workspace.tsx:35-40, 56-132`). There is no keyboard navigation between panels, no dedicated owner component, and the structure won't accept the second-terminal panel (WP9) or the file-tree chrome (WP10) without reshaping.

WP5 extracts the right-half management into a real **`RightPanelHost`** component that owns the right half, manages per-workspace panel state, and switches panels via **dedicated per-panel keyboard chords** using the WP1-validated capture-phase registration pattern. This is the structural seam WP6 (finder overlay), WP9 (second terminal), and WP10 (file-tree) plug into — built once, here.

It is also where the WP1 "hotkey-while-CM6-focused" finding is applied in production for the first time (the panel chords must fire even while the cursor is inside a CodeMirror editor).

## User Stories

- As the operator, I want to **press a dedicated chord to jump directly to a specific panel** (Editor / Diff / Terminal) — not cycle through them — so switching is one deterministic keystroke regardless of which panel is currently showing.
- As the operator, I want the panel chords to **fire even while I'm typing inside the editor**, so I never have to click out of CodeMirror first.
- As the operator, I want **each workspace to remember its own active panel + open file + scroll** when I switch center stage and come back, mirroring the "all workspaces stay mounted" rule.
- As the operator, I want the **Sublime Text pop moved off ⌘⇧E** (now the Editor chord) onto a non-colliding transitional chord, since the in-app editor is taking over that binding.
- As the operator, I want an **"Open in Sublime Merge" button** in the right-panel toolbar (alongside "Open in Sublime"), because **Sublime Merge is a permanent companion surface** — the in-app DiffPanel views the working diff inline, but richer git work (staging, blame, history, inspecting a file's content at a past commit) stays in Sublime Merge.

## Acceptance Criteria

The feature is done when:

1. **`RightPanelHost` component exists** and owns the right half of each workspace. `Workspace.tsx` no longer holds the inline `rightPanel` state or the segmented-toggle JSX — it renders `<RightPanelHost>` and passes the workspace + `visible` down. The M1 placeholder card survives only as the empty/no-file state inside the host.

2. **Per-panel direct-select chords (NOT cycling), all on ⌘⇧+mnemonic:**
   - **⌘⇧E → Editor panel**
   - **⌘⇧D → Diff panel**
   - **⌘⇧T → Terminal panel** — *registered/scoped now but the terminal panel itself is WP9*; in WP5 it is either inert (no terminal yet) or a no-op until WP9 wires the panel. Decide at plan: register the chord now (and have it select an as-yet-absent panel gracefully) vs. add the chord with WP9. **Spec intent:** the chord scheme and ownership map account for ⌘⇧T now; the live binding may land with WP9.
   - Each chord selects its panel **directly** — pressing ⌘⇧D from the Editor goes straight to Diff; pressing it again is a no-op (idempotent), it does NOT toggle back.

3. **Chords fire while focus is inside CodeMirror 6** — verified by the WP1 pattern: a **capture-phase `document` keydown listener** (`addEventListener("keydown", handler, true)`), scoped to the **focused (visible) workspace only** so a backgrounded workspace's host never reacts. Typing `E`/`D`/`T` (without ⌘⇧) into the editor still inserts the character — the chords intercept only the modified combo.

4. **Sublime Text pop reassigned to ⌘⇧O** (transitional). `isSublimeChord` + `SUBLIME_CHORD_LABEL` updated from `E` → `O`; the toolbar button hint reflects `⌘⇧O`. The whole binding is still slated for deletion in WP8 — this is a transitional move, noted as such in code comments.

4b. **"Open in Sublime Merge" button** added to the right-panel toolbar, beside "Open in Sublime". **Click-only — no chord** (operator decision 2026-06-20). Backed by a new `smerge_open(project_path)` Tauri command mirroring `sublime_open` exactly: the WP3 probe already mapped `smerge` discovery (PATH → `/Applications/Sublime Merge.app/.../bin/smerge` → `open -a "Sublime Merge"`) and the existing resolver in `src-tauri/src/sublime/mod.rs` was built tool-parameterized so `find_smerge` is a one-liner. Background-launch (`-b`/`--background`) per the WP3 matrix; an IPC rejection surfaces, never dead-clicks (WP6 lesson). **Sublime Merge is NOT removed by WP8** — only Sublime *Text* is (see Standing-decision change below).

5. **Per-workspace panel state preserved across center-stage switches.** Both (all) panels stay **mounted** (`display:none` toggle, never unmount); the active-panel selection, the editor's open file + scroll, and the diff's selected file all survive a switch away and back. Mirrors the workspace-stays-mounted invariant (CLAUDE.md).

6. **Chord-ownership map updated** in `paletteCommands.ts` (and any mirror) to reflect the new reality: ⌘⇧E = Editor (was Sublime), ⌘⇧D = Diff, ⌘⇧T = Terminal, ⌘⇧O = Sublime (transitional), ⌘⇧P = palette (unchanged), ⌘P = finder (WP6, unchanged). The exclusivity matrix test is extended to cover the new chords (no two predicates fire on the same event).

7. **Gates green:** frontend tsc / eslint(0 warnings) / prettier / vitest all pass (with new tests for the panel-select reducer + the chord predicates + the exclusivity matrix); backend untouched by WP5 unless the blob-at-rev item below is folded in.

8. **Verify-human** in real `pnpm tauri dev` on this repo: open the editor, type into it, press ⌘⇧D / ⌘⇧E to jump panels while focused, confirm direct-select (not cycle), confirm the open file survives a center-stage switch, confirm ⌘⇧O pops Sublime and ⌘⇧E no longer does.

## Out of Scope

- **The second-terminal panel itself** — that's WP9. WP5 accounts for ⌘⇧T in the chord scheme and registers the binding now, gracefully no-op'ing while the Terminal panel is absent (resolved: see Decisions). WP5 does not spawn a shell.
- **The Cmd+P fuzzy finder overlay** — WP6. WP5 leaves ⌘P unclaimed for it.
- **The file-tree navigator** — WP10. WP5 builds the host chrome it will later live in, but adds no tree.
- **Deleting the Sublime *Text* pop** — WP8 (gated on parity). WP5 only *relocates* its chord (→ ⌘⇧O). **Sublime *Merge* is NOT deleted by WP8** — it's a permanent surface (see Decisions).
- **Blob-at-rev "open file at a past commit"** — NOT a feature, by design. "Open" always opens the live working-tree file regardless of which view (working-dir or commit) it was clicked from; inspecting a file's content at a past commit is what Sublime Merge is for. `SURFACE-2026-06-20-WP4-OPEN-IN-EDITOR-BLOB-AT-REV` is dismissed as working-as-intended (see Decisions).
- **Removing the WP2 open-file path-input stopgap** — kept inside the host until WP6's finder lands (it's the only way to open a file today). Carried as-is.
- **Changing the editor / diff panels' internals** — WP5 is a host + hotkey + state-ownership + toolbar-button change, not an editor/diff feature change.
- **A ⌘⇧M chord for Sublime Merge** — out: the Sublime Merge button is click-only (operator decision).

## Technical Constraints

- **WP1 capture-phase pattern is mandatory** (`workflow/archive/m2-wp1-cm6-probe.md` → Objective (a), PASS): app-level chords = a capture-phase `document` keydown listener scoped to the focused workspace; it fires before CM6's contentEditable handler regardless of editor focus. No per-editor CM6 keymap wiring needed for the panel chords (none of ⌘⇧E/D/T/O collide with a browser/OS default that needs Prec.highest suppression — unlike ⌘P's print dialog, which is WP6's concern).
- **Single capture-phase listener per focused workspace**, not one-per-panel — matches the established `SublimeToolbar` pattern (`window.addEventListener` gated on `active`) but in capture phase and routing to the right panel by chord. Avoid N stacked listeners.
- **All panels stay mounted** (`display:none`) — CLAUDE.md invariant; WP1 Objective (b) confirmed `display:none` editors cost ~0 render, so keeping Editor + Diff (+ later Terminal) all mounted is within budget.
- **One small backend addition:** the `smerge_open` Tauri command (mirrors `sublime_open` exactly; `find_smerge` is a one-liner on the existing tool-parameterized resolver per `src-tauri/src/sublime/mod.rs:26`). The panel-host + hotkey core is otherwise frontend-only.
- **Chord family decided (operator, 2026-06-20):** per-panel ⌘⇧+mnemonic, direct-select, NOT cycling. Sublime → ⌘⇧O. This supersedes the `paletteCommands.ts` note that said the panel-switch hotkey "must not be ⌘⇧E" (that constraint assumed Sublime kept ⌘⇧E; Sublime is moving).
- **Doc-drift to fix:** `arch.md` (lines ~295, 320, 328) and the WBS describe the panel-switch hotkey as **cycling** the panels. The operator decision is **direct-select per panel**. Fix this prose during build (arch.md line 295 "cycles them", line 320 mermaid ".cycles.", and the WBS WP5 task wording) so the as-built matches the docs. → also log as a SURFACE for the next `/product-finalize` resync if not fully fixed in-place.

## Decisions (operator, 2026-06-20 — all spec open questions resolved)

1. **⌘⇧T registered now, no-ops gracefully until WP9.** The chord + ownership-map entry land in WP5; selecting the Terminal panel when no terminal exists is a safe no-op (or selects an empty placeholder). The live terminal panel arrives in WP9.
2. **Blob-at-rev is NOT a feature — dismissed.** "Open" always opens the live working-tree file, by design (operator: *"It's not a bug, it's a feature"*). Inspecting file content at a past commit → use Sublime Merge. `SURFACE-2026-06-20-WP4-OPEN-IN-EDITOR-BLOB-AT-REV` → close as **wontfix / working-as-intended**. (Also: fix the now-stale `DiffPanel.tsx:47-55` doc comment that says the blob-at-rev behavior is "deferred to WP5" — it's not deferred, it's intentional.)
3. **Clickable tabs AND chords coexist.** Keep the clickable panel tabs (discoverability + mouse path) and add the ⌘⇧+mnemonic chords. Both drive the same direct-select state.
4. **Sublime Merge is a permanent companion surface** — `smerge_open` button (click-only) folded into WP5; NOT removed by WP8.

## Standing-decision change (must propagate at finalize)

**Sublime Merge is kept permanently; only Sublime *Text* is replaced/removed.** This **supersedes** the prior blanket "in-app editor + diff viewer replace Sublime, WP8 removes the Sublime pop" framing in: `CLAUDE.md` (Key Decisions / vision summary), `docs/product/vision.md` Core Principle 3, `docs/product/arch.md` M2 section, and WBS WP8. The corrected split:
- **Sublime *Text*** → replaced by the in-app CM6 editor; the `⌘⇧E`/`⌘⇧O` Sublime-Text pop + `sublime_open` are removed by WP8 (unchanged).
- **Sublime *Merge*** → **permanent**; the in-app DiffPanel is for inline working-diff *viewing*, while staging/blame/history/blob-at-rev inspection stay in Sublime Merge. The `smerge_open` button persists past WP8.

→ WP5 fixes what it can in-place (the WP8 task wording, the DiffPanel comment); the broader vision/arch/CLAUDE.md resync is logged as a SURFACE for the next `/product-finalize` (and noted in `## Discoveries` below).

---

## Notes

- **No 3rd-party probe needed** — WP5 depends on no external API. CM6 / capture-phase behavior already settled by WP1.
- **Verify pattern (carried):** verify-self CANNOT reach the workspace UI (Tauri dialog stub-wedge, `SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE`, reproduced 3×). Go straight to operator verify-human in real `pnpm tauri dev` opened on THIS repo. Kill `:1420` before relaunch; warm rebuild ~15s. (A dev-only `?ws=<path>` / `window.__seedWorkspace()` seam would fix the wedge — worth doing before/with WP5; consider at plan.)
- **Dependencies satisfied:** WP1 ✅ (hotkey/focus pattern), WP2 ✅ (EditorPanel), WP4 ✅ (DiffPanel).
- **WP3 probe (`workflow/archive/wp3-sublime-cli-probe.md`) already mapped `smerge`** — discovery (PATH absent on canonical machine → `/Applications/Sublime Merge.app/.../bin/smerge` → `open -a`) and the invocation matrix (T7–T11; background via `-b`/`--background`). The `smerge_open` command inherits this directly.

## Work Tree

- [x] Phase 1: Backend — `smerge_open` launch command  <!-- status: complete -->
  **Observable outcomes:**
  - CLI: `cargo test` in `src-tauri/` passes, including new `smerge` resolver/command tests (PATH → `/Applications/Sublime Merge.app/Contents/SharedSupport/bin/smerge` bundle → `open -a "Sublime Merge"`; `smerge <dir>` invocation, no stray flags). ✅ 71/71 (+4)
  - CLI: `cargo clippy -- -D warnings` and `cargo fmt --check` clean. ✅
  - CLI: `grep -q smerge_open src-tauri/src/lib.rs` — the command is registered in the invoke handler. ✅
  - [x] P1.1 Generalize the `sublime` module's resolver to be tool-parameterized for BOTH Text and Merge: add `find_smerge()` (PATH `which smerge` → `SM_BUNDLE_BIN` → `open -a "Sublime Merge"`), reusing `resolve()` + `SublTool`. Added `SM_APP_NAME`/`SM_BUNDLE_BIN` consts + a shared private `tool_command(tool, app_name, dir)` (subl_command/merge_command now thin wrappers) building `<cli> <dir>` (WP3 T7). `sublime_open`/`subl` paths intact.  <!-- status: complete -->
  - [x] P1.2 Added `launch_merge(dir)` (+ shared private `spawn()` tail) + the `smerge_open(project_path)` Tauri command (mirrors `sublime_open`, maps `SublimeError`→`String`); registered in `lib.rs` `generate_handler!`.  <!-- status: complete -->
  - [x] P1.3 Unit tests: `merge_command` 3 branches (path/bundle/open-a→"Sublime Merge") + no `--project`/`--new-window` anti-pattern, mirroring `subl_command`. Resolver precedence reuses the shared `resolve` (already covered).  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete — sublime tests 11/11, full lib 71/71, clippy/fmt clean -->
  - [x] verify-self  <!-- status: complete — backend-only phase, no UI surface; CLI-smoke confirmed all 3 Observable Outcomes against compiled binary. No integration boundary (smerge_open unconsumed until P2; subl_command behavior pinned unchanged). -->
  - [ ] verify-human  <!-- status: NOT-STARTED — backend-only phase; the smerge launch is exercised live at P3 verify-human via the button -->
  - [ ] verify-codify  <!-- status: NOT-STARTED — codified by the 4 cargo unit tests already written in P1.3 -->

- [x] Phase 2: Frontend — RightPanelHost extraction + toolbar (Text→⌘⇧O, +Merge button)  <!-- status: complete -->
  **Observable outcomes:**
  - CLI: `pnpm tsc --noEmit`, `pnpm lint` (0 warnings), `pnpm format:check`, `pnpm test` (vitest) all pass. ✅ tsc clean, lint 0, prettier clean, vitest **168/168** (+17)
  - Browser (verify-human, real app): a `RightPanelHost` renders Editor + Diff slots both mounted (`display:none` toggle), the clickable tabs switch the visible slot, and the toolbar shows two buttons — "Open in Sublime" (hint `⌘⇧O`) and "Open in Sublime Merge" (no chord hint). → verified at P3 verify-human (workspace UI; dialog stub-wedge blocks verify-self).
  - Console: no React warnings/errors on mount. → P3 verify-human.
  - [x] P2.1 Created `RightPanelHost.tsx`: moved the panel state, open-file plumbing (`pathInput`/`openPath`/open-bar), both panel slots (Editor + Diff, `display:none` mounted), and `onOpenInEditor` out of `Workspace.tsx`; `Workspace` now renders `<RightPanelHost projectPath visible />`. `active` gating preserved (`visible && panel===X`).  <!-- status: complete -->
  - [x] P2.2 Panel-select pure core `panelHost.ts`: `RightPanel` union (incl. `"terminal"`), `selectPanel` (direct-select, idempotent, terminal graceful no-op until WP9), `panelForChord` (⌘⇧E/D/T → panel). 11 vitest cases (incl. explicit no-toggle guard).  <!-- status: complete -->
  - [x] P2.3 Reassigned Sublime Text chord ⌘⇧E → ⌘⇧O: `isSublimeChord` (`"e"`→`"o"`), `SUBLIME_CHORD_LABEL` (`⌘⇧E`→`⌘⇧O`), button hint, chord.ts comments (transitional, deleted at WP8). chord tests updated (incl. "old ⌘⇧E no longer matches").  <!-- status: complete -->
  - [x] P2.4 Added the permanent "Open in Sublime Merge" button to the toolbar (SublimeToolbar, alongside "Open in Sublime"), click-only, `invoke("smerge_open", { projectPath })`, rejection surfaced not dead-clicked. `.sublime-toolbar` gap added in App.css; reuses `.sublime-open-button`.  <!-- status: complete -->
  - [x] P2.5 Updated the chord-ownership map in `paletteCommands.ts`; extended the exclusivity matrix test + added a cross-predicate `app-level ⌘⇧ chord exclusivity` describe (each of ⌘⇧P/O/E/D/T claimed by exactly one of isPaletteChord/isSublimeChord/panelForChord).  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete — scoped vitest 34/34, full 168/168, eslint clean on 6 files, tsc/prettier clean -->
  - [x] verify-self  <!-- status: complete — pure-logic outcomes PASS (vitest 34/34 + 168/168, tsc/eslint/prettier clean). Workspace-UI outcomes UNVERIFIABLE-BY-SELF (dialog stub-wedge, no reachable dev URL) → deferred to consolidated P3 operator verify-human. Integration boundary (Workspace right pane) present + cited in outcomes; source-wiring smoke confirms all 4 interactive elements + capture-phase listener compile. No blocking/cosmetic fails in verifiable surface. -->
  - [ ] verify-human  <!-- status: NOT-STARTED — deferred into the consolidated P3 operator verify-human (covers P2 UI + P3 chords together) -->
  - [ ] verify-codify  <!-- status: NOT-STARTED — codified by panelHost/chord/paletteCommands vitest (34 cases) already written in P2 -->

- [x] Phase 3: Direct-select capture-phase hotkeys + in-place doc fixes  <!-- status: complete -->
  **NOTE (build deviation):** P3.1 (the capture-phase listener) was built INTO `RightPanelHost` during Phase 2 — it is structurally inseparable from the host (the host IS the listener owner). Phase 3 therefore reduces to P3.2 (the in-place doc fixes) + the consolidated operator verify-human that covers BOTH the Phase-2 UI (tabs, buttons, mount) AND the P3.1 chords (fire-while-CM6-focused). Logged as a SHORTCUT discovery below.
  **Observable outcomes:**
  - Browser (operator verify-human in real `pnpm tauri dev` on THIS repo): with the cursor focused INSIDE the CM6 editor, pressing ⌘⇧D jumps to the Diff panel, ⌘⇧E jumps to the Editor panel — direct-select, not toggle; pressing the same chord twice is a no-op. Typing `e`/`d` (no ⌘⇧) into the editor inserts the character normally. ⌘⇧O pops Sublime Text; ⌘⇧E no longer does. The "Open in Sublime Merge" button opens Sublime Merge at the project dir.
  - Browser: switching center stage away and back preserves the workspace's active panel + the editor's open file (panels stay mounted).
  - CLI: the WBS WP5 task wording reads "direct-select" and the stale "deferred to WP5" comment is gone from `DiffPanel.tsx`.
  - [x] P3.1 Capture-phase `document` keydown listener in `RightPanelHost` (gated on `visible`, routes ⌘⇧E/D/T via `panelForChord`+`selectPanel`, `preventDefault` on match, capture phase per WP1). **Built in Phase 2** (folded into the host).  <!-- status: complete -->
  - [x] P3.2 In-place doc fixes: WBS WP5 task wording cycling→direct-select (+ marked ✅ SHIPPED); corrected the stale `DiffPanel.tsx` `onOpenInEditor` comment (now states open=live-working-tree is BY DESIGN, blob-at-rev is Sublime Merge's job, SURFACE dismissed WAI); rewrote WBS WP8 to remove only the Text half (smerge_open/Merge button + shared resolver survive).  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete — tsc/prettier/eslint clean on P3.2 changes; P3.1 gate-verified in P2 (vitest 168/168) -->
  - [x] verify-self  <!-- status: complete — P3.2 doc-content greps PASS; P3.1 logic PASS (28/28 + 168/168). No integration boundary (doc edits only). Live UI behavior → consolidated operator verify-human (dialog stub-wedge, no reachable dev URL). No blocking/cosmetic fails. -->
  - [x] verify-human  <!-- status: complete — operator APPROVED 2026-06-20 in real pnpm tauri dev. All items pass: ⌘⇧E/⌘⇧D direct-select while CM6-focused, no-toggle, plain typing unaffected, clickable tabs, ⌘⇧O pops Text (⌘⇧E no longer does), panel-state survives switch. Item 7 (Merge button) initially FAILED — opened Text not Merge — root-caused + fixed mid-verify (see BUGFIX discovery), operator re-confirmed Merge opens. -->
  - [x] verify-codify  <!-- status: complete — all verified behaviors have permanent tests (backend 73/73 incl. 2 item-7 regression guards; frontend 168/168 incl. panelHost/chord/exclusivity). No new tests needed (coverage written per-phase + bugfix guards). No failures, no triage. Live-UI behavior CI-uncoverable (dialog stub-wedge) but operator-confirmed. -->

  **Relevance check (before Phase 3 verify-human):**
  - Requester still needs this: yes — operator picked WP5 this session
  - Requirements unchanged: yes — decisions locked at spec; Sublime-Merge addition + blob-at-rev dismissal folded in cleanly
  - Solution still feasible: yes — built + gate-green across all 3 phases
  - No superior alternative discovered: yes
  **Verdict:** proceed

## Current Node
- **Path:** Feature > COMPLETE — ready to ship
- **Active scope:** none — all 3 phases [x], all verify groups [x]. Next: `/feature-ship`.
- **Blocked:** none
- **Note:** verify-human APPROVED 2026-06-20 (operator). Item-7 Merge-button bug found + fixed in-place during verify-human (backend resolve() hardcoded-bundle-path; parameterized + 2 regression guards; cargo 73/73). This was the genuine load-bearing value of operator verify-human — verify-self could not reach the workspace UI to catch it. Backend 73/73, frontend 168/168, tsc/eslint/clippy/fmt clean.
- **Note on P1 verify-human/codify:** Phase 1 is backend-only with NO UI surface — `smerge_open` has no caller until Phase 2's button. Its human-facing verification is deferred to **Phase 3 verify-human** (operator launches Sublime Merge via the button in the real app); verify-codify is already satisfied by the 4 cargo tests in P1.3. These two P1 leaves are intentionally carried as deferred-into-P3 rather than run as empty no-op checks now. (Drive mode autopilot — proceeding to Phase 2 build per the plan's routing of P1's live check into P3.)
- **Unvisited (sequence-of-execution):** Phase 2 (P2.1 → P2.2 → P2.3 → P2.4 → P2.5 → verify-auto → verify-self[pure-logic only] → verify-human) → Phase 3 (P3.1 → P3.2 → verify-auto → verify-self → verify-human[operator, real app — covers P1 smerge button + P3 chords together] → verify-codify) (P2.1 RightPanelHost extraction → P2.2 panel reducer → P2.3 Text→⌘⇧O → P2.4 Merge button → P2.5 ownership map) → P2 verify-group → Phase 3 (P3.1 capture-phase hotkeys → P3.2 in-place doc fixes) → P3 verify-group (verify-self expected N/A → straight to verify-human per the dialog stub-wedge)
- **Open discoveries:** none

## Verification-pattern note (carried from spec)
- **verify-self CANNOT reach the workspace UI** (Tauri dialog stub-wedge, `SURFACE-2026-06-20-WP4-VERIFY-SELF-DIALOG-STUB-WEDGE`, reproduced 3×). Phase 1 (backend) verifies fully via `cargo test` (verify-auto/self both mechanical). Phases 2–3 (frontend/UI): verify-auto = vitest/tsc/lint; verify-self for pure-logic reducers/predicates only; the workspace-UI Observable Outcomes go **straight to operator verify-human** in real `pnpm tauri dev` on THIS repo. Kill `:1420` before relaunch; warm rebuild ~15s.

## Discoveries

<!-- Format: [SURFACED-<date>] <target node> — <summary> ; also logged to workflow/backlog.md -->

- [SURFACED-2026-06-20] feature-spec — `arch.md` exceeds size guard (349 lines); read first 100 + headings per GLOBAL rule.
- [SURFACED-2026-06-20] next `/product-finalize` — **Sublime Merge kept permanently (decision reversal).** The prior "in-app editor + diff viewer fully replace Sublime; WP8 removes the Sublime pop" framing is superseded: only Sublime *Text* is replaced/removed (WP8); Sublime *Merge* is a permanent companion surface with its own `smerge_open` button. Resync `CLAUDE.md` Key Decisions, `docs/product/vision.md` Core Principle 3, `docs/product/arch.md` M2 section. WP5 fixes the WP8 task wording + the DiffPanel blob-at-rev comment in-place.
- [SURFACED-2026-06-20] next `/product-finalize` — **Panel-switch hotkey is direct-select, not cycling.** `arch.md` (~L295 "cycles them", ~L320 mermaid ".cycles.") + WBS WP5 task wording describe cycling; as-built is per-panel ⌘⇧+mnemonic direct-select. WP5 fixes the WBS WP5 wording in-place; arch.md prose resync at finalize.
- [SURFACED-2026-06-20] CLOSED at spec — `SURFACE-2026-06-20-WP4-OPEN-IN-EDITOR-BLOB-AT-REV` dismissed as working-as-intended (open = live working-tree file, by design). No code change; the stale "deferred to WP5" DiffPanel comment gets corrected in WP5.
- [SHORTCUT-2026-06-20] P3.1 — the capture-phase panel-select listener was built into `RightPanelHost` during Phase 2 rather than as a separate Phase 3 leaf, because it is structurally part of the host component (the host owns the listener; shipping the host without it would mean a half-wired component with dead tabs-only navigation). Pure chord logic (`panelForChord`) is vitest-covered (11 cases) + the cross-predicate exclusivity matrix; the fire-while-CM6-focused behavior is verified at the consolidated P3 operator verify-human. Phase 3 reduces to P3.2 doc fixes + that verify-human.
- [BUGFIX-2026-06-20] verify-human item 7 — **the "Open in Sublime Merge" button opened Sublime *Text*.** Root cause: the shared pure `resolve(on_path, bundle_exists)` discovery fn **hardcoded `ST_BUNDLE_BIN`** in its `Bundle` arm (correct when WP8 wrote it Text-only; wrong once `find_smerge` reused it). So `smerge_open → launch_merge → find_smerge → resolve` returned `Bundle(.../Sublime Text.app/.../subl)` and spawned `subl`. **Missed by the unit tests** because they fed `merge_command` a hand-built `SM Bundle` directly — never exercising the `find_smerge → resolve → merge_command` seam (each unit correct, the wiring wrong). Diagnosed empirically: per-command + per-spawn `eprintln!` telemetry in the live dev binary showed `commands::smerge_open ENTERED` followed by `spawn program=".../subl"`, then a runtime probe printed `find_smerge() = Bundle(".../Sublime Text.app/.../subl")`. **Fix:** parameterized `resolve(on_path, bundle_bin, bundle_exists)` — `find_subl` passes `ST_BUNDLE_BIN`, `find_smerge` passes `SM_BUNDLE_BIN`. **Regression guards added:** `resolve_bundle_uses_the_given_bundle_bin_not_a_hardcoded_one` + `merge_command_through_bundle_resolution_targets_smerge_not_subl` (the seam the old tests skipped). cargo 73/73, clippy/fmt clean, debug telemetry removed. Operator re-confirmed Merge opens.
