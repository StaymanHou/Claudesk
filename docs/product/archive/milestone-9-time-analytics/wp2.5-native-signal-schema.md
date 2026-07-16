---
stage: wp2.5-deliverable
state: complete
milestone: M9
updated: 2026-07-07
---

# M9 WP2.5 — Claudesk-native signal schema (the WP3 spec input)

**Purpose.** WP2.5 captured Claudesk's own native signals (window focus/blur, real PTY keystroke activity, active right-panel surface, Claudesk-initiated external launches) as a **second event source** alongside the CC hook stream (WP2). This document is the explicit hand-off to **WP3** (the reclassifier redesign): it inventories exactly *what is captured*, then walks the 5 hard human-state scenarios the operator enumerated (2026-07-06) and states, per scenario, **what captured data resolves it** — or, honestly, where it **stays inferred / ambiguous**. WP3's `/feature-spec` decides the *interpretation* (measure-vs-infer per state); WP2.5 only guarantees the data needed for that decision exists.

**Hard constraint carried from the spec (operator-directed):** native signals are *better, not perfect*. No naive rules (`blur → away` is WRONG). WP2.5 does NOT interpret; it captures enough context that WP3 *can* disambiguate.

---

## 1. What is captured (the `events` table, `source='claudesk-native'`)

All native rows share WP2's `events` table (one stream for WP3/WP4), discriminated by `source`:
- `source='cc-hook'` — the CC hook stream (WP2): `UserPromptSubmit` / `Stop` / `PreToolUse` / `PostToolUse` / `Notification` / `SubagentStart` / `SubagentStop` / `SessionStart` / etc.
- `source='claudesk-native'` — WP2.5's five signal kinds below.

Columns used by native rows: `ts` (real epoch-ms via `now_ms()` — native rows NEVER hit WP2's hook-`ts` epoch-0 fallback), `session_id` (PTY session for keystroke rows; empty otherwise), `cwd` (attributed project dir; empty if no active workspace), `event` (the kind), `source`, `meta` (JSON extras). `tool_name`/`agent_type` are unused (NULL) by native rows.

| `event` | When written | `session_id` | `cwd` | `meta` keys | Privacy |
|---|---|---|---|---|---|
| `WindowFocus` | Claudesk main window gained OS focus (`WindowEvent::Focused(true)`) | — | active workspace | `workspace_id`, `surface` | attribution only |
| `WindowBlur` | main window lost OS focus (`Focused(false)`) | — | active workspace | `workspace_id`, `surface`, `preceded_by_launch` (bool) | attribution + a bool |
| `KeystrokeActivity` | real bytes flowed into a PTY via `cc_input` (CC prompt or right-panel terminal) | the PTY session (`cc-N`) | active workspace | `workspace_id`, `surface`, `byte_count` (int) | **COUNT only — never the bytes** |
| `ActiveSurface` | the active right-panel surface changed (editor/diff/terminal) | — | active workspace | `workspace_id`, `surface` | attribution only |
| `ExternalLaunch` | Claudesk spawned Sublime Text / Merge / Finder (`sublime_open`/`smerge_open`/`finder_open`) | — | active workspace | `workspace_id`, `surface`, `tool` (`sublime`/`smerge`/`finder`) | tool identity only — never the launched path |

**Privacy invariant (extends WP2's length-only rule):** every native `meta` value is a count, a bool, an enum tag, or an opaque handle (`ws-N`/`cc-N`) / the `cwd` already stored on CC-hook rows. NEVER keystroke content, NEVER a launched file path. Pinned by `native_row_never_carries_content` + the keystroke `SECRETKEYS` test + live-proven (WP2.5 P3 verify-self: injected "ZZZ" appears in 0 DB rows AND 0× in the raw DB file bytes).

**Attribution mechanism.** The frontend reports the active workspace + surface via the `time_set_active_context{workspace_id, surface, cwd}` command (emitted by `RightPanelHost` on center-stage switch AND surface switch — a single emitter). Native writes read that context (`active_context_snapshot`). Keystroke rows additionally carry their own PTY `session_id` from `cc_input`.

---

## 2. The split external-launch picture (WP3 must read BOTH sources)

The "operator popped an external tool, then read it while Claudesk is blurred" evidence is **split across the two sources** — WP3 must join them:

- **Claudesk-initiated launches** (the operator clicked the Sublime/Merge/Finder buttons) → `source='claudesk-native'`, `event='ExternalLaunch'`, `meta.tool`. **(WP2.5)**
- **CC-initiated launches** (CC ran `open <screenshot>`, opened a browser, etc.) → arrive via the CC hook stream as `source='cc-hook'`, `event='PostToolUse'`, `tool_name='Bash'` (the `open …` is a Bash tool call). **(WP2 — already captured.)**

So "was this blur preceded by an external launch?" is answered by looking at BOTH: a recent `ExternalLaunch` native row OR a recent `PostToolUse`/`Bash` cc-hook row. WP2.5 additionally sets `WindowBlur.meta.preceded_by_launch` — **NOTE: in the WP2.5 build this bool is currently always `false`** (the focus handler doesn't yet correlate; see §4 open item). WP3 should compute the correlation itself from the two row streams by timestamp, rather than trusting `preceded_by_launch` until that wiring lands.

---

## 3. The 5 hard scenarios — what resolves each (WP3 spec input)

For each operator-enumerated scenario: the captured data that lets WP3 disambiguate, and an honest note where it stays inferred.

### (1) blur-but-working — CC ran `open <screenshot>`, operator is reading it while Claudesk is blurred
- **"blur → away" is WRONG here.**
- **Resolves via:** a `WindowBlur` row immediately preceded (by `ts`) by an external-launch signal — either an `ExternalLaunch` native row (Claudesk pop) OR a `PostToolUse`/`Bash` cc-hook row whose command was an `open`/viewer launch. If a launch precedes the blur within a short window → classify the blur as *reading/thinking*, NOT away.
- **Measured, not inferred** (both the blur and the launch are observed events). WP3 owns the correlation window threshold.
- **Residual ambiguity:** cc-hook `PostToolUse` doesn't distinguish `open screenshot.png` from `open -a Safari https://…` from a non-viewer Bash call; WP3 may want to inspect the tool command shape (WP2 stores `tool_use_id`, not the command — a possible WP3/WP2 follow-up if finer detail is needed).

### (2) focused-but-idle — window focused, no keystrokes, CC idle
- **Resolves partially:** `WindowFocus` present + no `KeystrokeActivity` in the interval + CC `Stop` (idle) from the hook stream → the operator is *present and reading/thinking*, NOT away. The `ActiveSurface`/`meta.surface` distinguishes *reading code* (editor/diff active) from *following CC* (terminal active).
- **Stays partly inferred:** reading-vs-thinking within "focused + idle + editor-active" is not further observable (no signal separates eyes-reading from mind-wandering). WP3 decides whether to call this one bucket or split it by a dwell heuristic. **This is the scenario the operator flagged stays partly inferred even with native signals.**

### (3) keystrokes-to-editor-vs-CC — typing in the in-app editor vs a CC prompt vs a terminal
- **Resolves via:** `KeystrokeActivity` rows fire ONLY for PTY input (CC prompt + right-panel terminal), each carrying `meta.surface` + `session_id`. The active `surface` (`editor`/`diff`/`terminal`) plus the presence/absence of PTY keystrokes separates the three:
  - `surface=terminal`/CC + `KeystrokeActivity` → typing to CC/shell (measured).
  - `surface=editor` + NO `KeystrokeActivity` → **reading code** (the operator's dominant idle state — measured as "editor-active, no PTY keys"). *In-app editor typing is deliberately NOT captured* (per the operator: editor interaction ≈ reading; capturing CodeMirror keystrokes was out of scope). So "editor active + no PTY keystrokes" is WP3's measured signal for editor-reading.
- **Measured.** The `ActiveSurface` switch rows give WP3 the surface-timeline even when no keystroke coincides with a switch.

### (4) second-monitor / different-Space — blurred because on another Space, maybe glancing at PiP
- **Resolves weakly:** a `WindowBlur` with no subsequent `KeystrokeActivity` and no preceding launch. Claudesk cannot observe "operator is glancing at the PiP mirror on another display" — macOS gives no such signal (this is the same multi-monitor blind spot as the PiP auto-summon design-prior `operator-helpful-friend-misfiring-as-offswitchable-setting`).
- **Stays inferred / ambiguous.** WP3 should treat a bare long blur conservatively (see (5)); it CANNOT distinguish "on another Space still working" from "away." Honest limitation — document it in the metric definition.

### (5) left-the-machine — genuinely away
- **Resolves via:** a `WindowBlur` + a long interval with NO `KeystrokeActivity` anywhere (any session) + NO preceding Claudesk-launched external + (optionally) no cc-hook activity. The longer the quiet blur, the higher the confidence of *away*.
- **Measured-ish (threshold-based).** WP3 owns the "how long is away" threshold — this is where claude-time's magic threshold lived; now it's grounded in *observed* focus + keystroke gaps rather than a pure hook-gap guess. Still a threshold, but over better signal.

---

## 4. Open items handed to WP3

- **`preceded_by_launch` is currently always `false`** on `WindowBlur` rows (the focus handler doesn't correlate launches yet). WP3 should compute launch-before-blur from the two row streams by `ts`, OR a small follow-up can wire the focus handler to check a recent-launch timestamp. Flagged, not fixed, in WP2.5 (capture-only scope).
- **cc-hook `PostToolUse` command shape** is not stored (only `tool_use_id`) — if WP3 needs to tell `open <screenshot>` from other Bash calls, that's a WP2/WP3 schema follow-up.
- **reading-vs-thinking** (scenario 2) has no further native signal — WP3 decides the bucketing.
- **AI-vs-human color families + reasoning-vs-doing sub-split** (`SURFACE-2026-07-06-M9-COLOR-FAMILIES-AI-VS-HUMAN`) is locked in WP3, not here — but note the input: *tool-time is hook-observable* (`PreToolUse`→`PostToolUse` intervals, cc-hook), *pure reasoning stays inference-based* (the gap between `UserPromptSubmit` and the first tool call / `Stop`).

---

## 5. Summary for WP3

WP2.5 turned three of claude-time's pure *guesses* into *measurements*: **present-vs-away** (focus/blur, observed), **typing spans** (real `cc_input` byte-timing, not a `chars_per_sec` estimate), and **per-project + per-surface attribution** (the workspace registry + active-context, not a git-root guess). Two things **stay inferred** and WP3 must own honestly: **reading-vs-thinking** within focused-idle, and **on-another-Space-vs-away** for a bare blur. The measure-vs-infer fusion — per human-state, which source wins and what the fallback is — is WP3's spec.
