---
workflow: incident
state: report
created: 2026-08-05
severity: TBD
drive_mode: autopilot
---

# Incident: Post-WP3 dev build spawns a blank CC pane

**Workflow:** incident
**State:** report
**Created:** 2026-08-05 18:20
**Severity:** TBD (set during triage)
**Status:** New

## Summary

A CC pane spawned by a **post-WP3** build renders **completely blank** — no welcome banner, no
prompt, zero bytes painted — while the `claude` process is alive and healthy behind it. Discovered
while attempting the live verification for the M12 WP3 inject-once fix; that verification could not
complete because there was no rendered terminal to observe.

**The release of `0.3.1` is PAUSED on this.**

## Initial Observations

**The bisect is the load-bearing evidence. Environment held fixed, only the code varied:**

| Build | CC pane | `CLAUDE_CODE_CHILD_SESSION` present? |
|---|---|---|
| `e82e334` (pre-WP3 = same code as operator's prod `0.3.0`) | **PAINTS** — 1389 chars, full CC v2.1.222 welcome banner | **YES** (visible in its own status line) |
| `94e5032` (post-WP3 + the inject-latch fix) | **BLANK** — 0 chars, 48–49 empty row divs | YES |

Reproduced **twice** on the blank side, on two different scratch repos (`tmp/scratch/scratch-c` and
a freshly-created virgin `tmp/scratch/verify-041` with no prior CC transcript dir).

**What is demonstrably NOT broken** (so the failure is narrow):
- `claude` spawns and stays alive on a real tty — `ps` shows state `SNs+` (running, foreground of
  its process group), correct argv (`claude --permission-mode dontAsk`), correct cwd.
- `cc_input` invokes **succeed** (returned OK when driven directly through `__TAURI_INTERNALS__`).
- No error, panic, or warning in the app log (`grep` for `cc_spawn|cc_ready|cc-output|error|panic|warn`
  returned nothing).
- The pane element exists, is visible, has non-zero geometry (640×648), and holds 48–49 row divs —
  the xterm instance mounted; it just has no content.
- Status dot reads **`Unknown`**, i.e. the hook channel also reported nothing for the session.

**Screenshot-confirmed on both blank runs**, so this is not a DOM-selector artifact. (Two selector
artifacts *were* separately hit and self-caught during the same session — see Discoveries.)

## Where in the system (arch.md framing)

⚠️ **`arch.md:374` describes this exact symptom class as a prior named incident** —
`incident-terminal-blank-cursor` (2026-06-22) — and records a **two-half invariant** that a blank
pane means one half has broken:

1. The backend **buffers output until `cc_ready`**, then flushes (`PtyCcSession::mark_ready`,
   `OutputBacklog` Some→None) — *necessary*; AND
2. the frontend `cc-output-<sid>` listener must **survive for the session's lifetime** — it must not
   be torn down by a transient React re-render.

The buffer-and-flush alone is **not sufficient**: if the listener is unlistened when the flush
emits, the output is lost and the pane stays blank. The contract is encoded in
`src/cc/spawnTrigger.ts` (the spawn effect's re-run trigger set must exclude the bridge phase) and
locked by `spawnTrigger.test.ts`. That file's own closing line is the relevant warning: *"Future
terminal/PTY work that touches the spawn-effect lifecycle must preserve this."*

**WP3 and the latch fix both touch exactly that lifecycle.** This is orientation for triage, not a
conclusion.

## Suspect range

Six commits, `e82e334..94e5032`:

| Commit | What it did | In the spawn path? |
|---|---|---|
| `80b82a1` | WP3 feat — auto-fire + picker announcement + second door | **YES** |
| `ba875df` | WP3 code-quality review (backlog only) | no |
| `119373b` | WP3 acceptance pass (docs only) | no |
| `ceb94ec` | WP3 close (docs/archive) | no |
| `3d8e18c` | session handoff marker (docs only) | no |
| `051d707` | the inject-once latch fix | **YES** — the latch sits *inside* the spawn effect |

WP3's diff against the spawn path: `cc_session/mod.rs` +367, `cc_session/commands.rs` +112,
`XtermPane.tsx` +91, `lib.rs` +8.

⚠️ **`051d707` (my own fix) is NOT excused a priori.** It adds a ref and a gate inside the very
effect this invariant governs. A latch cannot blank a terminal *in theory* — but the same kind of
theoretical reasoning is what produced the retracted misattribution below, so it gets tested, not
argued.

**The next bisect step is one commit:** build `3d8e18c` (WP3 complete, latch fix absent). Blank
there → WP3; paints there → the latch fix. The worktree is already prepared.

## Hypotheses

- **H1 — WP3 broke the `cc-output` listener's lifetime** (the arch.md invariant's half 2). WP3 added
  `intent` to the spawn `invoke` and a fire arm inside the spawn effect; a changed dep set or an
  early return could tear down or never attach the listener. (unverified)
- **H2 — WP3 broke the backend buffer-and-flush** (half 1). `cc_session/mod.rs` gained +367 lines
  including the flag consume/set ordering around spawn; if `cc_ready`/`mark_ready` is not reached on
  some path, buffered output is never flushed. Consistent with the status dot reading `Unknown`.
  (unverified)
- **H3 — the latch fix (`051d707`) perturbed the spawn effect.** Lower prior — the latch is a ref
  read plus a gate, both after the cancellation checks, and 12 tests plus 3 mutants cover it — but
  it is in the right file at the right place. (unverified)
- **H4 — an interaction with the dev-only environment that only manifests post-WP3.** The marker is
  present in *both* builds, so it cannot be the sole cause; it could still be a necessary co-factor
  (e.g. WP3 code that behaves differently when CC starts in a degraded/transcript-off mode).
  (unverified)

## Blast radius / exposure

- **Shipped builds: NIL.** The operator's Finder-launched prod `0.3.0` predates all of WP3 and has
  been in continuous daily dogfooding use for weeks with no such symptom (operator: *"prod 0.3.0 has
  always been doing just fine; otherwise I'd have reported an incident"*).
- **Unreleased `main`: BLOCKING.** If real, every workspace opened in `0.3.1` would show a dead
  terminal — the app's primary surface. This is why the release is paused.
- **Verification capability: already degraded.** Any agent-driven live check that needs CC's TUI to
  render is currently unavailable on `main`.

## Timeline

- **~17:15** — Live verification of the WP3 inject-once fix attempted on `tmp/scratch/scratch-c`;
  pane blank. Attributed to that workspace having attached to a pre-existing CC session with a live
  human conversation (a real and separate problem — a stray `\r` was written to it while probing PTY
  liveness). Verification abandoned as invalid.
- **~18:00** — Retried on a virgin `tmp/scratch/verify-041` (no transcript dir). Pane blank again,
  screenshot-confirmed. `claude` alive, `cc_input` OK, no log errors, status `Unknown`.
- **~18:05** — ⚠️ **Misattributed to the environment.** Filed as a backlog entry asserting *"NOT a
  product defect"*, reasoning that `CLAUDE_CODE_CHILD_SESSION` is set in the agent's environment and
  the operator's prod build is fine. Recommended cutting `0.3.1`.
- **~18:10** — Operator challenged the attribution: *"but could also be whatever change during
  wp3"* — correctly noting prod `0.3.0` predates WP3, so "prod is fine" does not discriminate
  between the environment and a WP3 regression.
- **~18:15** — Bisect run with environment held fixed. `e82e334` **paints** while carrying the same
  marker → **the environment hypothesis is falsified**.
- **~18:18** — Backlog entry retracted (it asserted a now-disproven conclusion). `0.3.1` release
  stays paused. Incident filed.

## Discoveries

[SURFACED-2026-08-05] triage — ⚠️ **A prior misattribution was filed and has been retracted.**
Backlog entry `SURFACE-2026-08-05-AGENT-LAUNCHED-DEV-BUILD-SPAWNS-A-BLANK-CC-PANE` (committed
`a0351be`) asserted this was a verification-method artifact and **NOT a product defect**, naming
`CLAUDE_CODE_CHILD_SESSION` as the identified cause. The bisect falsified it: the pre-WP3 build
paints **while carrying the same marker**. The entry has been deleted from `backlog.md`. **The
process lesson, which is the transferable part:** the reasoning was *"prod is fine → therefore the
dev-only variable explains it"*, but prod predates the suspect change, so that observation could not
distinguish the two candidate causes. **An observation is only decisive when the competing
hypotheses predict different results** — the same rule M11 banked
(`SURFACE-2026-08-02-BROWSER-SUPPLIES-THE-ANSWER-SO-SCROLL-RESTORE-CHECKS-ARE-VACUOUS`) and the same
one violated here. Cost: one paused release, one wrong backlog entry, and a wrong recommendation to
ship.

[SURFACED-2026-08-05] investigate — **Two DOM-selector artifacts were hit and self-caught in the
same session; an investigator will meet them too.** (1) A hook installed on
`__TAURI_INTERNALS__.invoke` **after page load never intercepts** — the app holds a bound reference
(self-reported honestly as `invokeIsPatched: false`; had it been trusted, an empty recorder would
have read as "no fire occurred"). (2) A **global** `.xterm-rows` query returns the hidden
right-panel terminal's empty renderer, not the CC pane's — 0 chars while the real buffer held 2876.
**Scope every xterm read to `[data-testid="xterm-pane"]`.** Note the current blank-pane finding
survived *both* controls: it was read with the scoped selector **and** independently confirmed by
screenshot.

[SURFACED-2026-08-05] investigate — **`arch.md:374` names a prior incident with this exact symptom**
(`incident-terminal-blank-cursor`, 2026-06-22) and a two-half invariant, with the frontend half
locked by `src/cc/spawnTrigger.ts` + `spawnTrigger.test.ts`. Those tests are **currently green on
`main`**, so either the regression is outside what they pin, or it is in the backend half. Start
there.

[SURFACED-2026-08-05] report — `arch.md` exceeds the 300-line size guard (731 lines); read the
load-bearing-constraints index + headings only. Already tracked as
`SURFACE-2026-08-03-ARCH-MD-EXCEEDS-SIZE-GUARD-834-LINES`; no new entry filed.

## Session Handoff — 2026-08-05 18:30
Handed off. See `workflow-system/state/.session.md` to restore.
