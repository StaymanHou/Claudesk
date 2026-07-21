# Feature: M9 WP3 — Reclassifier REDESIGN (metric definitions, not a port)

**Workflow:** feature
**State:** COMPLETED 2026-07-07 (shipped `ebe9f31`, finalized)
**Created:** 2026-07-07
**Entry:** spec (complex feature)
**Milestone:** M9 (time-analytics panel — absorb claude-time + MEASURE, don't infer)
**Drive mode:** autopilot

## Problem Statement

Build the pure-logic layer that turns the M9 event stream — CC-hook rows (`source='cc-hook'`, WP2) + Claudesk-native-signal rows (`source='claudesk-native'`, WP2.5), both in one `events` table — into typed per-metric structs the WP4 query layer and WP6 dashboard consume.

This is **NOT a port** of claude-time's `reclassify.py`. The operator has stated the current classifier is *not exactly what he wants*. `reclassify.py` (368 lines) documents *how it currently measures*; it is the **starting reference**, not the oracle. The actual work of this WP is the **delta** between "how claude-time guesses" and "what the operator wants, now that Claudesk can MEASURE what claude-time could only infer."

The central new question (`SURFACE-2026-07-06-M9-NATIVE-SIGNALS-BEAT-GAP-INFERENCE`): claude-time inferred every human state (reading/thinking/away) from CC-hook *gaps* + a guessed typing rate + magic thresholds — it had no other signal. Claudesk, being the terminal + the window, can **observe** window focus/blur, real PTY keystrokes, and exact per-workspace attribution. So per human-state we must decide: **MEASURED from native signals, or INFERRED from hook gaps** (as a fallback when Claudesk isn't the active window / the signal is ambiguous). **Operator hard constraint: native signals are better but NOT perfect — no naive rules (`blur → away` is WRONG). Play out the concrete scenarios.**

## User Stories

- As the operator, I want the retrospective time analytics to reflect *what actually happened* (measured present/away, real typing spans, real per-project attribution) rather than statistical guesses, so the dashboard is trustworthy enough to answer "where did my week go" across 20+ projects.
- As the operator, I want AI-activity and human-activity to read as two distinct color families (with AI sub-split reasoning-vs-doing where observable), so a glance at the timeline separates "the machine was working" from "I was working."
- As a future maintainer, I want the reclassifier to be a pure Rust module (rows in, typed metric structs out, no DB I/O) with a fresh test suite pinning the *agreed* definitions, so WP4/WP6 build on a stable, documented contract.

## Acceptance Criteria

Definitions locked (see `## Metric Definitions`). The build is done when:

- [ ] A pure Rust reclassifier module (no DB I/O — a `&[TimeRow]`-style slice in, typed metric structs out) implements the locked definitions:
  - [ ] AI kinds: `ai-doing` (Pre→Post by `tool_use_id`), `subagent` (Start→Stop FIFO by `agent_type`), `ai-reasoning` (running AI time not covered by a tool/subagent interval).
  - [ ] Human kinds via the resolved gap machine: `typing` (KeystrokeActivity clusters + editor-active), `reviewing` (focused-idle under away threshold), `away` (A5 focused-quiet / B5 bare-blur / expired-cap).
  - [ ] The **launch/AwaitingInput → capped-working** rule: initial away→working flip on a preceding `ExternalLaunch` (native) OR `PostToolUse`/`Bash` (cc-hook) OR CC-in-AwaitingInput; **10-min reset-on-activity cap**; expiry → away.
  - [ ] `active` is NOT a segment kind; **engaged-session-time** survives as a derived summary metric (burst wall-clock).
  - [ ] tool-time + subagent-time reuse claude-time's interval mechanics unchanged; per-project attribution = git-root + `project_names` param.
- [ ] Color families tagged in the metric output (AI vs human) so WP6 can palette them.
- [ ] A **fresh** test suite pins the NEW definitions — each locked rule + each resolved scenario (A1–A5, B1/B2a/B2b/B3/B4/B5) has a covering assertion; reference `test_reclassify.py` assertions adapted only where behavior is genuinely unchanged (tool/subagent/attribution).
- [ ] The WP1→WP3 `kind`-enum delta is documented and fed forward to WP4/WP6.
- [ ] `notification_type`-persistence follow-up resolved (persist it, or accept the documented looser fallback) — decided at plan.
- [ ] `cargo test` + `cargo clippy -- -D warnings` + `cargo fmt` clean (pure-logic module → static verify-self is sufficient per the backend-lifecycle verify posture).

## Out of Scope

- **DB I/O** — the reclassifier is pure (a `Connection`-free function over a row slice). Reading rows from SQLite is WP4.
- **The segment-model / viz transform** (`viz_data.py`'s job — event→segment tiling, day/week/custom windows, per-project rollups) — that is WP4. WP3 produces the *metrics*; WP4 shapes them into the dashboard contract. (Boundary note below.)
- **The dashboard TSX** (WP6) and the **tracking toggle** (WP5).
- **Capturing in-app CodeMirror editor keystrokes** — deliberately not captured in WP2.5 (editor interaction ≈ reading); WP3 uses "editor-active + no PTY keystrokes" as the reading signal, not editor keystroke telemetry.
- **Storing the `PostToolUse` command shape** (only `tool_use_id` is stored) — if WP3 needs to tell `open <screenshot>` from other Bash calls, that is a WP2/WP3 schema follow-up, flagged not built here.

## Technical Constraints

- **Reads the as-built `events` table** (`time_store/mod.rs`): `events(ts, session_id, cwd, event, tool_name, agent_type, source, meta)`, `meta` a JSON blob. Two sources: `cc-hook` (10 event kinds) + `claudesk-native` (5 signal kinds — `WindowFocus`/`WindowBlur`/`KeystrokeActivity`/`ActiveSurface`/`ExternalLaunch`). Native `meta` keys: `workspace_id`, `surface`, `preceded_by_launch`, `byte_count`, `tool`. CC-hook `meta` keys: `prompt_length_chars`, `tool_use_id`, `source`.
- **`preceded_by_launch` is currently always `false`** on `WindowBlur` rows (WP2.5 capture-only). WP3 computes launch-before-blur itself from the two row streams by `ts` (native `ExternalLaunch` OR cc-hook `PostToolUse`/`Bash`), not by trusting the bool.
- **Privacy invariant** (inherited): rows carry counts / lengths / enums / opaque handles / cwd — never prompt text, never keystroke bytes, never launched paths. The reclassifier must not require anything the schema doesn't already carry.
- **Reference (not oracle):** `_ref/claude-customization/tools/claude-time/reclassify.py` (368 lines) + `test/test_reclassify.py` (29 assertions). Documents current mechanics; not the target behavior.
- **WP1-frozen segment contract** (`wp1-time-analytics-probe-outcome.md` §a): `kind ∈ {active, reading, thinking, away, subagent}`. WP3's definitions **supersede this where they differ** — feed the delta forward to WP4/WP6.
- **IPC-casing convention** applies at WP4's DTO boundary, not here (WP3 is internal Rust). But the metric struct field names should map cleanly to snake_case.

## Metric Definitions (BLOCKING — operator discussion required before any code)

*(This section is filled through the operator conversation. Each metric records: **(a)** the operator's definition, **(b)** the measurement rule fusing hook + native signals, **(c)** measured-vs-inferred verdict, **(d)** delta vs claude-time.)*

### Reference: how claude-time currently does it (the baseline to diff against)

- **reading / thinking / away** — the *only* human states. Computed per `(Stop → next UserPromptSubmit)` gap within a session: `effective_gap = wall_clock − typing_debit − cross_session_typing`, where `typing_debit = prompt_len_chars / chars_per_sec (6.0) × 1000ms` and cross_session subtracts other sessions' typing that overlapped the gap. Then bucketed: `≤120s → reading`, `≤300s → thinking`, `>300s → away`. **All three are pure inference from hook gaps + a guessed 6 char/sec rate + two magic thresholds.**
- **active** — sum of `(last UserPromptSubmit → next Stop)` "engaged with agent" bursts (narrow definition: consecutive UPSes overwrite, last-before-Stop anchors; earlier ones logged as `interrupts`).
- **tool-time** — `PreToolUse → matching PostToolUse/PostToolUseFailure` by `tool_use_id`, summed per `tool_name`.
- **subagent-time** — `SubagentStart → next SubagentStop` in same session, FIFO by `agent_type`.
- **per-project attribution** — git-root of `cwd` + a `project_names` alias map.

### The scenario space + LOCKED resolutions (operator, 2026-07-07)

The full truth table of observable-vs-truth, and the resolved rule for each. The key structural realization that collapsed the tangle: **focus/blur is consulted ONLY during human-gap intervals (when the AI is idle/blocked). While the AI is running (hook events flowing), the interval is AI-activity family regardless of window focus — there is no separate human "monitoring" band.**

**A. Window FOCUSED**
- **A1** focused + PTY keystrokes → *working here (human active/typing)* — measured. ✅
- **A2** focused + editor surface active, no PTY keys → *reading/editing code here* — measured (editor-active + no PTY keys). ✅
- **A3** focused + CC running → *AI-activity family* (focus irrelevant while AI runs). ✅
- **A4/A6** focused + CC idle + quiet, SHORT → *reading/thinking* — **stays fused/inferred** (no signal separates eyes-reading from mind-wandering). ✅ operator-accepted as partly inferred.
- **A5 focused-but-AWAY** (window left front, operator gone): focused + no keys + CC idle + quiet **> away threshold** → **AWAY**. Focus is NOT proof of presence. ✅ LOCKED.

**B. Window BLURRED**
- **B1 blurred-but-working (Claudesk launch):** blur preceded by a native `ExternalLaunch` (clicked Sublime/Merge/Finder) → **working, bounded by the cap** (below). ✅ LOCKED.
- **B2 blurred + CC opened something — SPLIT by CC hook state (operator insight):**
  - **B2a** CC ran `open` then went **idle** (`Stop`) → *reading* what CC opened (passive). → human reading.
  - **B2b** CC is in **AwaitingInput** (Notification→permission/elicitation) → operator is *doing the thing CC is blocked on* (e.g. logging into a Playwright browser, an OAuth step) → **working (active), bounded by the cap.**
  - **Resolving signal is CC's hook state, NOT the command shape** (schema can't inspect `open`'s args; it CAN read idle-vs-AwaitingInput). ✅ LOCKED.
- **B3** blurred, CC still emitting events → **AI-activity family** (no separate "monitoring" state — if the AI is working, it's AI time). ✅ LOCKED.
- **B4 blurred, working in an unrelated app:** "away from this project = AWAY" (definitional, ✅). BUT "unrelated app" is **UNDETECTABLE** (Claudesk has no visibility into other apps; "researching this project in a browser" ≢ "browsing ESPN"). So we do NOT build a rule on app-relatedness. It collapses into the same CC-state + cap rule: left while CC **AwaitingInput** → working (capped); left while CC **idle** → away. ✅ LOCKED.
- **B5 left-the-machine:** blur + silent everywhere + no preceding launch + CC idle → **AWAY**. ✅ LOCKED.
- **B6 blurred + bg-workspace PTY keystrokes:** **DROPPED** — operator: this doesn't actually happen. ✅ CUT.

**THE CAP (the single most impactful threshold — operator-locked):**
A launch / AwaitingInput-blur credits "working" only for a **bounded window**. Popped Sublime → then pulled into a 40-min meeting: the launch must NOT license 40 min of "active."
- **Rule: cap-that-resets-on-activity.** A launch or an AwaitingInput-blur flips the *initial* interpretation of the gap from away→working. Ongoing activity (any keystroke or hook event) **resets** the cap. **10 minutes of total silence** ends the working credit → **AWAY**. ✅ LOCKED (`cap = 10 min`; candidate for a setting — see config Q).
- Same machinery as A5: "as long as *something* is happening you're working; N minutes of total silence = you left." The launch/AwaitingInput just changes the starting assumption.

### The resolved human-classification machine

For each interval where the **AI is idle/blocked** (the human gap):
1. keystrokes present, OR editor-active + focused → **working here** (active/typing/reading-code).
2. blur preceded by `ExternalLaunch` **OR** CC in AwaitingInput → **working**, bounded by the 10-min reset-on-activity cap; after cap of total silence → **away**.
3. focused but dead-quiet > away threshold → **away** (A5).
4. bare blur + quiet + CC idle + no launch → **away** (B5).
5. short focused-idle gap (under thresholds) → **reading/thinking** (fused/inferred; A4/A6).

While the **AI is running** (events flowing) → AI-activity family (ai-reasoning / ai-doing / subagent); focus/blur ignored.

### LOCKED metric definitions (operator, 2026-07-07)

**The `kind` enum — REDESIGNED (supersedes WP1's `{active, reading, thinking, away, subagent}`):**

| new `kind` | family | measured/inferred | definition |
|---|---|---|---|
| `ai-doing` | AI (hue A, shade 1) | **measured** | `PreToolUse → matching PostToolUse/PostToolUseFailure` by `tool_use_id` (claude-time's tool-interval mechanics, reused). |
| `subagent` | AI (hue A, shade 2) | **measured** | `SubagentStart → next SubagentStop`, same session, FIFO by `agent_type` (kept a DISTINCT kind — visibly different mode; label = `agent_type`). |
| `ai-reasoning` | AI (hue A, shade 3) | **inferred** | AI is running (between `UserPromptSubmit`/`PostToolUse` and the next tool-call or `Stop`) but NO tool interval covers the moment → the model is thinking. The residual AI time not covered by `ai-doing`/`subagent`. |
| `reviewing` | human (hue B) | **inferred** | focused + CC idle + quiet, UNDER the away threshold. **Collapses claude-time's reading+thinking** into one honest bucket (nothing observable separates them; two magic thresholds → zero). |
| `typing` | human (hue B) | **measured** | `KeystrokeActivity` clusters (real row timestamps) — actual PTY input spans. Also covers editor-active human work. |
| `away` | human (hue B, subtractive) | **measured-ish (threshold over observed focus+keystroke gaps)** | per the resolved machine: A5 (focused dead-quiet > threshold), B5 (bare blur silent), or a launch/AwaitingInput-blur whose 10-min reset-on-activity cap expired. |

- **`active` is DROPPED as a segment kind.** It conflated AI-working + human-watching. The interval it covered is now tiled by AI kinds (while AI runs) + human kinds (in the gaps). **"Engaged session time" survives as a DERIVED METRIC** (sum of `last-UPS → next-Stop` burst wall-clock, claude-time's `session_active_ms`/`active_bursts` mechanics) for the summary tiles — a number, not a timeline color.
- **Color families (locked):** AI family = `{ai-doing, subagent, ai-reasoning}` (one hue, 3 shades — 2 measured + 1 inferred). Human family = `{typing, reviewing, away}` (a second hue; `away` rendered subtractively as today). This is the AI-vs-human split from `SURFACE-2026-07-06-M9-COLOR-FAMILIES-AI-VS-HUMAN`, now grounded in which kinds are AI-execution vs human. WP6 assigns exact OKLCH values (the WP1 darker-fill palette + `textOn` ink rule carry through).

**tool-time** — reuse claude-time's `tool_durations_ms` / `tool_intervals` (Pre/Post by `tool_use_id`). Feeds `ai-doing` segments + a per-`tool_name` metric. **No change** from reference. ✅
**subagent-time** — reuse `subagent_intervals` / `subagent_durations_ms` (FIFO by `agent_type`). Feeds `subagent` segments + metric. **No change.** ✅
**per-project attribution** — git-root of `cwd` + `project_names` alias. **Mechanics unchanged**; the WP2.5 native rows already carry attributed `cwd`, so attribution is now MEASURED (real workspace registry) rather than a git-root guess for native rows. The grouping code is the single source of truth here.
**typing (measured, replaces chars_per_sec):** primary = `KeystrokeActivity` row-timestamp clusters. `chars_per_sec` (6.0) debit kept ONLY as a **hardcoded fallback** for rows with no native coverage (pre-capture sessions / native-signals-off). ✅

### Config: ALL hardcoded (operator, 2026-07-07)

Design-prior `explicit-selectable-mode-over-inferred-mode` (risk-surface-vs-value) — **[PRIOR fired, operator confirmed]**: no user-settings for any threshold. Hardcoded constants (tune-by-recompile if ever needed): `silence_cap = 10min`, `away_threshold` (TBD default at plan — lean ~10min to match), `chars_per_sec = 6.0` (fallback only), `blur_launch_correlation_window` (TBD — lean ~short, e.g. 30s). **`project_names`** is editable config *data* (not a threshold) — but the mechanism (where the alias map lives) is a WP4/WP5 concern (grouping happens in the query layer / is toggle-adjacent), NOT a WP3 setting. WP3 accepts it as a parameter.

### Segment-contract DELTA vs WP1-frozen (feed forward to WP4/WP6) — CONFIRMED at Phase 4

The `kind` enum changed: `{active, reading, thinking, away, subagent}` → **`{ai-doing, subagent, ai-reasoning, typing, reviewing, away}`**. `active`/`reading`/`thinking` removed; `ai-doing`/`ai-reasoning`/`typing`/`reviewing` added; `subagent`/`away` retained. `subagent` segments still carry a `label` (`agent_type`). This is a real revision of the WP1 contract — WP4's segment tiling + WP6's palette/legend must adopt the new enum.

**As-built API the WP4 query layer consumes (the concrete hand-off — `src-tauri/src/reclassify/`):**
- **Input:** `reclassify::EventRow { ts, session_id, cwd, event, tool_name, agent_type, source, meta }` — WP4 maps SQLite rows → this. `meta_str`/`meta_i64` extract JSON meta fields.
- **`Kind`** enum (6 variants) + **`Kind::as_str()`** stable tags (`"ai-doing"`/`"subagent"`/`"ai-reasoning"`/`"typing"`/`"reviewing"`/`"away"`) + **`Kind::family() -> Family::{Ai,Human}`** (the AI-vs-human color-family split for WP6's palette).
- **`Segment { kind, start_ms, end_ms, label: Option<String> }`** — `label` present only on `Subagent`.
- **Timeline tiling = two halves per window:** `ai_segments_for_window(events, start, end)` tiles each AI-busy window (ai-doing/subagent/ai-reasoning); `human_segments_for_window(events, start, end)` tiles the AI-idle gaps (typing/reviewing/away). WP4 composes them: AI-busy spans from `ai_busy_intervals` get the AI tiler; the complement gets the human tiler.
- **Derived metrics (not segment kinds):** `tool_durations_ms` / `subagent_durations_ms` (per-name rollups), `session_active_ms` (engaged-time — replaces the dropped `active` kind as a summary number).
- **Hardcoded knobs:** `reclassify::constants::{SILENCE_CAP_MS, AWAY_THRESHOLD_MS, BLUR_LAUNCH_CORRELATION_MS, CHARS_PER_SEC_FALLBACK}`.
- **WP4 to-remove:** the module-level `#![allow(dead_code)]` (drop it once WP4 imports the module — it exists only for the dormant-until-WP4 window). **WP4 to-decide:** the `chars_per_sec` drop-vs-wire question (SURFACE — likely drop; the human classifier is presence/threshold-based).

Logged + confirmed for the WP4/WP6 hand-off (P4.3).

## Open Questions

- [x] **BLOCKING:** the full metric-definitions discussion — **RESOLVED** (see `## Metric Definitions` above; all human states, AI kinds, color families, `active`-drop, and config all locked with the operator 2026-07-07).
- [x] AI-vs-human color families + reasoning-vs-doing sub-split — **RESOLVED**: AI `{ai-doing, subagent, ai-reasoning}` / human `{typing, reviewing, away}`.
- [x] Config surface — **RESOLVED**: all thresholds HARDCODED (`project_names` is config data, mechanism → WP4/WP5).
- [x] Segment-model shape delta vs WP1 contract — **RESOLVED + captured** (new 6-kind enum; fed forward to WP4/WP6).

### One schema follow-up surfaced during spec (needs a plan-time call)

- [ ] **`notification_type` is NOT persisted to time-store rows.** The B2/B4 rule keys on "CC in AwaitingInput," which is derived from a `Notification` event's `notification_type` (`permission_prompt`/`elicitation_dialog` = AwaitingInput; `idle_prompt` etc. = informational). `HookEvent` carries `notification_type`, but `time_store::event_to_row` writes only `prompt_length_chars`/`tool_use_id`/`source` to `meta` — so the reclassifier currently can't tell an input-needed Notification from an informational one. **Cheap fix (fold into WP3's plan, or a tiny WP2 amendment): persist `notification_type` into `meta` for `Notification` rows** (one line in `event_to_row` + a parallel test; same privacy class as the other meta keys — it's an enum tag, not content). Without it, the B2b/B4 "AwaitingInput → working" branch degrades to "any blur-after-CC-activity → capped-working," which is a safe-but-looser fallback. Anticipated by WP2.5 doc §4 ("PostToolUse command shape not stored") — same follow-up class. Logged to `## Discoveries`.

## Discoveries

<!-- Format: [SURFACED-<date>] <target node> — <summary>  (also log to workflow/backlog.md) -->
- [SURFACED-2026-07-07] WP3 plan/WP2 — `notification_type` not persisted to time-store `meta`; the B2/B4 "CC-in-AwaitingInput → working" rule needs it. Cheap one-line fix in `time_store::event_to_row` (enum tag, same privacy class). RESOLVED in Phase 1 (P1.1).
- [SURFACED-2026-07-07] WP3 Phase 3 — the redesigned human-classifier is **presence/threshold-based, not typing-debit-based**, so `chars_per_sec` may be VESTIGIAL. claude-time subtracted `prompt_len / chars_per_sec` from each gap to bucket reading/thinking; the redesign classifies gaps by keystroke *presence* + silence *thresholds* + focus, with no per-gap duration debit. The `CHARS_PER_SEC_FALLBACK` constant is defined (plan-carried) but the classifier never divides by it. **Decision for WP4/finalize:** either (a) drop the constant as dead (the measure-vs-infer redesign genuinely obsoleted the typing-rate guess — a clean win), or (b) wire it into a WP4 metric that still wants an estimated-typing-time number. Leaning (a). Logged so it's a deliberate call, not a silent omission.
- [SURFACED-2026-07-07] WP3 Phase 3 — **B2a-vs-B2b not command-shape-split** (schema stores `tool_use_id`, not the `open` args). Both a CC-`open`-then-idle gap (B2a, passive read) and an AwaitingInput gap (B2b, active) resolve to short-gap Reviewing / long-silence Away. The read-vs-act *outcome* still lands correctly (passive short read = Reviewing); a finer split would need WP2 to store the Bash command shape (WP2.5 doc §4 follow-up class). Documented safe-but-looser fallback, operator-anticipated.

## Work Tree

- [x] Phase 1: Persist `notification_type` (unblock the AwaitingInput rule)  <!-- status: [x] -->
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk time_store` exits 0; a new test asserts a `Notification` row with `notification_type="permission_prompt"` carries `notification_type` in its `meta` JSON, and an informational one (`idle_prompt`) carries it too (the reclassifier, not the writer, decides meaning). ✅ 43 pass.
  - CLI: existing `time_store` tests still pass (no regression to `prompt_length_chars`/`tool_use_id`/`source` meta assembly); `cargo clippy -p claudesk -- -D warnings` clean. ✅
  - CLI: privacy pin holds — `notification_type` is an enum tag; the `row_never_carries_prompt_text` test still passes. ✅
  - [x] P1.1 Add `notification_type` to `meta` in `time_store::event_to_row` (only when present; same optional-key pattern as the other meta fields). Confirm `HookEvent.notification_type` is already parsed (it is — `hook_socket/mod.rs`).  <!-- status: [x] -->
  - [x] P1.2 Add a parallel meta-key test (`notification_row_carries_notification_type_in_meta`) + assert informational + input-needed types both round-trip (writer is meaning-agnostic). Added `notification_row_without_type_has_no_notification_type_key` too (optional-key guard).  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — 369 lib tests pass (0 fail), clippy clean, changed file fmt-clean -->
  - [x] verify-self  <!-- status: [x] — fresh CLI subagent confirmed all 6 Observable Outcomes PASS; no integration boundary (isolated additive field, write-gated OFF); no blocking/cosmetic issues -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIPPED (Mode 3 auto-skip gate clean: autopilot + verify-self all-PASS + no integration boundary + no consuming-surface outcome). Affirmation printed for operator read-time veto. -->
  - [x] verify-codify  <!-- status: [x] — coverage sufficient (2 build-time tests + retained privacy pin); strengthened the round-trip test to also pin the Notification `message` body is not leaked (closed a Notification-specific privacy gap). 369 lib pass, 0 fail; fmt-clean. No integration boundary. -->

  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — WP3 core, mid-milestone
  - Requirements unchanged: yes — definitions locked this session
  - Solution still feasible: yes — Phase 1 landed clean
  - No superior alternative discovered: yes
  **Verdict:** proceed

- [x] Phase 2: Pure reclassifier module — AI kinds + reused mechanics  <!-- status: [x] -->
  **Observable outcomes:**
  - CLI: new module `src-tauri/src/reclassify/` compiles + is declared in `lib.rs`; `cargo test -p claudesk reclassify` exits 0. ✅ 30 pass.
  - CLI: a `TimeRow`-slice-in → typed-metric-structs-out signature with NO `rusqlite::Connection` param anywhere in the module (grep: `rg 'Connection' src-tauri/src/reclassify/` returns nothing) — proves the pure-logic boundary. ✅ (only hit is a doc-comment saying "NO Connection").
  - CLI: ported mechanics reproduce the reference numerics — assertions equivalent to `test_reclassify.py`'s ToolDurations/ToolIntervals/SubagentDurations/SubagentIntervals/ActiveBursts/SessionActive tests pass in Rust (e.g. paired Bash Pre→Post 0→1000 = 1000ms; FIFO subagent pairing; interrupt-records-on-consecutive-UPS burst anchor). ✅
  - CLI: `ai-doing` segments derive from tool intervals, `subagent` segments from subagent intervals (carrying `agent_type` as `label`), `ai-reasoning` = AI-running time not covered by a tool/subagent interval; a fixture with one prompt→tool→Stop yields the expected AI-kind tiling. ✅ (incl. subagent-wins-over-tool + clip-to-window).
  - [x] P2.1 Scaffold `reclassify/mod.rs` + declare in `lib.rs`. Defined a lean decoupled `EventRow` view (NOT reusing `time_store::TimeRow` — WP4 maps DB rows→EventRow, keeping the reclassifier DB-agnostic) + `meta_str`/`meta_i64` (the `_meta_get` equivalent).  <!-- status: [x] -->
  - [x] P2.2 Port `tool_durations_ms` + `tool_intervals` (Pre→Post/Failure by `tool_use_id`; unpaired/reverse-zero skipped) — mechanics unchanged from reference.  <!-- status: [x] -->
  - [x] P2.3 Port `subagent_intervals` + `subagent_durations_ms` (Start→Stop FIFO by `agent_type` within session; zero-duration skipped).  <!-- status: [x] -->
  - [x] P2.4 Port `active_bursts` + `session_active_ms` (last-UPS-before-Stop anchor; interrupts recorded; reset per burst) — for the DERIVED "engaged time" metric (NOT a segment kind).  <!-- status: [x] -->
  - [x] P2.5 Defined the redesigned `Kind` enum `{AiDoing, Subagent, AiReasoning, Typing, Reviewing, Away}` + `Family` tag (Ai/Human) + `Segment{kind, start_ms, end_ms, label:Option<String>}`. Built `ai_segments_for_window` (subagent-labeled + ai-doing from intervals, subagent-wins-over-nested-tool, ai-reasoning fills the residual via interval-complement). Human kinds declared but their segmentation is Phase 3.  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — 30 reclassify tests pass, 399 lib total (0 fail), clippy clean, reclassify files fmt-clean, no rusqlite::Connection in code -->
  - [x] verify-self  <!-- status: [x] — fresh CLI subagent confirmed all 6 Observable Outcomes PASS (module declared+compiles+30 tests; pure-logic boundary; reference-numeric mechanics; AI-kind segmentation incl. subagent-wins; 399 no-regression; clippy+fmt clean). No integration boundary (isolated new module, dormant until WP4). -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIPPED (Mode 3 gate clean: autopilot + verify-self all-PASS + no integration boundary + no consuming-surface outcome). Affirmation printed for operator read-time veto. -->
  - [x] verify-codify  <!-- status: [x] — coverage sufficient; added 2 segmentation tests closing genuine gaps (two-separate-tools general tiling; tool partially-overlapping-subagent → subtract_spans right-remainder). 401 lib pass, 0 fail; fmt-clean. No integration boundary. Full A1–A5/B1–B5 human-scenario suite deliberately deferred to Phase 4. -->

- [x] Phase 3: The human-state gap machine (the novel redesign)  <!-- status: [x] -->
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk reclassify` exits 0 — the gap machine classifies AI-idle intervals into `typing`/`reviewing`/`away` per the locked rules. ✅ 49 pass (30 P2 + 19 P3).
  - CLI: **focus-only-in-AI-idle-gaps** proven — `human_segments_for_window` only emits segments for the COMPLEMENT of `ai_busy_intervals` (AI-busy whole window → 0 human segments; `human_window_empty_when_ai_busy_whole_window`). ✅
  - CLI: **launch/AwaitingInput → capped-working** proven: (B1) launch within the correlation window → Reviewing under cap (`gap_after_launch_is_reviewing_within_cap`); 40-min-silent after launch → Away (`gap_after_launch_exceeding_silence_cap_is_away`); (B2b/B4) AwaitingInput span from a `permission_prompt` Notification via the reused `status_broadcaster::notification_awaits_input` → Reviewing sustained by activity (`gap_awaiting_input_with_ongoing_activity_stays_reviewing`). ✅
  - CLI: **A5 + B5** collapse to one rule (no working-credit + dead-quiet > away_threshold → Away): `gap_focused_dead_quiet_beyond_threshold_is_away`. ✅
  - CLI: `typing` derives from `KeystrokeActivity` rows (`gap_with_keystrokes_is_typing`); editor-active + no keys → Typing (`gap_editor_active_no_keystrokes_is_typing`). ✅
  - [x] P3.1 `ai_busy_intervals` — merged union of tool + subagent + UPS→Stop burst spans (AI-idle = its complement).  <!-- status: [x] -->
  - [x] P3.2 `awaiting_input_spans` — reuses `status_broadcaster::notification_awaits_input` (made `pub(crate)`) as the single source of truth; opens on an input-needed Notification, closes on the next resume signal.  <!-- status: [x] -->
  - [x] P3.3 `launch_marks` + `GapContext::launch_precedes` — native `ExternalLaunch` OR cc-hook `PostToolUse`/Bash within `BLUR_LAUNCH_CORRELATION_MS` of the gap start; computed from both streams (NOT `preceded_by_launch`).  <!-- status: [x] -->
  - [x] P3.4 Capped-working via `GapContext::longest_silence` — working-credit holds until a silence run exceeds `SILENCE_CAP_MS`; any activity mark resets it.  <!-- status: [x] -->
  - [x] P3.5 `classify_gap` (4-branch first-match) + `human_segments_for_window` (tiles the AI-idle complement) + `surface_is_editor_at`. **Note:** B2a-vs-B2b is NOT split by command-shape (schema can't); both a CC-`open`-then-idle gap and an AwaitingInput gap get short-gap Reviewing / long-silence Away — the documented safe-but-looser fallback (SURFACE §4). The read-vs-act *outcome* still lands right (short passive read = Reviewing; the observable outcome holds).  <!-- status: [x] -->
  - [x] P3.6 `constants` submodule — `SILENCE_CAP_MS=10min`, `AWAY_THRESHOLD_MS=10min`, `BLUR_LAUNCH_CORRELATION_MS=30s`, `CHARS_PER_SEC_FALLBACK=6.0`; doc-comments cite the operator lock. `project_names` is NOT introduced here (a WP4 grouping param).  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — 49 reclassify tests pass, 418 lib total (0 fail), clippy clean, reclassify + status_broadcaster fmt-clean -->
  - [x] verify-self  <!-- status: [x] — fresh CLI subagent confirmed all 7 Observable Outcomes PASS incl. no-regression on status_broadcaster (pub(crate) change didn't alter event_to_state). No integration boundary. -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIPPED (Mode 3 gate clean: autopilot + verify-self all-PASS + no integration boundary + no consuming-surface outcome). Affirmation printed for operator read-time veto. -->
  - [x] verify-codify  <!-- status: [x] — coverage sufficient; added 2 cap-reset tests pinning the distinguishing reset-on-activity behavior (launch + periodic keystrokes → Typing beyond cap; launch + periodic hook activity, no keystrokes → Reviewing beyond cap — the "kept working 30 min" vs the silent-40-min→away case). 420 lib pass, 0 fail; fmt-clean. No integration boundary. Full A1–A5/B1–B5 named suite deferred to Phase 4. -->

- [x] Phase 4: Fresh test suite pinning every locked rule + scenario  <!-- status: [x] -->
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk reclassify` runs a suite where **each resolved scenario (A1, A2, A3, A4/reviewing, A5, B1, B2a, B2b, B3, B4, B5) has a named covering test**; all pass. ✅ 13 `scenario_*`/`nonport_*` tests, 64 reclassify total.
  - CLI: the reused mechanics keep their reference-equivalent assertions (tool/subagent/active-burst numerics), clearly separated from the NEW human-state tests so a future reader sees which are ported-unchanged vs redesigned. ✅ (sectioned test file + updated module doc-header).
  - CLI: full `cargo test -p claudesk` exits 0 (no regression elsewhere); `cargo clippy -- -D warnings` + `cargo fmt --check` on the new files clean (WP2's pre-existing fmt drift out of scope). ✅ 433 lib pass, clippy clean, fmt clean.
  - CLI: a WP1→WP3 kind-enum delta note lands in the doc confirming `{ai-doing, subagent, ai-reasoning, typing, reviewing, away}` is fed forward to WP4/WP6. ✅ (enriched with the as-built API hand-off).
  - [x] P4.1 Wrote the scenario suite — one named `scenario_a1..a5` / `scenario_b1..b5` (incl. `b2a`/`b2b` + `b4` two-sided + the cap-expiry case) mapping 1:1 to the spec truth-table, hand-built cc-hook + native fixtures.  <!-- status: [x] -->
  - [x] P4.2 Confirmed the surviving reference assertions are present (Phase-2 sections mirror ToolDurations/ToolIntervals/Subagent*/ActiveBursts/SessionActive); added `nonport_marker_reading_thinking_buckets_superseded_by_reviewing` + a block comment documenting the DELIBERATE non-port of the 120s/300s reading-vs-thinking bucket tests (superseded by `reviewing`; chars_per_sec-debit not exercised).  <!-- status: [x] -->
  - [x] P4.3 Confirmed + enriched the segment-contract delta forward to WP4/WP6 — the as-built API hand-off (EventRow, Kind/Family/as_str, Segment, ai_/human_segments_for_window entry points, derived metrics, constants, WP4 to-remove/to-decide list) recorded in the `### Segment-contract DELTA` section.  <!-- status: [x] -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->
  - [x] verify-auto  <!-- status: [x] — 64 reclassify tests pass, 433 lib total (0 fail), clippy clean, tests.rs fmt-clean -->
  - [x] verify-self  <!-- status: [x] — fresh CLI subagent confirmed all 4 Observable Outcomes PASS: 13/13 named scenario tests present+passing (A1–A5, B1–B5 incl. b2a/b2b, cap-expiry, nonport marker), 433 lib no-regression, clippy+fmt clean. No integration boundary (test-only phase). -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIPPED (Mode 3 gate clean: autopilot + verify-self all-PASS + no integration boundary [test-only phase] + no consuming-surface outcome). Affirmation printed for operator read-time veto. -->
  - [x] verify-codify  <!-- status: [x] — Phase 4 IS the codify deliverable (fresh scenario suite pins the redesigned defs). Assessed complete against ALL WP acceptance criteria; no new tests needed. Final gate: 433 lib + 5 integ = 438 pass, 0 fail. The 2 open items (chars_per_sec, B2a/B2b split) are documented WP4-boundary decisions, not gaps. -->

## Current Node
- **Path:** Feature > review-quality (complete) > finalize
- **Active scope:** ship [x] (commit `ebe9f31`) + review-quality [x] (0 CRITICAL, 2 MAJOR + 2 MINOR auto-backlogged to backlog-quality-findings.md). Ready for `/feature-finalize`.
- **Blocked:** none
- **Unvisited (sequence-of-execution):** finalize
- **Open discoveries:** notification_type persist RESOLVED (P1); chars_per_sec possibly-vestigial → WP4 decision; B2a/B2b not command-shape-split → documented fallback. See `## Discoveries`.
- **All 4 phases COMPLETE.** 438 tests pass (433 lib + 5 integ), clippy + fmt clean.

**Relevance check (before Phase 4):**
- Requester still needs this: yes — the scenario suite is the acceptance-pinning deliverable + the forward-delta hand-off to WP4/WP6
- Requirements unchanged: yes
- Solution still feasible: yes — Phases 1–3 built every primitive the scenario tests exercise
- No superior alternative discovered: yes
**Verdict:** proceed

**Relevance check (before Phase 3):**
- Requester still needs this: yes — Phase 3 is the novel core of WP3 (the measure-vs-infer human-state machine the operator designed this session)
- Requirements unchanged: yes — scenario rules locked this session, notification_type unblock landed in Phase 1
- Solution still feasible: yes — Phase 2 gave the AI-interval + segment primitives Phase 3 builds on; `status_broadcaster::notification_awaits_input` confirmed available for reuse
- No superior alternative discovered: yes
**Verdict:** proceed

## Verification posture (WP3-specific)

Pure-logic Rust reclassifier → per the "verify-self on backend-lifecycle features is agent-drivable statically" posture, verify-self for every phase is `cargo test` + `cargo clippy -- -D warnings` + `cargo fmt --check` on the new files. There is NO live/running-app surface to drive (the module has no IPC command, no PTY, no window) — so verify-human is a code+test review, not an operator live-drive. No MCP-bridge session needed. (WP4 is where this module first gets an IPC command + real DB rows; live verification lives there.)

## Code-Quality Review — m9-wp3-reclassifier-redesign

*(Advisory review against ship commit `ebe9f31`, Autopilot Mode 3. 0 CRITICAL, 2 MAJOR, 2 MINOR — all findings auto-backlogged; none blocking. Operator escape hatch: mark a finding `[DISMISSED]` here before finalize archives this file.)*

### Strengths
- Exemplary module-level documentation (REDESIGN-not-a-port stance, pure-by-construction contract, dormant-`dead_code` lifecycle — a WP4 consumer can pick it up cold).
- Clean pure-transform seam — every fn takes `&[EventRow]`, returns typed values, zero DB/AppHandle coupling (mirrors the `time_store` split).
- Single-source-of-truth reuse of `status_broadcaster::notification_awaits_input` structurally guarantees the live dot + analytics agree; `pub(crate)` widening documented at the definition.
- Scenario suite maps 1:1 to the locked spec truth-table; the cap-reset test pair proves the load-bearing distinction, not just the easy short-gap case.
- The deliberate NON-PORT is encoded AS a test with a comment pointing at the superseded reference thresholds.

### Issues
**CRITICAL** — (none)

**MAJOR**
- [reclassify/mod.rs ~710, `awaiting_input_spans`] A still-open AwaitingInput span at the session's last event is dropped ("conservative"), but the downstream effect is NOT conservative in the intended direction: an operator actively servicing a still-open prompt at the data tail gets no working-credit → branch 3 → **Away** instead of capped-working. It's the most-recent slice a live dashboard renders, and it's unpinned by tests (no trailing-open-await test). → auto-backlogged.
- [reclassify/mod.rs ~879, `surface_is_editor_at`] Equal-ts tie-break favors first-seen slice row (`>=` refuses to update on `==`); same-ms surface rows resolve by input order, which `group_by_session` explicitly does NOT guarantee. A same-ms surface flip decides Typing-vs-Reviewing for a whole gap. Cheap fix (last-wins on `>=`, or sort by ts first); untested at the tie. → auto-backlogged.

**MINOR**
- [reclassify/mod.rs ~879] `surface_is_editor_at` is the one hot-path helper not folded into `GapContext` — `human_segments_for_window` calls it once per gap → O(gaps × events) while every other per-gap input is precomputed once. Hoist into `GapContext::build`. → auto-backlogged.
- [reclassify/mod.rs ~851] Branch 2's working-credit predicate combines `awaiting_at(gap_start)` with an inline `awaiting.iter().any(...)` re-scan; reads clearer as one named `GapContext::awaiting_in_gap` helper matching `launch_precedes`/`awaiting_at`. Readability nit. → auto-backlogged.

### Assessment
Well-built, carefully-scoped phase. Pure-transform architecture + SSOT notification reuse + 1:1 scenario suite make it clear and maintainable; reused claude-time mechanics are faithfully ported with explicit "unchanged" markers. Advances the codebase rather than accruing debt — the three pre-documented deferrals are honest forward-decisions. The two MAJORs are behavioral edges at the classification boundary (trailing-open await → Away; same-ms surface tie-break order-dependence), both cheap to close and both currently *unpinned by tests* — the machine is right on every tested path but has two untested corners where "measure, don't infer" quietly degrades. WP4 should tighten those before the query layer trusts the tail of the stream.

### If you disagree
Mark a finding `[DISMISSED]` in this section before finalize archives the WIP.

## Retrospect
- **What changed in our understanding:** The operator-led scenario walk-through collapsed a sprawling "which app / related-vs-unrelated / monitoring" tangle into a much smaller machine via one realization — **focus/blur is only consulted during AI-idle gaps**, and the read-vs-act distinction keys on **CC's hook state, not the launched command**. "Unrelated app" turned out to be *undetectable*, so it dissolved into the same CC-state + cap rule rather than needing its own logic.
- **Assumptions that held:** claude-time's tool/subagent/active-burst *mechanics* matched the operator's intent as-is and ported verbatim (only the human-state buckets were redesigned). The pure-logic module boundary (row-slice in, typed structs out) held cleanly. Reusing `status_broadcaster`'s notification classifier as the single source of truth was the right structural call.
- **Assumptions that were wrong:** the plan carried `chars_per_sec` forward from claude-time, but the redesigned classifier is presence/threshold-based (not typing-debit-based), leaving the constant possibly-vestigial (logged for WP4). The B2a/B2b command-shape split the spec described isn't achievable with the stored schema (`tool_use_id`, not the `open` args) — collapsed to a safe-but-looser CC-state rule (outcome still lands right).
- **Approach delta:** implementation matched the 4-phase plan closely. The one honest simplification: B2a/B2b are not command-shape-distinguished (documented fallback). The code-quality review surfaced 2 genuine untested edges (trailing-open await → Away; same-ms surface tie-break order-dependence) — both backlogged as medium for WP4 to absorb, since they're tail-of-stream correctness the query layer will consume.
