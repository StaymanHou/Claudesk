---
workflow: incident
state: resolved
created: 2026-08-05
resolved: 2026-08-06
severity: P1
resolution: no-defect (measurement artifact)
drive_mode: autopilot
---

# Incident: Post-WP3 dev build spawns a blank CC pane

**Workflow:** incident
**State:** resolved
**Created:** 2026-08-05 18:20
**Triaged:** 2026-08-06 (P1)
**Resolved:** 2026-08-06
**Severity:** P1 (as triaged — see Resolution for why the assessment was correct on the evidence available)
**Status:** **Resolved — NO DEFECT (measurement artifact)**

## Resolution

**There was never a product defect.** Both the suspect build (`94e5032`) and the discriminating build
(`3d8e18c`) spawn CC correctly and paint the pane, pixel-confirmed, recovering **unaided** with no
resize, click, or focus event.

**Root cause of the false alarm:** every "blank pane" observation in this incident — including the
three I added while investigating it — was a **single sample taken inside the normal spawn window**,
before CC had emitted its first bytes. On `94e5032` that window is ~10.5 s wide. Sampling inside it
yields exactly the reported signature: `0 chars`, 48 empty row divs, a live `claude` on a real tty,
successful `cc_input`, and no log errors — because nothing is wrong.

**Disposition:**
- **`0.3.1` release pause: LIFTED.** The blocking defect does not exist.
- **WP3 (`80b82a1`) exonerated.** The bisect was measuring spawn latency, not a regression.
- **The inject-once latch (`051d707`) exonerated** — the commit the handoff explicitly refused to
  excuse a priori. Refusing to excuse it was right; it simply turned out clean.
- **No mitigation, no codify.** There is no defect to fix and no regression to pin. Writing a test
  here would codify a non-behavior.
- **No follow-up SURFACE filed** (neither I11 nor I12) — no root cause requires a fix. The one durable
  output is a *method* lesson, routed to `/session-reflect` rather than the backlog.

**Severity retrospect:** P1 was the correct call **on the evidence then available** — a blank primary
surface on an unreleased build, with a bisect that appeared to implicate a specific commit. The error
was never in the triage; it was in the measurement that fed it.

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
- **H5 — the blank is a VERIFICATION-HARNESS artifact, not a product defect** (promoted to first-class
  2026-08-06 at operator direction; previously buried inside H4). The agent-driven MCP-bridge harness
  is itself a suspect: the launch chain, the `CLAUDE_CODE_CHILD_SESSION` marker, bridge-injected
  timing, or an observation method that under-reports a *working* pane. ⚠️ **Do not treat the bisect
  as having eliminated this.** `e82e334` painting under the same harness lowers H5's prior but leaves a
  **harness×code interaction** fully open — a build could be harness-fragile in a way its predecessor
  was not, which would present exactly as "WP3 broke it." **Discriminator:** the same recipe run from
  an **operator-launched** build (outside the agent harness). Paints there but blanks under the
  harness → H5. Blanks in both → a genuine code defect. ⚠️ Related precedent worth respecting:
  `SURFACE-2026-08-05-XTERM-DOM-ROWS-ARE-NOT-THE-BUFFER` records two *prior false verdicts* on this
  exact surface where a working terminal was misread as blank. (unverified)

## Blast radius / exposure

- **Shipped builds: NIL.** The operator's Finder-launched prod `0.3.0` predates all of WP3 and has
  been in continuous daily dogfooding use for weeks with no such symptom (operator: *"prod 0.3.0 has
  always been doing just fine; otherwise I'd have reported an incident"*).
- **Unreleased `main`: BLOCKING.** If real, every workspace opened in `0.3.1` would show a dead
  terminal — the app's primary surface. This is why the release is paused.
- **Verification capability: already degraded.** Any agent-driven live check that needs CC's TUI to
  render is currently unavailable on `main`.

## Triage assessment (2026-08-06)

**Severity: P1** — major feature broken, investigate immediately. Operator-confirmed.

| Question | Answer |
|---|---|
| **User-facing impact** | Every CC pane renders blank — the app's **primary surface** is dead. A workspace opens to a terminal that never paints. |
| **How many affected** | **Shipped: zero.** Prod `0.3.0` predates all of WP3 and has been dogfooded daily for weeks, clean. **Unreleased `main`: total** — every workspace, every project. |
| **Workaround** | None — and none needed, because no shipped user is affected. The containment is the release pause, not a user-side mitigation. |
| **Duplicate?** | **No.** But `arch.md:374` records a prior *closed* incident with the **identical symptom** (`incident-terminal-blank-cursor`, 2026-06-22) whose two-half invariant is the leading hypothesis here. Same signature, not an open duplicate. |

⚠️ **Why P1 and not P2** (the handoff note leaned "high-urgency / low-severity"): the zero shipped exposure makes this **containable**, not **minor**. Severity measures the defect, and the defect kills the app's main surface; the urgency is undiminished because it blocks the `0.3.1` release *and* all agent-driven live verification on `main`. The nil exposure buys room to investigate properly rather than hotfix blind — that is its only effect on the response.

**Why not P0:** nothing is down for any user, no data loss, no security dimension. The operator's prod install is unaffected and in daily use.

**Blocked by this incident:**
- The `0.3.1` release (paused mid-`/release`).
- The M12 WP3 inject-once fix's live open→relaunch observable (needs a rendered CC pane to observe).
- Any agent-driven live verification on `main` that depends on CC's TUI rendering.

**Next step: I13 → `/incident-reproduce`.** Reproducibility is already established (twice, two repos, one virgin, screenshot-confirmed, environment held fixed) — so this is a deterministic local recipe, not a prod-data or telemetry-only signal. The anchor is worth capturing before investigating: this session's own history is the argument, having produced one retracted misattribution and two self-caught DOM-selector artifacts on this exact surface. An anchored, re-runnable recipe is what makes the next observation decisive and gives mitigation a regression gate.

⚠️ **Binding constraint on every pane observation from here** (per `SURFACE-2026-08-05-XTERM-DOM-ROWS-ARE-NOT-THE-BUFFER`): read `term.buffer.active` via the React fiber, scoped to `[data-testid="xterm-pane"]`. A DOM `.xterm-rows` read has already produced two false verdicts on this surface, and `data-session-id` belongs to the *right-panel* terminal, not the CC pane.

## Reproduction plan (operator-directed 2026-08-06)

Three operator constraints, in order:

1. **Establish CONSISTENCY before anything else.** A single blank pane is not a reproduction. Run the
   same recipe N times and record a **hit rate** (`X blank / N runs`), not a binary. Determinism is
   itself a diagnostic: **every-run** points at code; **flaky** points at a race or at the harness.
2. **Then discriminate: WP3 code change vs. verification-harness artifact.** ⚠️ The harness hypothesis
   is a **first-class candidate**, not a footnote — the report frames it only narrowly as H4. It is
   promoted to **H5** below. Note the bisect constrains but does not eliminate it: `e82e334` painting
   under the same harness lowers its prior, yet a harness×code *interaction* remains open.
3. ⚠️ **PAUSE ON FIRST LIVE CATCH — do not tear down.** When the blank pane is caught live, stop with
   the app **running** and hand the MCP-driven dev build to the operator to eyeball directly. Teardown
   only after the operator has looked. This overrides the usual drive-through-to-verdict posture.

## Reproduction Attempt

**Surface chosen:** manual recipe (a failing test cannot reach this — 1924 vitest + 806 cargo + `tsc`
+ lint are all green while the pane is blank, and `spawnTrigger.test.ts`, which pins the frontend half
of the invariant, is green on `main`).
**Outcome:** **reproduced — and the symptom is NOT what the report assumed.**
**Determinism:** first run on this build; hit rate still being established (operator-directed step 1).
**Build under test:** `3d8e18c` — **WP3 complete, latch fix (`051d707`) absent** (the discriminating build).
**Target:** `tmp/scratch/scratch-a` — the only scratch repo with **no** unclean flag, so the row carries
no prediction and no `--continue` arm (one fewer variable).

### ✅ CORRECTION #3 — MEASURED. No paint bug exists. The pane was photographed BEFORE DATA ARRIVED.

**A T+0 time series on a cold spawn settles it** (500 ms sampling, virgin second workspace, window
never touched — no resize, click, focus, or scroll):

| T (from sampler start) | Event |
|---|---|
| 6.374 s | workspace open clicked |
| 7.2 s / 9.2 s | new pane mounted, **0 chars** — CC still starting |
| **10.2 s** | **912 chars arrive** — first content |
| ~10.2 s → end | stable 912/929 chars, painted |

**Screenshot at ~T+8s → BLACK. Screenshot at ~T+28s → PAINTED. Nothing touched the window in
between.**

⚠️ **The ~T+8s black screenshot fell inside the ~4-second window when the pane held ZERO characters.**
It was not an unpainted-but-full terminal, and not an instrument artifact: **it was a faithful photo of
a genuinely empty terminal that had not yet received bytes.** Correction #2's "buffer full while screen
black" framing is therefore **also wrong** — it compared a buffer read taken at one moment against a
screenshot taken at a *different* moment on a *different* spawn, and read the mismatch as simultaneity.

**Conclusions:**
1. **There is no compositing bug, no paint stall, and no instrument lie.** Buffer, DOM, and pixels agree
   whenever sampled at the same instant.
2. **The pane recovers unaided** — Story A. No external event is needed to force a repaint, so the
   "stalls until resize/focus" defect (the severity-driving worry) **does not occur on this build**.
3. **Build `3d8e18c` is healthy.** CC paints ~4 s after the pane mounts, ~10 s after the click.
4. ⚠️ **The real lesson is measurement discipline, not product behavior:** three successive conclusions
   (compositing failure → instrument artifact → paint stall) were each drawn from **single samples taken
   at unaligned moments**. Only the T+0 time series — cheap, and available from the start — was ever
   capable of discriminating. **This is the THIRD instance in this incident of a verdict carried by an
   observation that could not discriminate**, after the `CLAUDE_CODE_CHILD_SESSION` misattribution and
   the "1389 chars = PAINTS" bisect reading.

### ✅ DECISIVE: `94e5032` — the build the release is paused on — ALSO PAINTS

The same T+0 series, run against **`94e5032`** (the exact build both original blank reports came from),
`tmp/scratch/scratch-a`, window never touched:

| T | Event |
|---|---|
| 9.299 s | workspace open clicked |
| 9.3 → 19.8 s | pane mounted, **0 chars** — the blank window (**~10.5 s**) |
| **19.822 s** | **893 chars arrive** — first content |
| 19.8 → 36.3 s | stable at 893 chars |

**Screenshot at ~T+11s → BLACK (inside the 0-char window). Screenshot at ~T+36s → PAINTS**, pixel-
confirmed: full CC v2.1.223 banner, prompt, model line. **Nothing touched the window** — no resize,
click, focus, or scroll.

**Verdict: there is no product defect. The incident is a measurement artifact end to end.**
- Both builds paint. `3d8e18c`: content at ~4 s after mount. `94e5032`: content at **10.5 s after the
  click** — slower, and that longer window is precisely what made the original observations land black.
- The pane recovers **unaided** on both builds. No external event is needed.
- ⚠️ **The "0 chars / 48 empty row divs" reading in the original report is exactly what this window
  produces.** The original sessions sampled inside it and never re-looked — the same single-early-sample
  error repeated three more times in *this* session before a time series was taken.

**Consequences:**
1. **The `0.3.1` release pause can be lifted** — the blocking defect does not exist.
2. **WP3 is exonerated**, and so is the inject-once latch (`051d707`). The bisect was reading spawn
   latency, not a regression.
3. **Blast radius: NIL, as originally assessed** — but for a different reason than recorded. Not
   "unreleased only": *nothing was ever broken.*
4. **The latency question is CLOSED, not filed** (operator input at resolve, 2026-08-06). The ~10.5 s
   vs ~4 s first-paint gap was measured on **cold-compiled debug builds on their first-ever launch**,
   one of them opening a flagged row where `--continue` does extra work. The operator reports **no
   perceptible latency in daily dogfooding of the real installed app** — a far larger sample, under
   the conditions that actually matter. A debug-build timing is not evidence about release
   performance, and no `SURFACE-` was filed: a speculative anchor against a number that cannot be
   reproduced in real conditions would be uncloseable (the same reasoning that declined an M10.9 WP4
   deferral anchor).

### ⛔ CORRECTION #2 (SUPERSEDED by #3 above — the premise was a sampling error)

**A second bridge screenshot of the same pane ~15 min later PAINTS correctly.** So the bridge
screenshot is **not categorically broken for xterm**, and correction #1 below (written minutes earlier)
**over-corrected**. The precise reading:

| Sample | `term.buffer.active` | Bridge screenshot |
|---|---|---|
| **T+12s** after workspace open | **878 chars** (full banner) | **BLACK** |
| **T+~15min**, same pane, untouched | 878 chars | **PAINTS** (matches operator's window) |

The buffer was **already full at T+12s** — so xterm had ingested the bytes but **had not yet painted
them to pixels**. The bridge captured a **genuine intermediate state**, not a lie.

**⚠️ This is very likely the incident itself, and it reframes it:** the symptom is not a *permanently
dead* pane but a **delayed / stalled first paint**. That fits every recorded observation better than
H1–H5 do:
- `claude` alive on a real tty, `cc_input` succeeding, zero log errors — all expected of a healthy
  session that simply has not painted yet.
- Buffer and DOM populated while the screen is black — exactly this state.
- **Why every prior session recorded "blank" and never saw it recover: they each took a SINGLE EARLY
  SAMPLE and moved on.** Nobody waited and re-looked. My own T+12s read repeated that mistake.

**The question that now determines severity:** does it *always* paint eventually, or does it sometimes
stall until an external event (resize, focus change, keystroke, scroll) forces a repaint?
- Always-eventually → a startup-latency annoyance; likely **not** release-blocking.
- Stalls until an event → a real user-facing defect (a user opening a workspace sees a dead terminal
  and has no reason to know a resize would fix it).
**This is the single most important thing left to measure** — and it is measurable: sample the same
pane at intervals from T+0 without touching the window.

### ⛔ CORRECTION #1 (superseded in part by #2 above) — the "black screen" is not what it looked like

**The operator eyeballed the live window and it PAINTS normally** — CC v2.1.223 banner, prompt, model
line, all visible, matching the buffer exactly. **The compositing-failure conclusion below is FALSE
and is retained only as a record of the error.**

**What was actually wrong:** the MCP bridge's `webview_screenshot` returned a black left pane while
the real window painted correctly. The bridge screenshot is **not a faithful record of what the user
sees** — it appears to miss the composited xterm content (or captures a stale backing frame). ⚠️ **New
bridge caveat: `webview_screenshot` can report a FALSE BLANK for xterm panes. It cannot be used as the
decisive "does the user see it?" instrument — only the operator's own eyes, or a native window capture
(`screencapture`), can settle that.**

**The reasoning error, which is the transferable part:** two independent text layers (fiber buffer +
scoped DOM) **agreed** that content was present; one image disagreed. I concluded the two agreeing
measurements were over-reporting and the single image was truth — and wrote it into the report and a
commit message before testing it. The likelier reading was the opposite. ⚠️ **This is the SECOND
instance in this incident of the same root error** — the retracted `CLAUDE_CODE_CHILD_SESSION`
misattribution was also a verdict carried by an observation that could not discriminate. The rule this
incident keeps re-learning: **an observation is only decisive when a broken implementation and a
working one would give DIFFERENT answers** — and when instruments disagree, the first question is
*which instrument is lying*, not *which layer of the product is broken*.

### ✅ WHAT SURVIVES: build `3d8e18c` PAINTS (operator-confirmed at the pixel level)

This is the discriminating build the bisect was waiting on — **WP3 complete, latch fix (`051d707`)
absent** — and it **paints**. Per the report's own logic (blank → WP3; paints → the latch), **WP3 is
not implicated and the remaining suspect is the latch fix.**

⚠️ **But do NOT close on that yet.** The prior blank-side readings are now themselves suspect: if they
were judged via the same bridge `webview_screenshot` path, they may be the same artifact. The report
records them as "screenshot-confirmed" **without naming which screenshot path**. Resolving that is the
next step — see "Open question" in the Timeline.

### ⛔ FALSE — original headline, retained for provenance: "the buffer is FULL while the screen is BLACK"

Read at the same instant, on the same pane:

| Layer | Reading |
|---|---|
| `term.buffer.active` (via React fiber — the authority) | **878 chars**, 17 non-empty lines, full **CC v2.1.223** welcome banner |
| DOM `.xterm-rows` (scoped to `[data-testid="xterm-pane"]`) | **878 chars**, 48 row divs, **17 with text**, real markup (674/1019/796 bytes for first 3 rows) |
| Computed styles (`rows`/`screen`/`viewport`) | all `display:block`, `visibility:visible`, `opacity:1`, colour `rgb(212,212,212)` on transparent |
| **MCP bridge `webview_screenshot`** | ⛔ black left pane — **ARTIFACT, see retraction above** |
| **Operator's own eyes (the real window)** | ✅ **PAINTS** — banner, prompt, model line, matching the buffer |

Artifact image (the false one): `scratchpad/blank-pane-3d8e18c.png`. Operator's true capture: the
window screenshot supplied 2026-08-06.

**Every conclusion originally drawn from the "black" row is void.** There is no compositing failure;
buffer, DOM, and screen all agree. H1/H2 are **not** falsified by this run — they are simply
**untested** by it, because this build never exhibited the symptom.

**What the three agreeing layers DO establish, on this build:** the PTY delivers, `mark_ready`/flush
works, the `cc-output-<sid>` listener is attached and survives, and xterm renders to visible pixels.
The `arch.md:374` two-half invariant is **intact at `3d8e18c`**.

⚠️ **Standing-trap status, corrected.** `SURFACE-2026-08-05-XTERM-DOM-ROWS-ARE-NOT-THE-BUFFER` is
**not** inverted by this run — the buffer read was *correct* here and agreed with reality. What this
run adds is a **new, separate** trap on the other instrument: the **bridge screenshot** can report a
false blank. Both traps now point the same way — **on this surface, cross-check at least two
independent instruments and treat disagreement as an instrument question first.**

**Probe validity:** the reader was validated on a known-good case *before* being trusted — it returned
a full banner with correct structure, so a subsequent zero would have been a real zero rather than a
broken probe.

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
- **2026-08-06** — **Triaged P1** (operator-confirmed). Route: **I13 → reproduce** — the failure is a
  deterministic local recipe, not a prod-only signal, and an anchored reproduction is what makes the
  next observation decisive after this session's retracted misattribution.

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
