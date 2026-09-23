# Archived Backlog

Items **Buried** by the disposition model (low-impact + medium-effort + low-risk — the
"meh" zone, not cheap enough to sweep, not valuable enough to prioritize). These are NOT
expected to be revisited; they live here so the active `backlog.md` stays a list of work
we actually intend to do. An item can be un-buried by moving it back if its calculus
changes (e.g. the prerequisite toolchain lands for another reason).

---

## SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP  `← Buried 2026-06-30 (debt-paydown WP6)`
- **Buried because:** the disposition model scored this Low-impact + Medium-effort + Low-risk —
  the meh zone. The fix is NOT a single test; it requires standing up an entire jsdom +
  `@testing-library/react` + `environment: "jsdom"` vitest toolchain that the repo deliberately
  does not have (standing posture: *pure logic → vitest, live DOM → Playwright/MCP-bridge*). WP6's
  test work (aria pairing, chord-type, exhaustiveness pins) used the `?raw` source-grep idiom and the
  Rust serde-contract test — NOT rendered-component tests — so it did NOT make a PaneTabs component
  test cheap. The two specific defects this gap named are now partly mitigated by code, not a
  component test: the ⌘W `closeActiveTabRef` stale-closure was fixed + comment-anchored (WP5), and
  the App.tsx `menu`-listener StrictMode double-register class is now structurally guarded by the
  shared `useTauriListen` hook (WP6, Theme I — the `cancelled`-flag lives in one place). The remaining
  value (a true render-time dirty-close-confirm assertion) is not worth the toolchain in isolation;
  fold into a future component-test-infra investment IF one is ever stood up for another reason.
- **Source:** feature:verify-codify (WP13 — ⌘W close-active-tab)
- **Type:** tech-debt
- **Summary:** WP13's vh.3 regression (the ⌘W `closeActiveTab` stale-closure bug — the memoized handle read pre-dirty `docs`, so a dirty tab closed silently instead of raising the confirm dialog) had NO automated test that would catch a recurrence. The fix was confirmed only at verify-human.
- **Context:** The dirty-guard routing lives in the `PaneTabs` React component (reads the parent `docs` store + calls `setClosing`); `openFiles.ts` is dirty-unaware, so there's no pure-logic seam. The repo has no DOM/component test environment — vitest runs node-default, there are zero rendered-component tests, and `pure logic → vitest` is the standing posture. Closure-freshness defects in component event handlers (state X updates without dep Y changing) are a recurring foot-gun (same shape as the `overlayOpenRef`/`closeActiveTabRef` latest-ref patterns WP13 itself used) and are exactly what a component test would guard.
- **Suggested action (if ever un-buried):** add jsdom + `@testing-library/react` + a vitest `environment: "jsdom"` config, then write a `PaneTabs` test: render with an open dirty file tab, fire `closeActiveTab()` via the imperative handle, assert the confirm dialog opens (not an immediate close). Pairs with any future component-level coverage (RightPanelHost chord wiring, EditorSplit focus). NOT worth standing up the whole toolchain for this single assertion in isolation.
- **Priority:** low
- **Status:** BURIED 2026-06-30 (debt-paydown WP6)
- **Note (2026-06-24, app-menu-bar Phase 2):** another instance of the same class — App.tsx's `menu` Tauri-event listener had a StrictMode async-`listen` DOUBLE-REGISTRATION bug (the effect's cleanup ran before the `listen()` promise resolved, so the first subscription's unlisten was never captured → two live listeners → menu clicks double-dispatched → finder/search/palette toggles cancelled out). Caught only at verify-human; fixed with the `cancelled`-flag guard (mirrors `useWorkspaceStatus`). **Now structurally guarded** by the shared `useTauriListen` hook (debt-paydown WP6, Theme I) — the async-listen + cancel-before-resolve guard lives in one place, so a fresh hand-rolled subscription can't re-introduce the double-register.

## SURFACE-2026-06-24-QUALITY-FSWATCH-REWALK-AMPLIFICATION  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** each `fs-change` event bumps both tree + git refresh keys, each triggering a full re-walk + git-status IPC, so a bulk external op produces several back-to-back full-tree re-walks (event→work amplification).
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; acceptable at the operator's repo sizes (the `build_ignore` doc already accepts a harmless extra re-walk).
- **Where:** `src/components/workspace/RightPanelHost.tsx:162-163`
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-24-QUALITY-FSWATCH-EMIT-FAILURE-INVISIBLE  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** debouncer-callback emit failures go only to `eprintln!`, so a persistent emit failure silently stops tree/editor updates with no operator-visible signal.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; no clean IPC channel back from a detached callback thread, and FSEvents emit failures are vanishingly rare (reviewer "likely dismiss").
- **Where:** `src-tauri/src/fs_watch/commands.rs:143,161`
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-24-QUALITY-FSWATCH-ISDIR-FALSE  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** `is_ignored` always passes `is_dir=false` to `matched_path_or_any_parents`; parent-matching covers directory-only patterns, so the edge is sound.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; reviewer confirmed sound, "no action needed."
- **Where:** `src-tauri/src/fs_watch/mod.rs:119`
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-25-QUALITY-WP5B-DESCENDANT-COUNT-STALE  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the folder-delete confirm's advisory descendant count reflects the tree as last refreshed, so it can understate the blast radius if the folder grew on disk since the last refresh (the trash itself is correct).
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; the WP0 watcher keeps the tree fresh in practice, and re-walk-on-confirm is the lowest-value of its sibling findings.
- **Where:** `src/components/workspace/editor/confirmDialog.ts` `deleteFolderSpec` consumer in `RightPanelHost.tsx` (count source).
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-25-QUALITY-WP7-CONSIDER-ARRAY-ALLOC  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the `consider` closure allocates a 1–2-element array per ancestor purely to reuse `dominantStatus` (cosmetic given changed-paths-only input).
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; the current form favors single-source-of-precedence clarity, reviewer dismiss-candidate.
- **Where:** `src/components/workspace/filetree/gitRollup.ts` `consider` closure (~79).
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-23-QUALITY-WP2-OVERLAY-ESC-PREVENTDEFAULT  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the picker's document-level Esc handler calls `preventDefault()` unconditionally, suppressing native Esc-to-clear and posing a latent conflict if another document Esc consumer (palette/finder) co-mounts.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; no co-mounted overlay conflict exists today.
- **Where:** `src/components/picker/PickerOverlay.tsx:28-37`
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-23-QUALITY-WP2-TOAST-SINGLE-SLOT-MULTIPLEX  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the single `toast` slot multiplexes a benign info prune-note and a surfaced error IPC failure, so one can clobber the other.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; acceptable for WP2 scope, split only if it bites.
- **Where:** `src/components/picker/ProjectPicker.tsx:131-149`
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-26-QUALITY-WP3-UNDIFFED-MIRROR-EMIT  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the `pip-mirror` emit sends the full serialized HTML for every needed workspace each tick while shown, with no per-tile diffing.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; correct and fine at dogfood N, revisit only if N grows.
- **Where:** `src/components/workspace/useMirrorTicker.ts` (~130, the emit).
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-28-QUALITY-WP9-REDUNDANT-MODE-REREAD  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** `pip_set_mode(On)` persists `mode` to disk then routes to `reconcile_on_mode_visibility`, which re-reads the mode back from disk rather than using the in-scope value — a redundant disk read on a user-click path.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; harmless (returns the just-persisted value) and arguably the file's deliberate "fresh from persisted truth" pattern.
- **Where:** `src-tauri/src/pip/commands.rs` (`pip_set_mode` → `reconcile_on_mode_visibility`).
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-20-QUALITY-WP4POLISH-STICKY-ZINDEX-COUPLING  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the whole-commits-sticky diff layout relies on z-index ordering across three sticky elements with no mechanical guard (no CSS/visual-regression harness), so a future top/z-index edit could silently restack.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; inherent to UI polish in a repo with no visual-regression harness, reviewer "none required."
- **Where:** `.diff-commits` / `.diff-commit-banner` / `.diff-file-header` in `.diff-scroll` (App.css).
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-20-QUALITY-WP6-HOVER-COUPLES-KEYBOARD-CURSOR  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** `onMouseEnter={() => setActiveIndex(i)}` couples mouse-hover to the keyboard cursor in FileFinder, so a resting mouse can yank the active row from an arrow-key user.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; negligible at the 100-row cap and mirrors CommandPalette, arguably WAI.
- **Where:** `src/components/workspace/finder/FileFinder.tsx:177` (`onMouseEnter`).
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-19-QUALITY-WP9-PLAN-IMPL-DRIFT-CCNOTFOUND  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** informational plan/impl drift — the Phase-1 outcome text said the not-found case maps to a `CcError::Spawn` variant, but the shipped code introduced a dedicated `CcError::CcNotFound` variant (cleaner than planned).
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; the implementation is better than planned, no code change wanted.
- **Where:** `workflow/archive/wp9-phase1-polish.md` P1.1 outcome line vs `src-tauri/src/cc_session/mod.rs`.
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-29-QUALITY-M8WP3-EVAL-CLASSIC-SCRIPT-IN-TEST  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the demo timeline is loaded via `eval(readFileSync(...))` against a bare `window` shim in a dev-only nodetest — brittle if the timeline ever gains a reference the shim doesn't provide.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; only viable read path for a non-module classic script and well-commented, not worth changing while the timeline stays data-only (dismiss-candidate).
- **Where:** `tooling/demo/timeline.filmstrip.nodetest.mjs:31`
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-28-QUALITY-WP10-ESLINT-IGNORE-BUNDLED  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the `tmp/**` + `src-tauri/tmp/**` eslint-ignore addition is an in-scope incidental fix bundled into the feature commit (correctly commented + WIP-flagged); informational, "not a defect."
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; tracked not silent, moving it to its own commit isn't worth a dedicated pass.
- **Where:** `eslint.config.js:18-21`
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-25-QUALITY-WP4-TRIGGER-ONCE-UNDERFLAGGED  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the deferred-spawn trigger effect's comment ("bumps `spawnNonce` exactly once") slightly overstates the guarantee — once-ness is co-enforced downstream by the spawn effect's `cancelled` self-kill, not by the trigger alone.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; the behavior is SAFE and documented-WAI, and editing the comment risks a future reader "tightening" the de-dup and breaking the StrictMode/`cancelled` invariant.
- **Where:** `src/components/workspace/XtermPane.tsx` (trigger effect ~418-425; cross-refs spawn effect `hasSpawnedRef` ~365).
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-24-QUALITY-DEVPROD-OVERLAY-WINDOW-SIZE-COUPLING  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the dev overlay re-declares window `width`/`height` in `app.windows[0]` only because Tauri's array-merge replaces the whole window object (the sole intended override is `title`), so a future prod window-size change would see dev silently keep 1280×800.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; the cheap comment-form is INFEASIBLE (`tauri.dev.json` is strict JSON, `//` breaks parsing), leaving only the medium-effort "track window size in a shared place" fix (BURY decided at sweep #2 WP2).
- **Where:** `src-tauri/tauri.dev.json:6-12`
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-08-02-SET-A-CSP-AS-SECOND-LINE-OF-DEFENSE  `← Buried 2026-09-23 (paydown-2026-09-23 WP1)`
- **Buried because:** operator ruling R3 (paydown-2026-09-23): `csp: null` is accepted as the posture; the sanitizer remains the only defense (`[[app-ships-with-no-csp]]`). A CSP's failure modes (PiP, menu-bar popover, CM6/xterm inline styles) are invisible to the suite.
- **Source:** feature:verify-human (M11 WP3 Phase 3)
- **Target level:** product:arch
- **Type:** new-work (security hardening)
- **Summary:** Set a real Content-Security-Policy on the webview. `tauri.conf.json` ships `"csp": null`; the operator agreed at WP3 verify-human that a CSP **should** exist as a second line of defense behind the renderer's raw-HTML escaping.
- **Context:** WP3 recorded the *posture* decision in `arch.md` ("raw HTML is BLOCKED", pinned three ways) but deliberately did NOT set the CSP, on two grounds. (1) It needs **`style-src 'unsafe-inline'`** — 14 files use inline `style={{…}}` and CodeMirror/xterm inject stylesheets at runtime — so it does **not** close the CSS vector class and is a partial backstop, not a replacement for the escaping. (2) It is **app-wide**: terminal, editor, diff, PiP NSPanel, dashboard and updater all render under it. A too-strict CSP fails **silently** (blank panel, unpainted terminal), so it needs a full-surface live verification pass that a docs-viewer WP had no reason to run.
- **Suggested action:** Proposed starting policy — `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost`. ⚠️ Verify **live** on every webview surface before shipping: xterm terminal (render + input), CodeMirror editor + diff, the **PiP NSPanel** (separate webview — easy to forget), the analytics dashboard, and the updater banner. Confirm the updater's `github.com` endpoint still resolves (it is a Rust-side fetch, so it should be unaffected — verify rather than assume). Note `img-src data:` is needed if any surface renders inline data-URI images.
- **Priority:** medium (no live exposure — raw HTML is structurally blocked and mutation-proven; this is defense-in-depth for when that first line is removed by someone who did not know it was load-bearing)
- **Status:** deferred — carry to next cycle *(M11 cycle-close sweep 2026-08-03)*. Deliberately NOT folded into M11: app-wide in scope, needs `style-src 'unsafe-inline'`, fails SILENTLY, and wants its own verification pass — folding it into a docs-panel WP would have shipped it unverified. Recorded in `arch/security-posture.md` → read-only-is-the-panel-not-the-webview.

## SURFACE-2026-08-21-SUBAGENT-PAIRING-CLAIM-IS-REFUTED-BY-PRODUCTION-DATA  `← Buried 2026-09-23 (paydown-2026-09-23 WP1)`
- **Buried because:** operator ruling R4-26 (paydown-2026-09-23). The doc half was already fixed; re-keying M9 subagent analytics onto `Agent`-tool pairing is M effort for an analytics nicety.
- **Source:** feature:build (M13.5 WP2 Phase 1 — found while root-causing the stale-blue dot)
- **Target level:** product:arch (time-analytics accuracy) — **not** a status defect
- **Type:** gap (analytics computed from a minority of the available events)
- **Summary:** M9's subagent-duration analytics are computed from **~31% of the `SubagentStop` events**, and its per-agent-type breakdown does not exist in practice. Two measured facts, both across the prod + dev corpora (~108MB of `time-analytics.sqlite`): (1) **`agent_type` is NULL on 100% of 3,977 subagent events** — CC does not send `subagent_type`, so `reclassify::subagent_intervals`' FIFO keying collapses everything into one `<unknown>` bucket; (2) **`SubagentStop` outnumbers `SubagentStart` 3,031:946** (3.2:1; per-session imbalances like 0:19, 5:50, 0:13), so most stops find no open start and are **silently discarded**.
- **Context:** ⚠️ **Nothing is broken and nothing panics** — the `unwrap_or("<unknown>")` fallback is what keeps this correct-but-coarse, which is exactly why it went unnoticed: subagent durations are *narrower* than the code reads, not wrong. ⚠️ **The doc claims were the real hazard and are now corrected in 5 live sites** (`hook_install/mod.rs`, `reclassify/mod.rs` header + `subagent_intervals` fn doc, `claudesk-hook.pl`, `arch/status-channel-and-surfaces.md`, `tests/hook_pl_output.rs`) — all previously asserted pairing "by `agent_type`" as fact. ⚠️ The test `subagent_start_maps_subagent_type_to_agent_type` **passes and is correct** (it pins the hook's transformation on a *synthetic* payload) but its comment asserted CC sends the field; comment fixed, test untouched. ⚠️ **The properly-paired subagent signal already exists and is already flowing:** `PreToolUse`/`PostToolUse` with `tool_name == "Agent"` balance **exactly** per session (493 pre vs 486 post + 7 failures = 493) and carry `tool_use_id`. Note `SubagentStart` (946) != `PreToolUse[Agent]` (493), so `SubagentStart` is not the spawn signal either.
- **Suggested action:** Decide whether M9's subagent segmentation should re-key onto the `Agent`-tool pairing (accurate, `tool_use_id`-keyed, no label) or stay on `SubagentStart`/`Stop` (labeled in principle, unreliable in practice). ⚠️ **Do NOT "fix" the label handling alone — the stop surplus is the larger half of the error.** Quantify the duration delta on real data before changing anything; the current numbers are conservative (under-counting), so this is an accuracy improvement, not a bug fix.
- **Priority:** low-medium (no correctness/data-loss impact; it under-reports one segment kind in a dashboard the operator reads, and the misleading docs — now fixed — were the part that could have caused a wrong build)
- **Status:** pending

## SURFACE-2026-08-14-SKILL-SCAN-COLLAPSES-TWO-FRONTMATTER-ERRORS  `← Buried 2026-09-23 (paydown-2026-09-23 WP1)`
- **Buried because:** moot. No skill scanner exists (the entry was self-declared DORMANT). Revive only if a scanner is built.
- **Source:** feature:build (M13 WP1 Phase 1, P1.3 — synthetic fixture)
- **Target level:** product:wbs (M13 WP2, task 2.1 — a scanner design detail, not a defect)
- **Type:** gap
- **Summary:** The probe classifier collapses two distinct authoring errors into one class: a `SKILL.md` with **no** `---` fenced block and a `SKILL.md` whose block is **opened but never terminated** both classify as `no-frontmatter`. The real skill dir has neither case (all 50 valid entries parse), so this only surfaced against the synthetic fixture.
- **Context:** Matters for WP2's Q2 verdict on diagnostics: if the scanner surfaces a dirty-entry count to the operator, "unterminated frontmatter" is an actionable authoring bug in a skill the operator owns, whereas "no frontmatter" more often means "this directory is not a skill." Reporting them identically costs the operator the distinction.
- **Suggested action:** Decide in WP2 task 2.1 whether the diagnostic vocabulary separates them. Cheap either way — it is one branch in the parser. Not worth its own work package.
- **Priority:** low
- **Status:** **deferred — DORMANT** (M13 close 2026-08-18); ⚠️ **MOOT as of 2026-08-14**: WP2 task 2.1 chose option (i) (**no scanner**, §4c: the command name is the only sanctioned coupling), so this item's only target no longer exists and **no scanner will be built**. ⚠️ **Deliberately NOT deleted as resolved** — nothing fixed the classifier; the finding is real about the probe instrument (M13 confirmed at close: no scanner exists in `src/` or `src-tauri/src/`) and becomes live again only if future work reintroduces skill-frontmatter parsing. ⚠️ Do **not** treat this as a reason to build the scanner.

## SURFACE-2026-08-01-DOMPURIFY-DEFAULTS-LEAVE-DATA-SVG-AND-STYLE  `← Buried 2026-09-23 (paydown-2026-09-23 WP1)`
- **Buried because:** moot. `dompurify` is no longer a dependency. Revive only if that renderer option returns.
- **Source:** feature:build (M11 WP1 Phase 2)
- **Target level:** product:wbs (M11 WP3 build-time constraint — only if Option A is chosen)
- **Type:** gap (security-config finding)
- **Summary:** **DOMPurify's default configuration is NOT sufficient for this app's threat model.** Measured against a hostile fixture: `DOMPurify.sanitize(marked.parse(src))` leaves **two live vectors** — a live `<style>` tag, and `<img src="data:image/svg+xml;base64,…">` whose payload decodes to `<svg onload="alert(1)"></svg>`. **Neither `FORBID_TAGS` nor the strictest `ALLOWED_URI_REGEXP` removes the `data:` URI** (three configs probed; all three left it intact) — DOMPurify treats `data:` on `<img>` as an allowed-data-URI tag and bypasses the URI regexp for it.
- **Context:** Only bites if M11 WP1's verdict picks **Option A** (`marked` + DOMPurify). Option B (`react-markdown`) escapes raw HTML by default and measured 0 live vectors with no extra work. Matters because the app has **no CSP** (see `SURFACE-2026-08-01-APP-SHIPS-WITH-CSP-NULL-…`), so the sanitizer is the only line of defense and the failure mode is silent — the output *looks* sanitized.
- **Suggested action:** If Option A is chosen, the shipping config must include `FORBID_TAGS: ["style"]` **and** an `afterSanitizeAttributes` hook stripping `data:` from `src`. Verified to reach 0 live vectors while preserving a benign `./local.png` and all cross-doc/anchor/external hrefs. Pin it with a hostile-fixture test asserting the **live DOM** (not source text). If Option B is chosen, this item is moot — close it.
- **Priority:** low (conditional on the WP1 verdict; fully characterized with a proven fix in hand)
- **Status:** **deferred — MOOT under the WP1 verdict** *(2026-08-01)*. WP1 chose Option B (`react-markdown`), so DOMPurify does not ship and this gap is not live. Kept rather than deleted because the mutation table below is the evidence for *why* Option A was not chosen — **revive only if Option A is ever reconsidered**. Nothing resolved it; the verdict routed around it, so delete-on-resolve does not apply.
- **⚠️ UPDATED 2026-08-01 (verify-self) — the gap is WIDER than first measured, and the first measurement was wrong.** The original predicate had no `style`-**attribute** probe, so it scored a surviving `<div style="background:url(javascript:alert(1))">` as clean. DOMPurify's default `ALLOWED_ATTR` includes `style` and it does not parse CSS. Corrected numbers: **`A-sanitized` (defaults) = 4 live vectors**, not 2. The full Option-A recipe is therefore **three individually-necessary options** — `FORBID_TAGS:["style"]` + `FORBID_ATTR:["style"]` + the `afterSanitizeAttributes` data-URI hook — each **mutation-proven load-bearing** (dropping any one scores 1, 2, or 1 respectively; dropping all scores 4). **If Option A is chosen, all three ship together and the pinning test must assert the live DOM including a style-attribute probe** — the failure mode of omitting one is silent. Two further latent gaps (`img[srcset]`, `track[src]`) survive even the full recipe: outbound network/beacon references rather than script execution, low priority, but unblocked only by the absent CSP.

## SURFACE-2026-07-14-TURN-OUTPUT-REORIENTATION  `← Buried 2026-09-23 (paydown-2026-09-23 WP1)`
- **Buried because:** dropped from Group F by operator decision (roadmap Revision 2026-09-15). Recorded, not scheduled; re-open only on an explicit operator ask.
<!-- Heading RESTORED at the M10.9 cycle-close sweep (2026-07-31). This item had lost its `## ` heading
     and was orphaned under SURFACE-2026-07-20-TIME-TRACKING-OFFLINE-LOCAL-ONLY-MESSAGING, making it
     unfindable by ID and making that item appear twice in a heading scan. Pre-existing defect, not
     introduced by this cycle. -->
- **Source:** operator (raised mid-M9, 2026-07-14)
- **⚠️ PARTIALLY RESOLVED 2026-08-25 by M13.5 WP3 — REWRITTEN to the remaining open work, not deleted.**
  Solution direction 1 of 4 shipped: **turn-boundary markers + a bidirectional jump affordance**
  (`↑ N/N ↓` in the terminal chrome, stepping through turn starts over the existing scrollback).
  See `CHANGELOG.md` 2026-08-25 and `workflow-system/state/archive/turn-output-reorientation.md`.
  ⚠️ **The original problem is NOT fully solved** — a jump control helps you *navigate* to a turn
  start; it does not stop an inline answer being **buried** by continued task output, which is the
  half the operator actually reported ("can't find that answer anymore").
- **Target level:** product:roadmap — the remaining directions are a further capability, not a bug.
- **Type:** new-work (UX / attention feature).
- **Summary (remaining):** With heavy cross-workspace switching, the operator asks a *question layered
  on top of a workflow instruction*, the LLM **answers first and then proceeds without pausing**, and
  by the time the operator switches back the answer is buried mid-scroll. Navigation to turn starts
  now exists; **surfacing or preserving the answer itself does not.**
- **Context:** Squarely in Claudesk's thesis — *attention is the scarce resource*
  ([[claudesk-philosophy]]). Real-time status surfaces say *that* a workspace changed state; WP3 now
  helps you re-orient to *where a turn began*. Neither helps you find **the answer inside it**.
  Adjacent-but-distinct from the M11 docs-viewer ([[m7-docs-viewer-intent]]).
- **Remaining solution directions (3 of the original 4 — all still undecided):**
  - ~~**Turn-boundary markers in the terminal**~~ — ✅ **SHIPPED M13.5 WP3** (2026-08-25).
  - **Per-turn "answer/notable" capture:** detect when CC emitted a direct answer to an operator
    question (vs. pure task output) and surface it in a persistent, non-scrolling side rail or a
    "last answer" chip that survives the turn.
  - **A turn digest / re-orientation panel** opened on returning to a workspace: "since you left:
    turn ended, here's the answer to your question + what got done."
  - **Behavior-side:** make the orchestrator pause (or visibly flag) after answering an inline
    question layered on an AUTO task, so the answer isn't immediately buried. ⚠️ This one is a
    **workflow-system** change, not a Claudesk one — it belongs in the owed cross-repo handoff.
- **⚠️ WHEN ADDRESSED — REQUIRED FIRST STEP, STILL NOT DONE:** **scan the recent session logs /
  transcripts for concrete real examples** of the pattern (question layered on a workflow instruction
  → LLM answered-then-proceeded → answer buried in a long turn). Ground the spec in captured
  instances, not a hypothetical — the operator explicitly asked for this. ⚠️ **M13.5 WP3 did NOT do
  this** (it was scoped to the navigation half, whose design was settled by probe data instead), so
  the requirement carries forward intact. Likely sources: harness session logs under
  `~/.claude/projects/<slug>/`, long-turn transcripts. Extract 2–3 concrete examples (the question,
  where the answer landed, how far it scrolled).
- **Priority:** medium (the navigation half is shipped, which lowers the felt friction; the
  answer-burial half remains real and recurring).
- **Update 2026-09-15 — ⛔ DROPPED from Group F by the operator.** Briefly carried as **F-c** in
  `roadmap.md`'s Group F (opened the same day) and **removed on operator review** of the three
  operator-requested capabilities. ⚠️ **Dropped from the scheduled group, NOT deleted and NOT
  resolved** — the entry stays because half of it genuinely shipped (M13.5 WP3's turn-boundary
  markers + `↑ N/N ↓` jump) and the remaining answer-burial half is a real, articulated problem
  with its history intact here. It is simply **not scheduled work**. ⚠️ **Do NOT re-promote it by
  citing the product thesis** — it reads as a strong fit for *attention is the scarce resource*,
  which is exactly why it keeps resurfacing; the operator has now weighed it against F-a/F-b and
  chosen not to carry it. **Re-open only on a fresh operator ask.**
- **Status:** pending — recorded, not scheduled (dropped from Group F 2026-09-15)

## SURFACE-2026-07-08-M9-WP6.5-CLOSE-MARKER-MISSES-FORCE-QUIT  `← Buried 2026-09-23 (paydown-2026-09-23 WP1)`
- **Buried because:** an accepted limitation, low impact; the `ExitRequested` hook is not worth building speculatively.
- **Source:** feature:verify-human (M9 WP6.5 Phase 3)
- **Target level:** product:wbs (future enhancement) — NOT blocking WP6.5
- **Type:** tech-debt / known-limitation
- **Summary:** The explicit `WorkspaceClose` session-end marker (signal 1) fires only from `on_window_event(CloseRequested)` (+ the pre-existing WP7 `kill_all` reaping). A **force-quit** (SIGKILL/SIGTERM) bypasses the Tauri window event entirely, so no marker is written (operator force-quit with cc-1+cc-2 busy → 0 markers; no orphans, since parent-kill reaped the PTY children). A graceful per-workspace close DOES write the marker (verify-self LIVE-confirmed). Whether a graceful app-level ⌘Q reaches `CloseRequested` is unconfirmed (single-window Tauri usually fires it on last-window-close, but ⌘Q app-termination may route differently).
- **Context:** Operator-ACCEPTED as expected (2026-07-08): a force-quit is indistinguishable from a crash — CC emits no `SessionEnd` on a hard kill either (research 2026-07-08). The dangling session self-heals via **Phase 4 startup reconciliation** + **Phase 1 read-time cap**, so the dashboard numbers stay correct. This makes Phase 4's reconciliation LOAD-BEARING for the force-quit/⌘Q case, not just crash/power-loss.
- **Suggested action (future, optional):** add a `RunEvent::ExitRequested` / app-termination hook so a GRACEFUL ⌘Q also writes markers before exit (a true force-kill still can't be caught by any code). Low value given 2/4 cover it.
- **Priority:** low
- **Status:** deferred — carry to next cycle *(M11.5 close, 2026-08-01)* (accepted limitation; Phase 4 reconciliation is the safety net) — **deferred, carry to next cycle** *(M10.9 close, 2026-07-31)*

## SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY  `← Buried 2026-09-23 (paydown-2026-09-23 WP1)`
- **Buried because:** a cross-project workflow-position view (L); it re-enters as roadmap work if wanted, not as backlog debt.
- **What:** M3 WP5 (specced as a `workflow/.session.md` file-watcher → broadcaster) is **DROPPED**. The WBS framed `.session.md` as a real-time second workflow-state signal — but it isn't: `.session.md` is a *manual handoff bookmark* created **only** by `/session-pause` and deleted by `/session-resume` (verified against `~/.claude/skills/session-pause` + `session-resume` SKILL.md). It is absent during all active work, present only in the parked gap between sessions, binary, and known to the user before any watcher could report it. Watching it yields a near-constant, trivially-derivable signal — no live workflow state to detect.
- **Consequence for M3:** M3's goal (CC idle/running/awaiting from the official hook channel, never PTY scraping) is **fully met by WP1–WP4 + WP6**. With WP5 dropped, **Milestone 3 is COMPLETE** → `/product-finalize`.
- **New WP idea (operator-defined 2026-06-22, deferred to a later milestone — NOT M3):** instead of `.session.md`, watch the **workflow document hierarchy** to surface where a project actually is in the workflow: `roadmap.md → wbs.md → workflow/wip/*.md` (possibly multiple WIP files — tasks can fork mid-feature) → `backlog.md`. This is the genuine live workflow state (the WIP Work Tree / Current Node mutates continuously as skills run; roadmap/wbs give the milestone context). Reuses the `notify` watcher seam that `SURFACE-2026-06-21-EDITOR-FILE-WATCHER` also wants.
- **Hard part (acknowledged, NOT a blocker):** visually representing the whole tree (roadmap→wbs→wip(s)→backlog) in the UI is the design challenge. **Good-to-have, not must-have.**
- **Anchored to Milestone 6 (menu-bar status item)** (operator decision 2026-06-22): the M6 popover is a one-row-per-workspace LIST (project name + status), which fits a workflow-position line (e.g. `acme-api · WBS M2/WP3 · building`) far better than a thumbnail tile — and by M6 the operator will have dogfooded M4+M5 and will know what workflow-position info is worth surfacing (resolves the "unsolved visualization" risk by deferring the design until there's real usage signal). NOT folded into M4/M5 (those are pure CC-state status-surface rendering; adding a workflow axis + tree viz mid-build is the wrong place). If it outgrows a popover line into a real tree view, promote to a standalone feature after M6. The `notify` watcher seam (shared with `SURFACE-2026-06-21-EDITOR-FILE-WATCHER`) gets built whenever the first consumer needs it — likely M6.
- **Priority:** medium (the new WP idea); the drop itself is a clean WBS correction, no work owed.
- **RE-ANCHORED M7 → M8 (2026-06-29), reinforced by the M7 shrink.** Initially (at the M7 `/product-wbs`) this was re-anchored to M8 over M7 because the workflow-position line is value-unproven and drags in tree-visualization surface. **Then the M7 spec debate SHRUNK the menu-bar item to an ambient alarm + actuator and CUT the popover entirely** (design-prior [[new-surface-must-earn-its-place-against-existing-ones]] — a popover list was a PiP subset). So the watcher's intended form factor (a workflow-position line *in the popover*) no longer exists in M7 at all — its home is firmly **M8 (workflow-docs markdown viewer)**, the rendering counterpart ("where does each project sit" as a status line is adjacent to "render the docs themselves"; the `notify` watcher seam — shared with `SURFACE-2026-06-21-EDITOR-FILE-WATCHER` — can be built there). Decide at M8's JIT decomposition whether it feeds the M8 doc panel, promotes to a standalone tree view, or is dropped.
- **RENUMBERED M8 → M10 (2026-06-29b), no semantic change.** The watcher's home is still the **workflow-docs markdown viewer** — that milestone was renumbered M8 → **M10** by the 2026-06-29b roadmap reorder (a new demo-assets milestone took M8; time-analytics ↔ docs-viewer swapped). Same milestone, same decision; only the number moved. Decide at the docs-viewer's JIT decomposition whether it feeds that doc panel, promotes to a standalone tree view, or is dropped.
- **DECIDED at the M11 (docs-viewer) JIT decomposition — NOT folded into M11 (2026-07-20).** The milestone is now **M11** (further renumbered by the 2026-07-06 auto-updater + 2026-07-16 M10.5 inserts). At M11's `/product-wbs`, the watcher idea was **held out of M11**: M11 is the **single-workspace, read-SIDE** renderer — it renders *the focused project's* docs (`vision→roadmap→wbs→wip→backlog→.session.md`) as formatted markdown in the right panel. The doc-**hierarchy watcher** here is a distinct, **cross-project** capability — surfacing *where each project sits* across the open set (a status-line/tree axis over many workspaces), which overlaps the filmstrip/PiP/menu-bar status-surface family, not the per-workspace render. That is its own future feature (a standalone cross-project workflow-position view), to be triaged at a later roadmap boundary — it does not belong inside M11's per-workspace viewer. The shared `notify` watcher seam it wanted **already exists** (QoL-WP0 `fs_watch`), so no infra is owed; M11 reuses that seam for its own live-reload.
- **Status:** WP5 dropped (recorded in M3 wbs.md, archived); the cross-project workflow-position **watcher/tree** idea remains **deferred → NOT in M11** (decided 2026-07-20 at M11 JIT decomposition; see line above). Re-triage as a standalone cross-project view at a future roadmap boundary. (Anchor history: M6 → M7 → M8 → M10 → M11; M7's popover form-factor was cut at the 2026-06-29 spec-debate shrink.)

## SURFACE-2026-06-20-WP3C-SHARED-DOC-CURSOR-RESET  `← Buried 2026-09-23 (paydown-2026-09-23 WP1)`
- **Buried because:** dogfood-conditional, L (a shared-`EditorState` refactor); nobody has reported the cursor reset in use.
- **Source:** feature:build (WP3c Phase 1)
- **Target level:** product:wbs
- **Type:** tech-debt
- **Summary:** Split-pane editor uses shared-document with N independent `<CodeMirror>` (`@uiw`) instances bound to one `value`/`onChange`. Typing in one pane fires `setDoc` → all panes re-render with the new `value`, which can reset the OTHER pane's cursor/selection on each keystroke.
- **Context:** Acceptable for v1 — panes are viewports (the high-value gesture is *viewing* two regions of a long file; edits typically happen in one pane). A true fix is a single shared CM6 `EditorState` across views (dropping the `@uiw/react-codemirror` wrapper for raw `EditorView`s), which is a larger refactor that would also touch WP2/3a/3b wiring.
- **Suggested action:** Observe at WP3c verify-self/verify-human and during WP9 dogfooding. If the cursor-reset is annoying in practice, schedule a raw-`EditorView` shared-state refactor (post-M2, or fold into a later editor-polish WP). Otherwise dismiss.
- **Priority:** low
- **Status:** deferred — carry to next cycle *(M10.9 close, 2026-07-31)*

## SURFACE-2026-08-01-EDITOR-DISK-RELOAD-WAITS-FOR-REAL-WINDOW-FOCUS  `← Buried 2026-09-23 (paydown-2026-09-23 WP1)`
- **Buried because:** low-confidence observation, confounded by tester error at filing; re-file with a clean repro if it recurs.
- **Source:** feature:build (M11.5 WP2 Phase 1 reproduction run, 2026-08-01)
- **Target level:** product:wbs
- **Type:** bug
- **Summary:** ⚠️ **LOW-CONFIDENCE — re-test from scratch before acting.** Observed that an external change to an open file did not reload the editor's document text while the Claudesk window lacked real OS focus. **The observation is partly confounded by tester error:** the shell cwd had reset, so one of the disk writes landed in the repo root instead of the watched scratch dir — the app was correctly watching a file that had stopped changing. The effect may be wholly explained by that. Recorded because it was noticed, not because it is established.
- **Context:** Found incidentally while trying to reproduce the minimap staleness bug — it is **not** that bug (the minimap faithfully matched its own buffer in every recipe, and `SURFACE-2026-07-31-EDITOR-MINIMAP-STALE-ON-FILE-UPDATE` explicitly states the text updates correctly). Deliberately **not** pursued in WP2: the roadmap clears the `checkDisk` → `diskDecision` → `reloadFromDisk` path as not-suspect, and it is shared machinery the WP was instructed not to touch without a reproduction implicating it. Whether this is even a defect is a judgment call — reloading only on focus is a defensible design (it is when the user can actually see the change), and it may well be the intended behavior.
- **Suggested action:** First decide whether it is a bug at all. If yes, the question is whether the CC-edits-a-file case (the common Claudesk case, where the user *is* watching the panel while CC works, possibly with the window focused but the editor pane merely unfocused) is covered by the current trigger. Worth pairing with any future work on the disk-reload path rather than picking up alone.
- **Priority:** low
- **Status:** deferred — carry to next cycle *(M11.5 close, 2026-08-01)*

## SURFACE-2026-08-10-NO-GUARD-COUPLES-A-CSS-CLASS-TO-ITS-EMITTING-COMPONENT  `← Buried 2026-09-23 (paydown-2026-09-23 WP1)`
- **Buried because:** low impact, M effort (extending `cssModifierAudit.test.ts` to ~298 base classes).
- **Source:** M12 WP4c code review; scope NARROWED at the 2026-08-12 paydown sweep (WP7)
- **Target level:** product:arch (repo-wide verification hygiene)
- **Type:** gap
- **Summary:** Every CSS-related guard in this repo reads exactly ONE side of the CSS↔component contract, so a class can be **styled-but-never-emitted** (dead CSS still carrying real behavior) or **emitted-but-never-styled** with both sides individually green. ✅ **The MODIFIER selectors are now covered** (`cssModifierAudit.test.ts`, added 2026-08-12): all 13 `.block.is-*` / `.block.has-*` selectors are asserted emitted, mutation-proven against the original `is-editing` regression. What REMAINS open is the **base-class** direction across `App.css`'s other ~298 top-level class blocks.
- **Context:** ⚠️ **The 13-selector audit found ZERO orphans, and that is the honest result** — but it found two *false* positives first, which is the transferable part. `.diff-line.is-add` and `.diff-line.is-remove` are emitted as `` `diff-line is-${line.origin}` ``, so those strings appear NOWHERE in source; a literal search flags them as dead CSS on correct code. ⚠️ And the first predicate used `includes(modifier)`, which a mutation proved vacuous: renaming the emitted `is-editing` to `is-editingRENAMED` left the audit green, since the longer string still contains the shorter — the same prefix-shadowing hole `hasRule` exists to avoid, reproduced on the component side. Boundary matching fixed it. ⚠️ Base classes are a **different risk profile** from modifiers and that is why the split is defensible rather than lazy: a base class is visible on screen the moment it is wrong, while a modifier fires only mid-interaction — which is exactly how the `is-editing` regression shipped.
- **Suggested action:** Extend `cssModifierAudit.test.ts` from modifiers to all `^\.[a-z-]+` blocks. ⚠️ Two traps, both already paid for once: defining *emitted* is the hard part (interpolation above; also `data-testid`s share the class naming convention, so proximity to `className` is the only honest signal), and **comments must be stripped first** (a design-prior slug ending `-is-chosen` demanded CSS for a class existing only in prose). Budget for false positives on ~298 classes, not 13.
- **Priority:** low *(was medium — the behavioral half is now guarded; the remainder is largely cosmetic-risk classes)*
- **Status:** deferred — scope narrowed to the base-class direction at the 2026-08-12 paydown sweep

## SURFACE-2026-06-26-MCP-BRIDGE-RELEASE-ACL-STRINGS  `← Buried 2026-09-23 (paydown-2026-09-23 WP1)`
- **Buried because:** functionally release-safe and self-described as optional/low value. ⚠️ Its suggested `[target.'cfg(debug_assertions)'.dependencies]` fix would NOT work: Cargo target tables take target cfgs, not `debug_assertions`. A real fix means a feature-gated optional dep. Its v0.2.2 blockquote marked it RESOLVED on a different criterion (release build ran clean); this burial supersedes that.
- **Source:** feature:build (M5 WP2 probe, P2.3 release-exclusion check)
- **Target level:** product:wbs
- **Type:** tech-debt
- **Summary:** The dev-only `tauri-plugin-mcp-bridge` is correctly compiled OUT of release *code* (`#[cfg(debug_assertions)]` — `nm` finds zero bridge command-handler symbols; bridge port `9223` literal absent), BUT its **permission-manifest name strings** (`mcp-bridge`, `allow-execute-js`, `list_windows`, `ipc_monitor`, …) are still embedded inert in the release binary's ACL blob (`gen/schemas/acl-manifests.json`), because the crate is a plain `[dependencies]` entry and Tauri's build-time permission codegen emits its manifest regardless of the runtime `cfg` gate.
- **Context:** NOT a security or bundle-size concern — these are a few hundred bytes of permission-vocabulary strings, NOT code, and NOT a granted capability (the `mcp-bridge:default` permission is never referenced by any compiled-in capability; `mcp-bridge-dev` lives only in `tauri.dev.json`, which release builds don't load — `strings | grep mcp-bridge-dev` on the release binary = empty). So nothing can invoke the bridge in release. The ADOPT verdict's "release-safe" claim holds. This is a fidelity footnote: a *fully* clean release ACL would also exclude the dep from the manifest.
- **Suggested action:** Optional. If a fully-clean release ACL is wanted, move `tauri-plugin-mcp-bridge` from `[dependencies]` to a dev-only dependency surface that the build-time permission codegen also skips (e.g. a `[target.'cfg(debug_assertions)'.dependencies]` entry or a feature-gated optional dep), and re-confirm `pnpm tauri:dev` still gets the bridge. Verify with `strings target/release/claudesk | grep -i mcp-bridge` → empty. Low value; the current state is functionally release-safe.
- **Priority:** low
- **Status:** deferred — carry to next cycle *(M10.9 close, 2026-07-31)*

## SURFACE-2026-06-24-QUALITY-APPMENU-LISTENER-NOT-EXTRACTED  `← Buried (buried 2026-07-20, backlog-paydown sweep §Completion; moved here from backlog.md's inline ## Buried list 2026-09-23)`
- **Was:** the `src/App.tsx` `menu` listener isn't extracted to a pure testable `dispatchMenuAction(action, effects)` seam. LOW-impact + med-effort + low-risk; explicitly "defer unless the listener grows"; consistent with the repo's "runtime-bound listeners aren't unit-tested" posture (the higher-value `menuBridge` mapping IS fully tested). **Revive only if** the App.tsx menu listener grows new branches. (Was: `# app-menu-bar` finding, now removed from `backlog-quality-findings.md`.)

## SURFACE-2026-08-03-QUALITY-WP1-MEASUREMENT-SCRIPTS-NOT-IN-REPO  `← Buried 2026-09-23 (paydown-2026-09-23 WP1)`
- **Buried because:** a convention call, not debt. The figures were already relabelled as one-shot observations with the method inline; a `tooling/` home for perf spikes is worth deciding only when a second spike wants one.
- **Source:** feature-review-quality (M12 WP1, MAJOR)
- **Type:** tech-debt (evidence provenance)
- **Summary:** All three measurements Verdicts (a)/(b) reason from were produced by scripts in the **session scratchpad**, which is not in the repo. The 27.9× write-amplification figure and the 0.022/0.051/0.123 ms announce table therefore have no reproducible provenance, while Phase 2's own observable required the measurement be *"reproducible by re-running the script the phase writes."*
- **Context:** The lost-update fact — the load-bearing one — **is** now pinned by the Rust test `interleaved_whole_file_writes_lose_the_earlier_writers_edit`, which is the right answer and supersedes its script. The two *performance* figures are the gap. **Mitigated at review time:** both are now labelled in `wbs.md` as one-shot observations with their METHOD stated inline, so the doc no longer cites evidence a reader cannot reach and the measurement can be redone in ~5 minutes. What remains open is whether a perf spike of this kind should have a durable home.
- **Suggested action:** Decide the general convention rather than just this instance: either (a) accept that probe-grade perf spikes are one-shot and method-documented (current state — arguably correct, since a benchmark nobody runs rots), or (b) give them a home under `tooling/` when the number is cited in a durable doc. ⚠️ Do NOT reflexively add a `tooling/` script for this WP alone — the conclusion depends on the round-trip COUNT (1 vs N), a design property, not on the timings.
- **Priority:** low (was MAJOR pre-mitigation; the doc no longer overclaims and the decisive fact is test-pinned)
- **Status:** pending

## SURFACE-2026-08-02-QUALITY-WP3-HEADING-SLUG-NO-COLLISION-SUFFIX  `← Buried 2026-09-23 (paydown-2026-09-23 WP1)`
- **Buried because:** parked by design. The behavior is deliberately unchanged and the revisit triggers are recorded at `classifyHref.ts` `headingSlug`, so the code carries its own reopening condition.
- **Source:** feature:review-quality (m11-wp3)
- **Target level:** feature
- **Type:** gap (minor correctness)
- **Summary:** `headingSlug` does not de-duplicate colliding ids. Two headings differing only in
  punctuation (`## Probe outcomes` / `## Probe outcomes!`) emit the same `id`, so an anchor link
  reaches only the first. GitHub appends `-1`, `-2`; the comment claiming it "mirrors GitHub's
  algorithm" overstates by one rule.
- **⚠️ Context — MEASURED 2026-08-19 (paydown WP6). The original context claim was REFUTED.** It read:
  *"The corpus most likely to collide is exactly this panel's target — long WBS/WIP files with
  repeated section names (`## Tasks`, `## Probe outcomes` per WP)."* Scanned every `.md` the viewer
  can open (`workflow-system/`, `docs/`, `CHANGELOG.md`, `README.md`) — **197 files**:
  - **1 file** has any colliding slugs: `workflow-system/state/archive/m12-wp3-autofire-and-announce.md`
  - **4 colliding slugs** there (`gate`, `hygiene`, `session-hygiene`,
    `what-was-deliberately-not-codified`) — ⚠️ **none is `tasks` or `context`**, the two the filing named
  - **3 `](#...)` occurrences in the whole corpus, and all 3 are prose *examples* of the syntax**
    inside WBS/probe text — not navigable links
  - **0 anchor links target a colliding slug**, so the defect has no reachable consumer today
- **⚠️ And the fix is not the small change the filing implies.** `headingSlug` is a pure function of
  one string; de-duplication needs **per-document counter state**. Its only production caller is
  `DocMarkdown.tsx`'s `HEADING_COMPONENTS`, which is **module-scope deliberately** — *"so the object
  identity is stable across renders and does not force the renderer to rebuild its component map on
  every keystroke-driven re-render."* A counter means reversing that documented decision or threading
  a `useMemo`'d per-doc map.
- **Resolved half:** the over-claiming comment was narrowed at paydown WP2, and WP6 appended the
  measurement to it. ⚠️ Note the finding itself proposed this as a legitimate close — *"the comment fix
  is not a cop-out"*.
- **Suggested action (remaining):** **Leave the behavior as-is.** Revisit only if one of these becomes
  true — and check, do not assume: (a) a doc gains a *real* in-doc anchor link that targets a colliding
  slug, (b) a heading collision appears on a common slug (`tasks` / `context` / `summary`) in a
  non-archived doc, or (c) `HEADING_COMPONENTS` stops being module-scope for an unrelated reason, making
  the counter nearly free. Re-run the corpus scan before re-scoring — this entry's numbers are true
  as-of 2026-08-19 (`[[backlog-finding-carries-an-implicit-as-of-date]]`).
- **Priority:** low (latent; no reachable consumer measured)
- **Status:** open — behavior deliberately unchanged, measured latent at paydown WP6 (2026-08-19)

## SURFACE-2026-08-01-QUALITY-WP3-ANALYTICS-HINT-EXCEEDS-SIBLING-BAND  `← Buried 2026-09-23 (paydown-2026-09-23 WP1)`
- **Buried because:** cosmetic, and its fix is a NEW element, not a trim. Each of the hint's four facts is load-bearing (the machine-wide scope clause especially).
- **Severity:** MINOR
- **Location:** `src/components/settings/SettingsPanel.tsx:529`
- **Finding:** The Analytics `SettingsGroup` hint is **270 chars** against sibling group hints of **107 / 84 / 42** (lines 367, 391, 545) — still ~2.5× the longest sibling after the verify-human compression from 322.
- **Why it matters:** Cosmetic/proportion only; the content is correct, each of its four facts is distinct, and the length was an explicit operator-delegated call. Worth recording because the WP itself banked *"measure the incumbent's siblings first"* as the reusable lesson, and this surface still sits outside the band that lesson describes.
- **Pickup shape:** Do **not** shorten by dropping a claim — all four are load-bearing (the machine-wide scope clause especially; removing it makes the copy misleading by omission, and its truthfulness is verified in `time_store::drain_loop`). The real fix, if ever wanted, is a **dedicated privacy line** as a distinct element so the group hint returns to one sentence. That is a small UI addition, not a copy edit, so it needs to clear `new-surface-must-earn-its-place` first. Revisit only if such an element appears for another reason.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-20-QUALITY-WP7-VALIDATE-ROOT-PER-CALL-COST  `← Buried 2026-09-23 (paydown-2026-09-23 WP1)`
- **Buried because:** an efficiency nit (M): memoizing the known roots behind config-store state buys nothing measurable at ≤100 projects.
- **Severity:** MINOR
- **Location:** `src-tauri/src/editor_fs/commands.rs:34-45` (`validate_frontend_root`)
- **Finding:** Reads + parses `projects.json` from disk AND canonicalizes every known root on *every* read/write/stat/delete/trash/create call — one `canonicalize` syscall per known root, N syscalls per op. Correct and acceptable at single-user scale, but scales with project count.
- **Why it matters:** A future watch/poll surface (or a tight save loop) calling these commands repeatedly would re-do the disk read + per-root canonicalize each time.
- **Suggested action:** Memoize the resolved known-roots behind the config-store's existing state rather than re-reading `projects.json` each call.
- **Priority:** low

## SURFACE-2026-07-14-QUALITY-WP6B2P4-WALLTIME-QUANTIZATION-BASIS  `← Buried 2026-09-23 (paydown-2026-09-23 WP1)`
- **Buried because:** awareness-only and likely won't-fix: minute-quantized endpoints are deliberate so the mini-timeline stays on the main timeline's grid. Recorded so nobody "fixes" it to `dur_ms`.
- **Severity:** MINOR (doc/awareness only)
- **File:** `src/components/workspace/dashboard/SidePanel.tsx` (L65 `wallTime = Math.max(0, session.end - session.start)`)
- **Finding:** `wallTime` uses the minute-quantized session endpoints, so the "active of Xh Ym wall" denominator + the mini-timeline seg span are on a MINUTE grid, while the numerator (`sumActive`) is true-`dur_ms`. For a sub-minute session this reads "0m active of 0m wall". This is FAITHFUL + internally consistent for POSITIONING (the mini-timeline positions legitimately live on the minute grid, matching the main timeline's `viewportPct`), NOT a defect.
- **Fix shape:** none needed. Recorded only so a future reader doesn't "fix" the mini-timeline to a `dur_ms` basis + break the wall-relative layout (the positions MUST stay on the minute grid to align with the main timeline). If the wall FIGURE (not the positions) ever needs sub-minute precision, sum `dur_ms` across the session's segs for the denominator label only — but leave the positioning math alone.
- **Priority:** low (awareness; likely a no-op / won't-fix).
- **Status:** pending.
