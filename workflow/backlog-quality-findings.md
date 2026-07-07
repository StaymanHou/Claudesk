# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

# mirror-fill-from-bottom — 2026-07-06

*(feature-review-quality on ship commit 99aca94; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: well-built, tightly-scoped fix at the shared seam; correctness verified against the vendored xterm source. One MINOR (count-drift typo) was fixed in-place; the two below are auto-backlogged. None warrant a refactor pass.)*

## SURFACE-2026-07-06-QUALITY-MIRRORTRIM-LOSSY-RECONSTRUCTION
- **Severity:** MINOR
- **File:** `src/components/workspace/mirrorTrim.ts` (~77-92, the `rows.match(ROW_RE)` + `rows.slice(0, end).join("")` rebuild)
- **Finding:** The block is reconstructed by re-joining matched `<div>…</div>` rows, which silently drops any inter-row text that isn't a row match. Safe today because `@xterm/addon-serialize`'s `_rowEnd` emits rows contiguously (nothing between them), but the reconstruction is lossier than the prefix/suffix splice implies. The module's "return input unchanged on structural surprise" contract mitigates changes it *detects*, not this silent one — if a future xterm interleaved row separators, surviving rows would be re-joined without them.
- **Fix shape:** documentation-hardening — add a one-line header-comment note that reconstruction assumes zero inter-row content. No behavior change needed today.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-06-QUALITY-MIRRORTRIM-FIXTURE-REALISM
- **Severity:** MINOR
- **File:** `src/components/workspace/mirrorTrim.ts` (~32, 36-37 comments) + `src/components/workspace/__tests__/mirrorTrim.test.ts` (fixtures)
- **Finding:** The fixtures + comments use the simple `<div><span>text</span></div>` row shape, but real styled CC output produces intra-row `</span><span style='…'>` transitions (from xterm's `_nextCell` style diffs). The non-greedy `ROW_RE` handles the styled shape correctly (spans close with `</span>`; the first `</div>` still wins), so this is not a correctness gap — but the test fixtures under-represent the actual serializer output, which is a future-reader trap.
- **Fix shape:** add one styled-multi-span row fixture to `mirrorTrim.test.ts` documenting the real case; optionally soften the "spans hold text only" comment to acknowledge multi-span rows.
- **Priority:** low.
- **Status:** pending.

# cc-permission-mode-dropdown — 2026-07-02

*(feature-review-quality on ship commit 1624e2e; Mode 2 orchestrated. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: well-built, advances the codebase; wire contract + migration are the standouts. None warrant a refactor pass.)*

## SURFACE-2026-07-02-QUALITY-CCMODE-DEFAULT-ARGV-NOOP-UNTESTED
- **Severity:** MINOR
- **File:** `src-tauri/src/cc_session/mod.rs` (~205, `build_cc_argv`)
- **Finding:** `Default` now emits an explicit `--permission-mode default` (vs. the old bare `["claude"]`); the "harmless no-op" claim in the doc comment is load-bearing but rests on an untested CC-CLI behavioral assumption. The argv unit test pins the mapping, not the behavioral equivalence.
- **Fix shape:** documentation-hardening — note that the equivalence is a verify-human/release check (live spawn IS verify-human-covered; it passed 2026-07-02). No code change strictly needed.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-02-QUALITY-CCMODE-SELECT-A11Y-NAME
- **Severity:** MINOR
- **File:** `src/components/picker/ProjectPicker.tsx` (207-222)
- **Finding:** the `<select>`'s accessible name comes only from implicit label-nesting (`<label><span>Permission mode</span><select>…</label>`), no `htmlFor`/`id` or `aria-label`. Works today; would silently lose its name if the markup is refactored.
- **Fix shape:** add an explicit `aria-label="Permission mode"` on the `<select>` (or a label testid + `htmlFor`).
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-02-QUALITY-CCMODE-BARE-DOC-COMMENTS
- **Severity:** MINOR
- **File:** `src-tauri/src/cc_session/mod.rs` (~55-70, `CcPermissionMode` variants)
- **Finding:** `Auto` / `DontAsk` doc comments are bare restatements ("CC's `auto` mode") vs. the semantic WHY the `Default`/`Plan`/`AcceptEdits`/`BypassPermissions` comments carry.
- **Fix shape:** enrich with the semantic distinction, or drop to match the enum's self-documenting naming.
- **Priority:** low.
- **Status:** pending.

# m5-wp5-pip-toggle-lifecycle-autosummon — 2026-06-27

*(feature-review-quality on ship commit f6e3929; Mode 3 autopilot auto-backlog. 0 CRITICAL / 2 MAJOR / 2 MINOR.)*

## SURFACE-2026-06-27-QUALITY-WP5-PIPMODE-STATE-DUP-PER-WORKSPACE
- **Severity:** MINOR
- **Finding:** `RightPanelHost.tsx:136-159` — the `pipMode` state + `pip_get_mode` fetch + `pip-mode` listener are duplicated per RightPanelHost instance (one per mounted workspace), so at N workspaces there are N redundant IPC fetches + N subscriptions for one app-global value. The inline comment acknowledges it's "fine per-RightPanelHost," but it's avoidable at the N>1 the milestone targets.
- **Fix shape:** lift `pipMode` to App-level state (fetched + subscribed once), passed down as a prop — mirroring how `tiles` is derived once in App. Low effort.
- **Priority:** low.
- **Status:** pending — DEFERRED at debt-paydown WP4 (operator, 2026-06-30), anchored to **M9**. The per-`RightPanelHost` `pip-mode` subscription is the project's INTENDED "all surfaces subscribe to the same backend broadcast" pattern (PiP mode is already an app-global View-menu radio, backend = single source of truth via `pip_set_mode`/`pip_get_mode` + the `pip-mode` event), not a missing-app-state bug — the only real cost is N-1 redundant `pip_get_mode` mount fetches. M9's time-tracking toggle follows the same backend-command + `*-mode`-broadcast + per-consumer-subscribe shape, so there is no shared app-settings store to build once-vs-twice. Fold the dedup into M9's settings work IF an app-settings hook materializes there; else it stays the documented pattern.

# qol-wp1-close-workspace — 2026-06-25

3 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship commit `c01a3f9`. Reviewer rated the feature well-built and idiomatic — the standout being the per-pane `cc_kill`-on-unmount that reaps both PTY panes generically and closes a latent WP7 lifecycle gap. All findings are low-risk: two over-narrated comments + one accepted test-boundary gap. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-25-QUALITY-WP1-APP-WIRING-UNTESTED
- **Files:** `src/components/workspace/Filmstrip.tsx`, `src/App.tsx` (requestClose / resolveClose / dirty-probe registry)
- **Priority:** low
- **Status:** pending
- **Type:** test-coverage gap
- **Finding:** Only the pure layer (reducer, `dirtyDocCount`, `closeWorkspaceSpec`) is unit-covered. No component test for the × (stopPropagation routing, keyboard Enter/Space) and no App-level test for the probe-registry / focus-repick wiring. Accepted boundary per the project's manual-host-UI convention + the live 9/9 operator verification — but the App wiring (`requestClose` reading the `workspaces` closure, `resolveClose` clearing `pendingClose`) is the part most likely to regress silently.
- **Pickup shape:** if/when the project adopts a component-test harness (RTL) or E2E (deferred per Phase-1 convention), add a Filmstrip-×-routing test + an App close-handler test. Low value until then; dismiss if the manual-verification posture holds.

# app-menu-bar — 2026-06-24

1 MAJOR + 2 MINOR from `feature-review-quality` on ship commit `f815154` (0 CRITICAL). Reviewer rated the feature well-built, appropriately-scoped, adds zero new behavior, integrates through existing chord predicates. The MAJOR is the one real durability concern: an unguarded cross-language id contract. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-24-QUALITY-APPMENU-LISTENER-NOT-EXTRACTED
- **Files:** `src/App.tsx:120-160` (the `menu` listener effect)
- **Priority:** low
- **Status:** pending
- **Type:** testability (consistent with standing posture)
- **Finding:** The `menu` listener body (id→action mapping, key re-dispatch, the 4 callback branches with the focused-path-ref lookup) lives inline in `App()` — the one piece of menu logic not extracted to a pure testable seam (unlike `menuBridge`). Extracting the action-dispatch (given an action + a small effects object) would let the callback-vs-key branching be unit-tested. LOW priority — consistent with the repo's "runtime-bound listeners are not unit-tested" posture (XtermPane, useWorkspaceStatus); the pure `menuBridge` mapping IS fully tested, which is the higher-value half.
- **Pickup shape:** optional extraction of a pure `dispatchMenuAction(action, effects)` + its unit test. Defer unless the listener grows.

# m3-wp2-hook-install — 2026-06-22

4 MINOR findings from `feature-review-quality` on ship commit `77d6a6e` (0 CRITICAL, 0 MAJOR). Reviewer rated it well-built and defensively-minded for a dangerous operation (mutating a shared user `settings.json`); standout test suite (real-config shape + byte-exact round-trip + never-wipe-on-parse-failure). No refactor warranted; all cosmetic/opportunistic. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-22-QUALITY-WP2-MINORS
- **Files:** `src-tauri/src/hook_install/commands.rs:42` + `mod.rs:78`; `src-tauri/resources/claudesk-hook.pl:66`; `src-tauri/src/hook_install/mod.rs:101`; `src-tauri/src/lib.rs:62`
- **Priority:** low (all)
- **Status:** PARTIAL — #2 (Perl write-side blocking) RESOLVED (the WP3 listener drains promptly) and #4 (stale `sublime_open` "removed at WP8" comment) RESOLVED 2026-06-30 (debt-paydown WP5): the `lib.rs` `sublime_open` registration comment now states the WP8-redefinition permanent-escape-hatch reality (in-app editor primary, Sublime Text stays one-click, `⌘⇧O` dropped) instead of "Transitional — removed at WP8." #1 (chmod/invocation mismatch — a behavior decision) + #3 (`NotAnObject` error-variant coarseness — an error-enum refactor) remain as genuine deferrables.
- **Findings:**
  1. **chmod/`/usr/bin/perl` mismatch** — the registered command runs `/usr/bin/perl <script>` (not `<script>` directly), so the `chmod 0o755` in `deploy_hook_script` + the script's shebang are never exercised; the `commands.rs`/`mod.rs:78` comment "CC invokes it directly" is inaccurate. Either drop the chmod (dead effort) or invoke the script directly. *(Mild — keeping chmod is harmless future-proofing if the command form ever changes; pick one and reconcile the comment.)* **— PARTIALLY ADDRESSED 2026-06-22 (commit 99a48d5):** the related "shell-form is fine, paths are app-controlled" assumption was the leading edge of a real word-split bug (spaced app-data path) — now fixed (paths shell-quoted). The chmod-vs-invocation cosmetic mismatch itself remains open (low pri).
  3. **`NotAnObject` error-variant coarseness** — three distinct shape failures (root not object, `hooks` not object, an event value not an array) all collapse to one variant (`mod.rs:101`); a malformed `hooks.<event>` array value yields the misleading "root is not a JSON object" message. Opaque-string-to-toast, low impact; a future debugger would be misdirected.
- **Pickup shape:** both remaining nits are quick opportunistic `/feature-refactor` fixes. Dismiss any via the WIP's `## Code-Quality Review` section.

# m2-wp2-editor-shell — 2026-06-19

2 MAJOR + 3 MINOR findings from `feature-review-quality` on ship commit `a84f3e9` (0 CRITICAL). Feature rated "advances the codebase rather than accruing debt." Auto-backlogged per drive_mode=autopilot (MAJOR → Case B, MINOR → low). The two MAJORs are the load-bearing ones (backend root-trust seam + a doc/behavior security-invariant mismatch), both flagged as Phase-2-hardening candidates, neither refactor-blocking.

## SURFACE-2026-06-19-QUALITY-WP2-RESOLVE-WITHIN-LEAF-SYMLINK
- **File:** `src-tauri/src/editor_fs/mod.rs:45-90` (`resolve_within`)
- **Finding:** Canonicalizes only the target's *parent* and re-attaches the leaf un-canonicalized; a symlink whose *leaf* points outside the workspace root is NOT rejected (read/write follow it), yet the module doc (lines 17-22, 50-52) claims "a symlink inside root pointing outside is also rejected." Doc overclaims an invariant the code doesn't fully enforce.
- **Why it matters:** A future reader trusts "invariant not convention" and won't re-audit. Low exploitability (single-user local tool, user picks in-project files) but the doc/behavior mismatch is the debt.
- **Suggested action:** Canonicalize the resolved target when it exists and re-check `starts_with(root_canon)`; OR downgrade the doc claim to match. Pairs with the Phase-2 backend-hardening item below.
- **Priority:** medium
- **Status:** PARTIAL (D2, debt-paydown WP5, operator decision 2026-06-30) — DOC downgraded now, HARDENING deferred. The `editor_fs` module header + `resolve_within` doc were narrowed to state the actual guarantee: a non-leaf (directory-component) symlink escaping root IS rejected (parent canonicalize), but a LEAF symlink is NOT followed-and-validated; the over-claim is gone. The actual fix (canonicalize the full target when it exists) stays **Deferred** to a future hardening pass (anchored here), NOT done this sweep.

## SURFACE-2026-06-19-QUALITY-WP2-BACKEND-TRUSTS-FRONTEND-ROOT
- **File:** `src-tauri/src/editor_fs/commands.rs:18-26` (`read_file`/`write_file`)
- **Finding:** Both commands take `root: String` straight from the frontend with no app-side derivation, unlike `config_store`'s commands which resolve `app_data_dir()` server-side. The "confined to the open project" guarantee rests entirely on the renderer passing a correct `projectPath` — the trust boundary for the root guard lives in the webview, not the backend.
- **Why it matters:** Phase 2 (multi-workspace) multiplies the IPC callers and surface; this is the seam to tighten before more callers depend on it. Acceptable for the single-user PoC today.
- **Suggested action:** Consider having the backend validate `root` against the known project list (config_store) before honoring it, so a malformed/hostile root can't widen the guard. Pairs with the leaf-symlink item above (same module, same Phase-2 hardening pass).
- **Priority:** medium
- **Status:** PARTIAL (D2, debt-paydown WP5, operator decision 2026-06-30) — DOC stated now, HARDENING deferred. The `editor_fs/commands.rs` module doc now explicitly says `root` is frontend-supplied/-trusted (not re-validated against config_store) — acceptable for the single-user local editor where the frontend shares the trust boundary; the guard's job is to confine the *file path* to `root`, not authenticate `root`. The actual validate-`root`-against-config_store hardening stays **Deferred** to a future pass (anchored here, pairs with the leaf-symlink item above).

# file-op-error-surface (Deferred — net-new UX) — 2026-06-30

## SURFACE-2026-06-30-FILE-OP-ERROR-SURFACE
- **Severity:** MINOR (deferred — net-new UX, not debt)
- **Finding:** Right-panel file operations fail silently: a failed `delete_file` (WP5), a failed folder `trash_path` (WP5b), and a create that collides with a gitignored file like `.env` (WP5, silent overwrite) are all swallowed to `console.error` with no user-visible surface. RightPanelHost has NO toast/inline-error component — the existing code comments already say "a future toast could show it" / "would be new UX — intentionally [deferred]".
- **Why deferred (operator ruling, debt-paydown sweep #2, 2026-06-30):** building the error surface is net-new UX, not a debt sweep — it needs a toast/inline-error component in RightPanelHost that does not exist. Honor the recorded "intentionally deferred" intent. The three original findings (WP5-DELETE-FAILURE-NOT-SURFACED, WP5B-TRASH-FAILURE-NOT-SURFACED, WP5-CREATE-COLLISION-GITIGNORE) collapse into this one anchor — one error-surface feature closes all three.
- **Anchor:** a future error-surface feature (whenever RightPanelHost gains a toast/inline-error affordance).
- **Status:** DEFERRED (anchored — net-new UX)

# m9-wp2-absorbed-hook-write-gated-sqlite-writer — 2026-07-07

*(feature-review-quality on ship commit dc3b89e; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: well-built feature landing a tricky change — teeing a single-consumer stream into two independent drains while holding the M3 status path byte-for-byte constant — with invariants defended by construction + test-pinned. All findings MINOR polish; nothing warrants a refactor pass.)*

## SURFACE-2026-07-07-QUALITY-PRIVACY-TEST-COINCIDENTAL-SUBSTRING
- **Severity:** MINOR
- **File:** `src-tauri/tests/hook_pl_output.rs` (~124, the `!s.contains("SECRET")` privacy leak assertion)
- **Finding:** The privacy leak assertion checks `!s.contains("SECRET")` against a hardcoded literal, while the injected prompt is `"SUPER SECRET PROMPT…"`. The test only catches a leak because the operator happened to embed the substring `SECRET` in the prompt — it does not assert against the actual `secret` variable. A future author who changes the prompt string could silently weaken this to a no-op guard.
- **Fix shape:** compare against the real `secret` value (or a distinctive sentinel derived from it) so the privacy check is self-consistent regardless of the prompt string.
- **Why it matters:** the privacy invariant is the feature's most important contract; its end-to-end test should not depend on a coincidental substring.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-07-QUALITY-TS-SILENT-EPOCH-FALLBACK
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/mod.rs` (~123, `ts` falls back to `0` when `HookEvent::timestamp` is absent)
- **Finding:** `ts` defaults to `0` on an absent `HookEvent::timestamp`. Unreachable today (the production Perl hook always stamps `timestamp`), but a `ts=0` row sorts to the epoch and could corrupt WP3's time-ordered reclassification if any non-hook source (WP2.5 native signals) ever forgets to stamp. The `source`-discriminator design explicitly anticipates a second writer.
- **Fix shape:** a debug-log or a `None`-drop on absent timestamp — cheaper guard than a silent 0. Consider closing during WP2.5 (native signal source) when the second writer lands.
- **Why it matters:** a load-bearing ordering key silently defaulting to a sentinel is a latent data-quality trap for the downstream consumer this feature exists to feed.
- **Priority:** low.
- **Status:** pending — **WP2.5 update (2026-07-07):** the second writer (native signals) landed and uses `now_ms()` (a real `SystemTime` epoch-ms), so it NEVER hits this fallback — the "if WP2.5 forgets to stamp" risk this finding anticipated did NOT materialize. But the finding stands as-is: it's about the **CC-hook** `event_to_row` path (`ts` from `HookEvent::timestamp`), which WP2.5 did not touch. Still low-priority pending for a future guard.

## SURFACE-2026-07-07-QUALITY-SCHEMA-COLUMN-VS-META-ASYMMETRY
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/mod.rs` (~62, SCHEMA_SQL / the events table shape)
- **Finding:** `tool_name` and `agent_type` are first-class columns, but `source` (SessionStart) and `prompt_length_chars` (UserPromptSubmit) live inside the `meta` JSON blob. Faithfully mirrors claude-time (defensible), but WP3 must query two shapes (columns for some fields, JSON extraction for others).
- **Fix shape:** a one-line note in the schema doc-comment on *why* `tool_name`/`agent_type` earned columns while the others stayed in `meta` (query-frequency? claude-time parity?). Documentation nit; the shape is intentional.
- **Why it matters:** reduces WP3 onboarding cost.
- **Priority:** low.
- **Status:** pending.

# m9-wp2.5-claudesk-native-signal-source — 2026-07-07

*(feature-review-quality, uncommitted working-tree baseline; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: well-built, disciplined, no debt; privacy-by-closed-enum is the standout. One MINOR — stale Sublime "transitional" doc-comment — was FIXED INLINE at review time. The two below are auto-backlogged; both fold into one small readability pass on `time_set_active_context`. None warrant a refactor now.)*

## SURFACE-2026-07-07-QUALITY-ACTIVECTX-TRIPLE-LOCK
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/commands.rs` (~197-204, `time_set_active_context`)
- **Finding:** The command locks the `SharedActiveContext` mutex three times (read-for-compare → `set_active_context` re-lock-and-write → re-lock-and-clone for the `ActiveSurface` emit). No TOCTOU/correctness risk — it's the sole writer and all `#[tauri::command]` fns run on the main thread (reviewer confirmed) — but the three-acquisition dance reads as if it were concurrency-sensitive.
- **Fix shape:** collapse to a single lock scope returning `(surface_changed, snapshot)`. Readability polish only.
- **Why it matters:** the signal path is re-touched in WP3/WP5; clearer code lowers that cost. Not a bug.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-07-QUALITY-ACTIVECTX-POISON-DISPOSITION
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/commands.rs` (~197, the surface-change compare)
- **Finding:** The surface-change check swallows a poisoned lock as `unwrap_or(false)` (silently skip the `ActiveSurface` emit), while the immediately-following `set_active_context` surfaces the same poison as `Err`. Two dispositions for one lock in one function — both defensible for telemetry, but the asymmetry reads as an oversight.
- **Fix shape:** a one-line comment on the `unwrap_or(false)` ("poison here just skips the marker; the write below surfaces it"), OR fold into the single-lock refactor above (which removes the second acquisition entirely).
- **Why it matters:** trivial clarity; behavior is acceptable as-is. Folds with the triple-lock cleanup.
- **Priority:** low.
- **Status:** pending.

# m9-wp3-reclassifier-redesign — 2026-07-07

*(feature-review-quality on ship commit ebe9f31; Mode 3 autopilot. 0 CRITICAL / 2 MAJOR / 2 MINOR. Reviewer: well-built, carefully-scoped phase — pure-transform architecture + SSOT notification reuse + 1:1 scenario suite. The 2 MAJORs are untested behavioral edges at the classification boundary; WP4 should close them before the query layer trusts the tail of the stream. All auto-backlogged; none blocking.)*

## SURFACE-2026-07-07-QUALITY-WP3-TRAILING-OPEN-AWAIT-FALLS-TO-AWAY
- **Severity:** MAJOR
- **File:** `src-tauri/src/reclassify/mod.rs` (~710, `awaiting_input_spans` — the unclosed-await drop at the session's last event)
- **Finding:** A still-open AwaitingInput span at the data tail is dropped ("conservative"), but the downstream effect is NOT conservative in the intended direction: an operator actively servicing a still-open prompt gets no working-credit in `classify_gap` branch 2 → falls through to branch 3 → **Away** instead of the intended capped-working. This is the most-recent slice any live dashboard renders (B2b/B4 — "doing the thing CC is blocked on right now"), so it directly undercuts the "measure, don't infer" headline. Unpinned by tests (no trailing-open-await fixture).
- **Fix shape:** bound an open await at the window end (or the last-known ts) instead of dropping it, and add a trailing-open-await test asserting capped-working (not Away). Natural WP4 tightening (WP4 owns the window bounds).
- **Priority:** medium (correctness edge on the freshest data slice; cheap fix; consume-before-trust for WP4/WP6).
- **Status:** pending.

## SURFACE-2026-07-07-QUALITY-WP3-SURFACE-TIE-BREAK-ORDER-DEPENDENT
- **Severity:** MAJOR
- **File:** `src-tauri/src/reclassify/mod.rs` (~879, `surface_is_editor_at`)
- **Finding:** The latest-surface scan's equal-ts tie-break favors the first-seen slice row (`Some((prev_ts,_)) if *prev_ts >= e.ts => {}` refuses to update on `==`), so two same-epoch-ms surface rows resolve by input order — which `group_by_session` explicitly documents is NOT guaranteed. A same-ms surface flip decides Typing-vs-Reviewing for a whole gap (an unstated input-order dependence, the confabulation-channel class the `Unvisited`-ordering convention guards against).
- **Fix shape:** last-wins on `>=` (or sort native rows by ts first, like the other helpers) + a same-ms tie-break test. One-line fix.
- **Priority:** medium (deterministic-classification correctness; trivial fix; untested at the tie).
- **Status:** pending.

## SURFACE-2026-07-07-QUALITY-WP3-SURFACE-HELPER-NOT-IN-GAPCONTEXT
- **Severity:** MINOR
- **File:** `src-tauri/src/reclassify/mod.rs` (~879, `surface_is_editor_at` vs `GapContext`)
- **Finding:** `surface_is_editor_at` is the one hot-path helper not folded into `GapContext`; `human_segments_for_window` calls it once per gap → O(gaps × events) while every other per-gap input is precomputed once in `GapContext::build`. Harmless for a day-window; the place a WP6 month-view would first feel a scan cost, and inconsistent with the deliberate precompute design.
- **Fix shape:** hoist surface resolution into `GapContext::build` (e.g. a sorted surface-change vector + a point lookup).
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-07-QUALITY-WP3-WORKING-CREDIT-PREDICATE-INLINE-RESCAN
- **Severity:** MINOR
- **File:** `src-tauri/src/reclassify/mod.rs` (~851, `classify_gap` branch 2)
- **Finding:** The working-credit predicate combines `awaiting_at(gap_start)` with an inline `awaiting.iter().any(|&(s,_)| s >= gap_start && s < gap_end)` re-scan; the two overlap and the second re-walks the awaiting vector inline rather than via a named `GapContext` helper like `launch_precedes`/`awaiting_at`. Readability nit on a load-bearing predicate.
- **Fix shape:** extract a `GapContext::awaiting_in_gap(start, end)` method matching the surrounding style.
- **Priority:** low.
- **Status:** pending.
