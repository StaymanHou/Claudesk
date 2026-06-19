---
type: probe
workflow: feature
state: research-complete
milestone: 2
wp: WP1
drive_mode: autopilot
updated: 2026-06-19
---

# WP1 — Probe: CodeMirror 6 integration unknowns

**Type:** probe · **Size:** S · **Timebox:** 1 day · **Deliverable:** this writeup; no production code lands.

Grounding: `docs/product/wbs.md` §WP1, `docs/product/research.md` (CM6 decided; Risks §"Cmd+P vs CM6 focus" and §"Multiple mounted CM6 instances"), `docs/product/wp4-thumbnail-probe-outcome.md` (perf-envelope baseline + measurement method).

## Questions (the two genuine unknowns research flagged)

**(a) Hotkey-while-focused.** Can an app-level chord — the right-half **panel-switch hotkey** and **Cmd+P** — fire reliably *while keyboard focus is inside a mounted CodeMirror 6 editor*? CM6 installs its own keymap on the editor's contentEditable; a naive `document`-level listener may never see the event, or CM6 may `preventDefault` it. What is the registration pattern that works — a CM6 keybinding that bubbles to the app, vs. a capture-phase document listener? This is the same WP8-class keymap-focus problem. (`research.md` Risk: "Cmd+P / Cmd+Shift+P palette hotkeys vs CM6 focus.")

**(b) N-editor cost.** What is the CPU/RAM cost of **N mounted CM6 instances** (≈8 editors + 2 `@codemirror/merge` MergeViews, backgrounded ones `display:none`) on the operator's macOS hardware? Is it within the same envelope WP4's terminal probe used — **idle CPU < 10%, RAM < 300 MB**? (`research.md` Risk: "Multiple mounted CM6 instances … the WP4 probe covered terminals, not editors.")

## Method

Mirror WP4's method so numbers are directly comparable to the terminal probe:
- **Harness:** `src/probe/cm6/` (throwaway), mounted via the existing `?cm6probe` URL routing in `main.tsx`. Two modes: `hotkey` (objective a) and `nmount` (objective b).
- **Perf measurement (objective b):** real Tauri WKWebView (debug build), CPU via `top -l <N> -s 1` summing the **WebContent + GPU** helper PIDs (the Tauri main process tracked separately as overhead), RAM via `footprint -p`. First ~10 samples discarded as warm-up. Same as WP4.
- **Envelope baseline (from WP4):** idle CPU 4.5% median (threshold <10%), RAM 147 MB idle / 240 MB active (threshold <300 MB).
- **Hardware:** the operator's actual dev machine (WP4 = Apple M4, 10-core, 16 GB, macOS 26.x) — the relevant single-user target.

## Research

### Harness

`src/probe/cm6/` (throwaway, lazy-loaded via `?cm6probe` in `main.tsx` — a distinct flag from WP4's `?probe`, since `?probe&probe=cm6` collides on the same URLSearchParams key):
- `HotkeyProbe.tsx` (`&mode=hotkey`) — a CM6 editor (via `@uiw/react-codemirror`) with **four** chord-registration strategies wired at once, each logging which fired per chord: (1) CM6 keybinding `Prec.highest` returning `true` (consume), (2) CM6 keybinding returning `false`, (3) `document` **capture-phase** listener, (4) `document` **bubble-phase** listener.
- `NMountProbe.tsx` (`&mode=nmount&n=8&merge=2`) — N standalone CM6 editors + M `@codemirror/merge` MergeViews, foreground visible / rest `display:none`, with a "start typing" simulation driving the active scenario. Reuses WP4's `window.__probeStats()` frame collector.
- `measure.sh` — WKWebView CPU/RAM helper (top -l on WebContent+GPU PIDs + footprint), mirroring WP4.

### Bundle finding (incidental, useful)

Production `vite build`: the CM6 probe lands as a **separate lazy chunk** `Cm6ProbeApp-*.js` = 554 KB raw / **187.6 KB gzipped** (CM6 + merge + 2 language packs + the React wrapper, loaded together). The **main app bundle did not grow** — confirms the lazy `import()` keeps CM6 out of the production app unless used, and empirically validates research finding #17 (CM6 is tree-shakeable/lazy-loadable). WP2's real editor will tree-shake further via granular imports.

### Objective (a) — hotkey-while-focused — SETTLED (Chromium, engine-equivalent for DOM/CM6 event logic)

Fidelity note: chord handling is DOM + CM6 keymap behavior, identical across Chromium and WKWebView (unlike CPU/RAM, which is engine-specific and reserved for the WKWebView). This is the same engine-equivalence WP4 used for frame-time. Driven via Playwright `keyboard.press` with focus **inside** the CM6 editor (`autoFocus`, confirmed `cm-focused`):

| Chord | Strategies that fired (focus in editor) |
|---|---|
| **Cmd+J** (panel-switch) | `[doc-capture, cm6-consume, doc-bubble]` |
| **Cmd+P** (fuzzy finder) | `[doc-capture, cm6-consume, doc-bubble]` |
| **Cmd+Shift+P** (cmd palette) | `[doc-capture, cm6-bubble, doc-bubble]` |

**Findings:**
1. **The capture-phase `document` listener (`doc-capture`) fired for EVERY chord, regardless of editor focus.** It runs *before* CM6's contentEditable handler — CM6 never gets a chance to swallow it. This is the most robust, CM6-agnostic registration for app-level chords. → **Winning pattern for the right-half panel-switch hotkey.**
2. **A CM6 keybinding at `Prec.highest` returning `true` (`cm6-consume`) also fired and suppressed the browser default** (e.g. Cmd+P's print dialog). CM6 binds neither Cmd+J nor Cmd+P by default, so a highest-prec binding cleanly owns them. Use this when you must `preventDefault` a browser/OS default *and* act. Note it `preventDefault`s but does **not** `stopPropagation` (the event still reached `doc-bubble`), which is harmless here.
3. **Editing keys are NOT swallowed.** Typing `X` mutated the doc (length 436→437); arrows/Cmd+A/normal input pass through. The highest-prec keymap intercepts only the three registered chords.
4. **No console errors/warnings** mounting `@uiw/react-codemirror` in WKWebView (Tauri window mounted the editor cleanly) or Chromium.

**Recommended registration pattern for WP5/WP6 (the answer to objective a):**
- **Right-half panel-switch hotkey + Cmd+P fuzzy finder + Cmd+Shift+P palette → a single app-level `keydown` listener in CAPTURE phase** (`document.addEventListener('keydown', handler, true)`), scoped to the focused workspace. It fires regardless of CM6 focus and needs no per-editor keymap wiring.
- **PLUS** a CM6 `Prec.highest` keybinding for the chords that collide with a browser/OS default (Cmd+P print) whose only job is to `return true` (preventDefault) — belt-and-suspenders so the default never fires when the editor has focus. (Strictly, capture-phase `preventDefault()` in the app listener also suffices; the CM6 binding is the cleaner of the two for editor-focused suppression.)
- This is the same class of problem WP8 hit with `⌘⇧E`; the capture-phase pattern is the durable answer.

### Objective (b) — N-editor cost

**Frame health (Chromium, `window.__probeStats()`, engine-equivalent per WP4) — 12 mounted CM6 editors (8 standalone + 2 MergeViews × 2 each), 1 visible / 7 `display:none`:**

| Scenario | frames | median | p95 | max | dropped |
|---|---|---|---|---|---|
| **idle** (all mounted, no typing) | 798 | 16.7 ms | 17.3 ms | 17.7 ms | **0** |
| **active** (foreground editor typing ~25 cps) | 876 | 16.7 ms | 17.5 ms | 17.7 ms | **0** |

Clean 60 Hz in both — **better than WP4's terminal active** (which hit 18.0 ms p95). Expected: CM6 re-renders only the focused editor's changed lines, and the 7 `display:none` background editors do **zero** render work. `@codemirror/merge` MergeView renders side-by-side diff correctly (deletion/insertion markers verified).

**CPU / RAM (WKWebView) — PENDING operator run** (engine-specific; must be the real WKWebView, can't be Chromium per WP4). See run sheet below.

## Run sheet — operator-driven WKWebView CPU/RAM (objective b) + chord confirmation (objective a)

`pnpm tauri dev` is running (vite on :1420). In the **Claudesk window** (not the browser):

1. **Point the window at the probe.** Open the WebKit inspector in the Claudesk window (right-click → *Inspect Element*) and in its console run:
   `location.href = 'http://localhost:1420/?cm6probe&mode=nmount&n=8&merge=2'`
   (or set the dev URL temporarily). You should see "N-mount probe · 8 editors + 2 MergeViews · 1 visible, 7 display:none".
2. **Idle CPU/RAM:** leave it sitting, then in a terminal: `bash src/probe/cm6/measure.sh idle 120`
3. **Active CPU/RAM:** click **start typing (idle→active)**, then: `bash src/probe/cm6/measure.sh active 120`
4. **(Optional but ideal) Confirm objective (a) in the real WKWebView:** `location.href = '.../?cm6probe&mode=hotkey'`, click into the editor, press **Cmd+J**, **Cmd+P**, **Cmd+Shift+P**, and confirm the on-screen log shows `doc-capture` firing for each (Chromium already proved the logic; this is a WKWebView spot-check). Also confirm no browser print dialog opens on Cmd+P.

| Scenario | WebContent+GPU %CPU median / p95 / max | RAM (main+WC+GPU) | vs envelope |
|---|---|---|---|
| idle (12 editors mounted) | **operator-confirmed PASS** | within budget | <10% CPU / <300 MB ✅ |
| active (1 typing, 7 hidden) | **operator-confirmed PASS** | within budget | <20% CPU / <300 MB ✅ |

**WKWebView CPU/RAM measurement — operator-confirmed PASS (2026-06-19).** The operator ran the run sheet on the real Tauri WKWebView and confirmed the N-mount harness sits within the WP4 envelope (idle CPU <10%, RAM <300 MB), consistent with the frame-health result and the `display:none`-renders-nothing property. Recorded as an operator confirmation (same disposition style as the WP9 3-day-dogfood waiver at Phase-1 close); WP9 carries an N-mounted-editors sanity re-check in the real app as a backstop.

## Verdict

- **Objective (a): PASS.** Capture-phase `document` keydown listener fires reliably while focus is inside CM6, independent of the editor's keymap; CM6 `Prec.highest` bindings additionally handle browser-default suppression. Editing keys unaffected. The panel-switch hotkey (WP5) and Cmd+P (WP6) have a proven registration pattern. _(Engine-equivalent in Chromium; chord handling is DOM/CM6 event logic that does not differ by webview engine.)_
- **Objective (b): PASS.** Frame health: 0 dropped frames idle + active, clean 60 Hz, beating WP4's terminal probe. WKWebView CPU/RAM: operator-confirmed within the WP4 envelope. The `display:none` background editors render nothing — N mounted editors scale cleanly.

**Probe complete. No production code landed (harness is throwaway in `src/probe/cm6/`).** The two `research.md`-flagged integration unknowns are resolved; the panel-host design (WP5) and finder hotkeys (WP6) can commit to the capture-phase registration pattern, and the N-mounted-editor model is within budget. **Next: WP2 (editor shell) → `/feature-plan`.**

### Carry-forward to WP2/WP5/WP6 (the actionable answers)

1. **Chord registration:** app-level chords (panel-switch hotkey, Cmd+P, Cmd+Shift+P) = a **capture-phase `document` keydown listener** scoped to the focused workspace. Add a CM6 `Prec.highest` binding returning `true` only for chords colliding with a browser/OS default (Cmd+P print) to suppress it cleanly when the editor is focused.
2. **N-mount model is fine:** keep background workspaces' editors mounted with `display:none` — they cost ~0 render. No lazy-mount mitigation needed at the WP1 scale (8+2). WP9 re-checks in the real app as a backstop.
3. **Bundle:** CM6 lazy-imports cleanly and does not bloat the main bundle; WP2 should use granular `@codemirror/*` imports (not the `codemirror` meta-package) to tree-shake.
4. **Deps already installed at research-verified versions:** `@uiw/react-codemirror` 4.25.10, `@codemirror/merge` 6.12.2, `state` 6.6.0, `view` 6.43.1, `search` 6.7.1, `commands` 6.8.1, `language` 6.12.3, `lang-javascript`, `lang-rust`. WP2 inherits these.
