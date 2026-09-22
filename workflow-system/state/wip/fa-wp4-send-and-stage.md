---
workflow: feature
state: ship (complete)
created: 2026-09-22
drive_mode: autopilot
wbs: workflow-system/product/wbs.md → WP4
---

# Feature: F-a WP4 — Send and stage (injection integration)

**Workflow:** feature
**State:** ship (complete) — commit `5af55f6`
**Created:** 2026-09-22

## Problem Statement

The Prompt panel (WP3) holds and persists a per-project prose draft, but there is **no path from
the panel to Claude Code** — the operator must still retype or copy the text into the CC pane,
which is the whole cost F-a exists to remove. WP2 already built both halves of the send
(`stagedPayload(body, {submit})` for the bytes, `appendToHistory` for the recovery ring) and
nothing consumes either. WP4 wires them: two send modes (**auto-submit `⌘↵`** / **stage-only
`⇧⌘↵`**, differing by one trailing `\r`), buttons and hotkeys for each, clear-and-archive on send,
and a minimal recover-from-history affordance. When this ships, F-a's durability story is complete
and `SURFACE-2026-09-15-STAGING-AREA-FOR-PROMPT-INPUT` can be re-read against the operator's own
words and closed.

**Problem statement re-check (F12 back-loop re-entry, 2026-09-22).** ⚠️ **The root problem has
NOT changed; ONE SOLUTION DECISION was reversed.** What we learned: the operator rejected
Phase 3's append-on-recover behaviour and ruled for confirm-then-overwrite. The problem this
feature addresses is unchanged — durability and editability of in-progress prompt text, and
recovery that does not destroy unsent work. **Both shapes satisfy "do not destroy unsent work";
they differ in HOW.** Append preserved everything automatically at the cost of a merged document
the operator must then clean up *every* time; confirm-then-overwrite gives a clean swap and makes
the destruction deliberate, with the cost paid only when something would actually be lost.
The operator's reading is better and my "ask-first is over-built for minimal" judgment was wrong —
I weighed the modal's friction while under-weighting the recurring cost of the merge.
**No change to `## Problem Statement`.**

## Settled inputs — do NOT re-litigate

These are rulings from the 2026-09-21 `/util-grill-me` pass, recorded in `wbs.md` → WP4 and
`roadmap.md` → Group F → F-a:

1. **Both modes ship.** Auto-submit (`⌘↵`) and stage-only (`⇧⌘↵`). Not a hedge — one payload
   builder, one boolean (`stagedPayload`'s `submit`).
2. **Enters through `injectCommand` with `label: "staging"`.** ⚠️ **Do not open a second path to
   `cc_input`.** The label exists because M13 inherited a hardcoded `auto-resume:` prefix and
   misattributed every button failure to M12's automatic arm.
3. **Stage-only's success is unverifiable by Claudesk** — `injectCommand` has no retry and no
   readback, and parsing CC's output is forbidden by `arch.md`. The terminal is the evidence,
   which is acceptable because the operator is looking at it next. ⚠️ **Do not build machinery to
   close this.**
4. **`slashCommandPayload` is NOT modified.** M12/M13/M15 callers stay byte-identical.

## Design decision taken at plan time (P1 — the one real integration question)

⚠️ **`injectCommand` hardcodes `slashCommandPayload(command)`**
(`autoResumeFire.ts` → `injectCommand`), so "enter through `injectCommand`" and "use
`stagedPayload`" are in direct tension as the code stands. Three options were considered:

- **(a) Call `invoke("cc_input", …)` from the panel.** ❌ Rejected — that IS the second path to
  `cc_input` that decision 2 forbids, and it would re-open the `.catch`/attribution hole
  `injectCommand` owns.
- **(b) Have the panel pre-encode and pass the payload as `command`.** ❌ Rejected — `injectCommand`
  would then double-encode (it calls `slashCommandPayload` on whatever it receives), and the
  `console.warn` diagnostic would print a base64 blob instead of a readable command.
- **(c) ⭐ Widen `injectCommand` with an OPTIONAL payload builder that defaults to
  `slashCommandPayload`.** ✅ **Chosen.** Existing callers pass nothing and are byte-identical;
  the staging call site passes `(text) => stagedPayload(text, { submit })`. One funnel, one
  `.catch`, one label parameter, and the `console.warn` still names readable text.

⚠️ **This widening is exactly the shape `[[ts-arity-flexible-assignability-hides-a-widened-param]]`
warns about**: adding a parameter breaks no implementation and `tsc` stays green whether or not
the builder is actually passed. So P1's tests must **capture the argument VALUE** in a double and
assert the resulting bytes — not merely that `injectCommand` was called.

## Work Tree

- [x] Phase 1: The send seam — `injectCommand` widening + `sendStagedDraft`  <!-- status: done -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/components/workspace/__tests__/autoResumeFire.test.ts` exits 0 —
    the existing byte-for-byte pin against Rust's `slash_command_bytes` still passes, proving the
    widened signature left M12/M13/M15 callers byte-identical.
  - CLI: `pnpm vitest run src/components/workspace/prompt/` exits 0 with a new suite in which a
    captured test double records `injectCommand`'s 4th argument as the literal string `"staging"`
    and its payload as `stagedPayload(body, { submit: true })` for auto-submit and
    `stagedPayload(body, { submit: false })` for stage-only — the two differing by exactly the
    trailing `\r` byte after base64 decode.
  - CLI: `node -e` (or a vitest assertion) decoding both payloads shows both open `ESC[200~` and
    close `ESC[201~`, and that the auto-submit one has one additional trailing `\r` OUTSIDE the
    envelope.
  - CLI: `grep -c 'invoke("cc_input"' src/components/workspace/prompt/` returns 0 — the panel
    opens no second path to `cc_input` (decision 2).
  - [x] P1.1 Widen `injectCommand` with an optional 5th parameter `buildPayload` defaulting to
        `slashCommandPayload`. ⚠️ Document at the parameter that the default is what keeps M12/M13/
        M15 byte-identical, and that a caller passing a builder owns its own byte contract.  <!-- status: done -->
  - [x] P1.2 `sendStagedDraft.ts` — the pure send decision as a `plan*`-style module beside
        `promptDraftSync.ts`: given `{ text, submit }`, return either "nothing to send" (blank/
        whitespace-only body) or the `{ payloadBuilder, label }` to hand the funnel. ⚠️ Pure, so
        the both-modes property is testable without a PTY or a render.  <!-- status: done -->
  - [x] P1.3 Export `STAGING_INJECT_LABEL = "staging"` as a named constant, mirroring
        `SUPERVISOR_INJECT_LABEL` in `supervisor/fanOut.ts`. ⚠️ A named constant, not a literal at
        the call site — the same misattribution reasoning that constant records.  <!-- status: done -->
  - [x] P1.4 Tests: capture the VALUE of both the label and the built payload in the double
        (`[[ts-arity-flexible-assignability-hides-a-widened-param]]`); decode and assert the
        trailing-`\r` difference; assert blank bodies send nothing.  <!-- status: done -->

  **Mutation evidence (P1.4) — five mutants, run INDIVIDUALLY, each confirmed to land in
  EXECUTABLE code before being believed:**
  | # | Mutation | Killed by |
  |---|---|---|
  | 1 | `injectCommand` ignores `buildPayload`, reverts to `slashCommandPayload(command)` | 3 tests |
  | 2 | `submit` boolean inverted (`mode !== "auto-submit"`) | 6 tests |
  | 3 | `label` reverts to the `"auto-resume"` default | 2 tests |
  | 4 | blank check loses its `.trim()` | 1 test |
  | 5 | `body` trimmed instead of sent verbatim | 1 test |

  ⚠️ Mutant 5's FIRST attempt was INVALID — a bad `perl` substitution mangled the file so vitest
  reported "no tests", which is indistinguishable from a real hole
  (`[[invalid-probe-and-real-hole-look-identical]]`). Re-applied cleanly, the line was confirmed
  present via `sed -n '<line>p'`, and it then died. ⚠️ Restore was by `cp` from a pre-mutation
  copy, NOT `git checkout` — `sendStagedDraft.ts` is untracked, where `git checkout` is a silent
  no-op (`[[git-checkout-no-ops-on-untracked-file]]`). Both files `shasum`-verified back to their
  pre-mutation hashes.
  - [x] verify-auto  <!-- status: done — pnpm verify:auto EXIT=0, 210 files / 2874 tests -->
  - [x] verify-self  <!-- status: done — 4/4 outcomes PASS, 0 BLOCKING, 0 COSMETIC -->
    **Subagent verdict (Phase 1, 2026-09-22) — all four outcomes PASS.** ⚠️ Recorded because the
    corroboration was INDEPENDENT of the shipped code, which is what makes it worth more than a
    re-run of my own suite:
    - Outcome 1 (M12/M13/M15 byte-identical) — EXIT=0, 19 tests. Cross-checked against the new
      suite's default-path assertion: no-builder `injectCommand` decoded to `/session-restore\r`
      with NO envelope.
    - Outcome 2 (values captured, not calls counted) — EXIT=0, 64 tests. Subagent read the
      assertions and confirmed they decode `invokeMock.mock.calls.at(-1)[1].data` rather than
      counting invocations, then **re-ran mutant 1 independently** (`sed -n`-verified as landed):
      3 of 15 tests failed, file restored, sha re-matched `7dba4a4d`.
    - Outcome 3 (envelope bytes) — verified in a THROWAWAY spec that hardcoded
      `1b 5b 32 30 30 7e` / `1b 5b 32 30 31 7e` as raw bytes rather than importing
      `PASTE_START`/`PASTE_END` from the code under test — so the escape sequences are pinned
      against an external constant, not against themselves. AUTO 24 bytes, STAGE 23,
      `auto.slice(0,-1)` deep-equals `stage`.
    - Outcome 4 (no second `cc_input` path) — 0 occurrences across all 11 files in `prompt/`;
      `sendStagedDraft.ts` imports no `invoke` at all.
    ⚠️ Repo state independently re-verified by the orchestrator after the subagent's mutation
    work: both source hashes match their pre-mutation values and no scratch files remain.
  - [x] verify-human  <!-- status: done — OPERATOR-SKIPPED 2026-09-22, checks NOT run -->
    ⚠️ **SKIPPED BY OPERATOR DECISION — the three checks were NOT run.** Operator, 2026-09-22:
    *"skip. these are too behind-scene stuff that I don't care"*. Recorded as a skip, NOT as
    passes: nobody executed P1.verify-human.1–3, and marking them `[x]` would be a false record.
    ⚠️ **The §2 integration boundary DOES apply** (condition 1 — `injectCommand` in
    `autoResumeFire.ts` is consumed by M12 auto-resume, M13's skill row, `recycleSession` and M15's
    supervisor, and this phase modified its BODY and SIGNATURE), so this is an operator override of
    the forbidden-F11 rule, not an auto-skip and not a clean gate.
    ⚠️ **WHAT THIS COSTS, stated so a later reader is not misled:** the M12/M13/M15 byte-identity
    claim now rests on the AUTOMATED evidence alone — `autoResumeFire.test.ts`'s byte-for-byte pin
    against Rust's `slash_command_bytes` (19 tests, green in verify-auto), the verify-self
    subagent's independent re-run of mutant 1, and the new suite's default-path assertion. That is
    substantial and it is machine-checked; what is missing is a human having looked at it.
    ⚠️ **The residual risk is NOT closed by Phase 1's tests:** an installed-build regression in
    auto-resume / the skill row / recycle / the supervisor would not be caught here. **Carry it to
    the `/release` gate**, per `[[installed-build-verify-deferred-to-release]]`.
    - [ ] P1.verify-human.1 — M12 auto-resume byte pin  <!-- status: SKIPPED-BY-OPERATOR: not run -->
    - [ ] P1.verify-human.2 — M13 skill-row byte pin  <!-- status: SKIPPED-BY-OPERATOR: not run -->
    - [ ] P1.verify-human.3 — full consuming-surface suite  <!-- status: SKIPPED-BY-OPERATOR: not run -->
  - [x] verify-codify  <!-- status: done — injectCommandDefaultPath.test.ts, 10 tests -->
    ⚠️ **CODIFIED A REAL GAP, NOT A FORMALITY — and the audit is the finding.** The widening's
    safety claim ("every existing caller omits the builder, so all four are byte-identical") was
    only PARTLY pinned. Measured at codify time by mutating the default parameter to the staged
    builder and running the PRE-EXISTING suites: **309 tests across 15 files ALL PASSED** against
    a mutant that makes M12 auto-resume, recycle and the supervisor wrap every slash command in a
    bracketed-paste envelope. Per-consumer:
    - **M13 skill row** — genuinely covered; `skillButtons.test.ts` caught the mutant (2 failures).
    - **M12 auto-resume** — NOT covered. `autoResumeFire.test.ts` pins the HELPER in isolation and
      `injectOnceOnRelaunch.test.ts` is a `?raw` SOURCE-TEXT guard on the call shape. A helper-only
      pin cannot see a funnel that stopped calling the helper.
    - **recycle** — NOT covered; `recycleSession.test.ts` mocks `../autoResumeFire` WHOLESALE.
    - **M15 supervisor** — not covered at this seam by design (`fanOut` takes `inject` as an
      injected dep); its WIRING-SITE arity was unpinned.
    New file `__tests__/injectCommandDefaultPath.test.ts` (10 tests) closes it — 7 of the 10 fire
    on that mutant. ⚠️ Expectations are written as LITERAL byte arrays, not derived from
    `slashCommandPayload`, so they are not an arithmetic identity
    (`[[detector-scored-against-its-own-table-is-circular]]`); one test deliberately DOES compare
    against the helper, as a drift check, and that contrast is the diagnostic.
    ⚠️ This is the codified replacement for the three verify-human leaves the operator skipped.

- [x] Phase 2: Wiring the panel — buttons, hotkeys, clear-and-archive  <!-- status: done -->
  **Observable outcomes:**
  - Browser (MCP `tauri` bridge, live app): the Prompt panel shows two send controls; clicking the
    auto-submit control with a non-empty draft leaves the panel's editor EMPTY
    (`[data-testid="prompt-editor"]` text content is `""`) and the Prompt tab's draft-present dot
    dark.
  - Browser: after that send, `localStorage.getItem("claudesk.staging.history:" + <canonical
    path>)` parses to an array whose first element is exactly the sent text, and
    `localStorage.getItem("claudesk.staging.draft:" + <canonical path>)` is `null`.
  - Browser: the CC pane's xterm buffer contains the sent text (read via the terminal's buffer
    API, ⚠️ **never `.xterm-rows` innerText** — `[[xterm-dom-reads-fake-a-blank-pane]]`), with a
    positive control proving the read instrument works.
  - CLI: `pnpm vitest run src/components/workspace/prompt/` exits 0 — the inverted P3.6 guard now
    REQUIRES `stagedPayload`, `injectCommand` and `appendToHistory` in the panel, and a new
    funnel-count guard asserts exactly ONE `injectCommand(` call site in `PromptPanel.tsx`.
  - CLI: `pnpm vitest run src/components/workspace/__tests__/chordRegistry.test.ts` exits 0 with
    the two new chords present — the registry does not lie by omission about the keyboard surface.
  - [x] P2.1 ⚠️ **INVERT the P3.6 guard** in `promptDraftSync.test.ts` ("does NOT open the WP4 send
        seam"). Deliberately, not incidentally: the four forbidden identifiers become REQUIRED,
        the test is renamed, and its comment records that WP3 closed this seam on purpose and WP4
        opened it. ⚠️ Add a funnel-count guard in the same pass — `injectCommand(` exactly once,
        comments stripped, per `[[raw-guard-substring-must-be-unique-to-its-site]]`.  <!-- status: NOT-STARTED -->
  - [x] P2.0 ⚠️ **THREAD `cc_session_id` DOWN TO THE PANEL — it is NOT there today.** Surveyed at
        Phase 1 verify-self so it does not surface mid-build: `workspace.cc_session_id` exists in
        `Workspace.tsx` (used by the skill row at ~`:1176`/`:1201`) but `RightPanelHost` receives
        only `workspaceId` + `projectPath`, and its one `sessionId={t.id}` is a TERMINAL TAB id,
        not the CC session. ⚠️ Do NOT reuse that terminal id — it addresses a different PTY.
        ⚠️ Pass the LIVE value, not one captured at mount: `Workspace.tsx:333` records that a
        closure captured at click time polls a frozen value, which is why `ccSessionIdRef` exists.
        A recycle replaces the session id, so a stale capture would inject into a dead PTY and
        vanish into `injectCommand`'s `.catch`.  <!-- status: NOT-STARTED -->
  - [x] P2.2 Send buttons for both modes in the Prompt panel (task 4.1). Disabled when the draft is
        blank, so the no-op case is not a mystery click.  <!-- status: NOT-STARTED -->
  - [x] P2.3 `promptSendChord.ts` — a pure predicate module sharing `chordEvent.ts`, matching the
        11 existing ones (task 4.2). ⚠️ **`⌘↵` and `⇧⌘↵` were VERIFIED FREE at plan time**: no
        `chordRegistry` entry binds Enter, no `*Chord.ts` predicate matches it, and
        `promptExtensions` binds no Enter key (`basicSetup={false}`, no `defaultKeymap`). The bare-
        `Enter` handlers elsewhere (picker cells, filetree rename, project search) are unmodified-
        key and cannot collide with `metaKey: true`. ⌘⇧+digit stays filmstrip's.  <!-- status: NOT-STARTED -->
  - [x] P2.4 Register both chords in `chordRegistry.ts` with `host: "workspace"` and a matcher path
        pointing at P2.3's module. ⚠️ M14 WP3 built this registry precisely so the chord surface
        cannot drift from what is renderable; a new chord that skips it re-opens that drift.  <!-- status: NOT-STARTED -->
  - [x] P2.5 On send (either mode): clear the draft AND append to the history ring (task 4.3).
        ⚠️ Use `setRing(appendToHistory(p, t))` — it returns the new ring, so no re-read. ⚠️ The
        order is **append, then clear**: `appendToHistory` refuses a blank entry, so clearing first
        would silently drop the archive.  <!-- status: NOT-STARTED -->
  - [x] P2.6 Tests: both payload shapes reach `injectCommand` with `label: "staging"`;
        clear+archive fires on BOTH modes (task 4.5). ⚠️ Assert the ARGUMENT VALUES, not call
        counts.  <!-- status: NOT-STARTED -->
  - [x] verify-auto  <!-- status: done — pnpm verify:auto EXIT=0, 214 files / 2920 tests -->
    **Outcome substance checked, not just suite-green:** `prompt/` EXIT=0 (100 tests);
    `chordRegistry.test.ts` EXIT=0 (17) with both new ids present; the panel holds EXACTLY ONE
    `injectCommand(` call; all four inverted-guard tests confirmed present BY NAME via
    `--reporter=verbose`. ⚠️ The archive-before-clear guard was MUTATION-PROVED: swapping the two
    calls (landing verified by line number) killed it.
    ⚠️ **One instrument error worth recording:** an ad-hoc `grep -rn 'cc_input' prompt/` returned
    1 hit and briefly looked like a decision-2 violation. It was a COMMENT saying *not* to do it
    — the polarity trap in `docs/lessons/source-text-guards.md` entry 14 ("a `grep -c → 0`
    outcome cannot tell an instruction from a prohibition against re-adding it", and removal work
    is exactly where that collides). The shipped guard strips comments and reads zero correctly;
    the ad-hoc grep was the flawed instrument, not the code.
  - [ ] verify-self  <!-- status: PARTIAL — 2 CLI PASS, 3 browser UNVERIFIED (stale bundle) -->
    **2 PASS / 3 UNVERIFIED / 0 FAIL / 0 COSMETIC.**
    - [x] CLI: `prompt/` suite — EXIT=0, 8 files / 100 tests  <!-- status: done -->
    - [x] CLI: `chordRegistry.test.ts` — EXIT=0, 17 tests; both new ids present
          (`chordRegistry.ts` lines 231/248) and claimed in ACCOUNTED as SEPARATE entries, with
          the suite asserting in BOTH directions  <!-- status: done -->
    - [ ] Browser: send empties the editor + darkens the tab dot  <!-- status: UNVERIFIED: stale bundle -->
    - [ ] Browser: history ring populated + draft key cleared  <!-- status: UNVERIFIED: stale bundle -->
    - [ ] Browser: sent text reaches the CC xterm buffer  <!-- status: UNVERIFIED: stale bundle + no workspace open -->

    ⚠️ **THE BROWSER OUTCOMES ARE UNVERIFIED, NOT PASSED — AND NOT FAILED.** The running dev app
    (started 10:24) is on a STALE BUNDLE: its last `PromptPanel.tsx` HMR update is stamped
    **11:23:52** while the send-path files were written **12:20–13:02**, and
    `sendStagedDraft.ts` / `promptSendChord.ts` have **no resource entry at all** in the live
    webview. ⚠️ **That absence is decisive rather than suggestive**, because `sendStagedDraft` is
    a **STATIC** import of `PromptPanel` (line 34) — had the panel reloaded, the webview would
    necessarily have fetched it. This is `[[hmr-stale-across-file-rename]]` firing as documented:
    a long-lived HMR window half-applies after edits to a component holding `useRef`/`useState`,
    which is exactly what Phase 2 changed.
    ⚠️ **The BUILD is fine — only the running webview is stale.** Independently confirmed by the
    orchestrator: `curl localhost:1420/src/.../sendStagedDraft.ts` returns HTTP 200 with the new
    symbols present. So this is an INSTRUMENT limitation, not a defect signal in either
    direction, and reporting these as PASS would have been a fabrication.
    ⚠️ **Nothing was restarted.** A relaunch would have resolved it, but the operator's PRODUCTION
    Claudesk (PID 4147) was running alongside the dev build, and
    `[[never-propose-brew-upgrade-to-verify-a-release]]` /
    `[[verify-self-dev-vs-prod-process-name-collision]]` both record that killing a Claudesk the
    agent did not launch destroys live operator work. **The relaunch is the operator's call.**
    ⚠️ The third outcome carries a SECOND blocker independent of staleness: the app sat on the
    project picker with **zero workspaces open**, and injecting into a live CC session would
    start a real turn in a real project. The subagent correctly declined rather than doing it.
  - [x] verify-human  <!-- status: done — operator reviewed and approved, 2026-09-22 -->
    ⚠️ **NOT auto-skipped — TWO gates fail.** (b) verify-self is not all-PASS (3 UNVERIFIED), and
    (c) the integration boundary APPLIES (condition 2 — `RightPanelHost.tsx` and `Workspace.tsx`
    back existing UI with user-visible behaviour change), which forbids the F11 skip path outright.
    The 2 CLI outcomes the agent PASSED are excluded from the checklist per the pre-filter rule.
    - [x] P2.verify-human.1 — relaunch the dev app, confirm the send controls exist  <!-- status: NOT-STARTED -->
    - [x] P2.verify-human.2 — send empties the editor + darkens the tab dot  <!-- status: NOT-STARTED -->
    - [x] P2.verify-human.3 — history ring populated, draft key cleared  <!-- status: NOT-STARTED -->
    - [x] P2.verify-human.4 — sent text reaches the CC pane (BOTH modes; ⇧⌘↵ must NOT submit)  <!-- status: NOT-STARTED -->
    - [x] P2.verify-human.5 — bare Enter still inserts a newline, does NOT send  <!-- status: NOT-STARTED -->
  - [x] verify-codify  <!-- status: done — promptSendRouting extracted + 10 tests -->
    ⚠️ **CODIFIED THE ONE APPROVED PROPERTY THAT HAD NO TEST — the SCOPING.** verify-human
    confirmed ⌘↵/⇧⌘↵ send from the Prompt panel; what nothing covered was that they are INERT
    everywhere else. That is a safety property (`injectCommand` has no retry and no pre-send
    cancel window), and it sat inline in `RightPanelHost`'s ~900-line keydown router where no
    test could reach it.
    **Extracted to `prompt/promptSendRouting.ts`** (`sendModeForChord`) so a test drives the real
    decision rather than a source-text shape
    (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`). 10 tests.
    ⚠️ **Mutation-proved, each mutant run INDIVIDUALLY:**
    | Mutant | Killed by |
    |---|---|
    | A — drop the panel-front guard | 2 tests |
    | B — drop the handler-registered guard | 2 tests |
    | C — UNWIRE the router from the host (the `planPanelChange` shape) | 1 test (live-caller guard) |
    ⚠️ Mutant C matters most: a pure module's own tests cannot see that nothing calls it — they
    call it themselves (`[[extracted-machine-needs-a-live-caller-guard]]`). Extraction CREATED
    that risk, so the caller assertion was written in the same change.
    ⚠️ **The extraction moved the chord-registry matcher path**, and the registry guard caught it
    in all THREE directions (imported / called / accounted). Repointed to the module the host
    actually calls; `promptSendChord.ts`'s predicates stay covered by their own suite and through
    the router.
    ⚠️ **Consuming-surface coverage (boundary rule):** the live-caller guard asserts
    `RightPanelHost.tsx` — the consuming surface — calls the router AND guards it with the
    null-check fall-through contract, so a non-send key is never swallowed.

- [x] Phase 3: Recover-from-history affordance  <!-- status: done -->
  **Observable outcomes:**
  - Browser: with a non-empty history ring and an empty draft, the Prompt panel shows a recover
    control; activating it and choosing the most recent entry puts that exact text back in
    `[data-testid="prompt-editor"]`.
  - Browser: recovering into a panel that already has a draft does NOT silently destroy it — the
    recovered text is appended or the operator is asked, never a bare overwrite.
  - CLI: `pnpm vitest run src/components/workspace/prompt/` exits 0 — a render test (NOT a `?raw`
    guard) asserts the control's resting DOM with an empty ring vs. a populated one.
    ⚠️ `renderToStaticMarkup` + `// @vitest-environment jsdom` per
    `docs/lessons/source-text-guards.md` §"The render-harness note, corrected"; the WP3 precedent
    `promptTabIndicatorRender.test.tsx` is the shape to copy.
  - [x] P3.1 Minimal recover affordance (task 4.4) — ⚠️ **the ring is the load-bearing part; a
        richer browser is additive later.** Scope to: show the ring, pick one, restore it. No
        search, no preview pane, no pinning.  <!-- status: NOT-STARTED -->
  - [x] P3.2 Decide and implement the non-destructive rule for recovering over a live draft.  <!-- status: NOT-STARTED -->
  - [x] P3.3 Render test for both resting states.  <!-- status: NOT-STARTED -->
  - [x] verify-auto  <!-- status: done — RE-RUN after the F12 back-loop; EXIT=0, 218 files / 2952 tests -->
    ⚠️ **RE-RUN after the confirm-then-overwrite reversal.** EXIT=0 at 218 files / 2952 tests.
    Substance checked: the append implementation is gone from live code (0 non-test
    `recoverInto` references), the WP3 funnel invariant holds (exactly ONE `saveDraft(` in the
    panel), and both new arm-ordering guards are present BY NAME.
    ⚠️ **CAUGHT A STALE DOC COMMENT THE GUARD COULD NOT SEE.** `PromptPanel.tsx:318` still read
    *"⚠️ APPENDS, never overwrites"* — directly above `applyRecover`, whose job is now precisely
    to overwrite. The guard strips comments (correctly, so prose cannot satisfy it), which is
    exactly why a comment asserting the OPPOSITE of the code was invisible to it. Corrected, then
    the whole module swept for other append-era prose: the four remaining mentions are deliberate
    HISTORY (quoting the ruling, recording why the reversal happened), not stale instructions.
    **Outcome substance checked, not just suite-green:** `prompt/` EXIT=0 (11 files / 126 tests).
    Both resting states confirmed BY NAME via `--reporter=verbose` (empty ring → no affordance;
    populated → toggle with count, collapsed at rest), asserted through a genuine
    `renderToStaticMarkup` + JSDOM render rather than a source grep.
    ⚠️ The non-destructive rule was additionally verified against an INDEPENDENT reimplementation
    (outside the shipped suite): both sides preserved in every case, empty buffer yields the entry
    with no leading separator. That guards the shipped assertions against being circular
    (`[[detector-scored-against-its-own-table-is-circular]]`).
  - [x] verify-self  <!-- status: done — 3/3 PASS in the LIVE app, 0 BLOCKING, 0 COSMETIC -->
    **All three outcomes PASS, observed in the running dev build** (fresh bundle, PID 41241) over
    the mcp-bridge WebSocket against a **scratch** workspace (`tmp/scratch/scratch-b`) — never a
    real project, and nothing was injected into any CC session.
    - [x] Recover from an EMPTY buffer — seeded a 3-entry ring; toggle rendered `▸ Recent (3)`
      with `aria-expanded="false"` and no list in the DOM; expanding showed all three newest-first;
      clicking item-0 left the editor holding exactly that entry, persisted to the draft key, list
      auto-collapsed.  <!-- status: done -->
    - [x] ⭐ **Recover over a LIVE draft APPENDS, never overwrites** — seeded
      `UNSENT-WIP-DO-NOT-DESTROY-98765`, recovered a DIFFERENT entry, and the buffer afterwards
      held `…98765\n\nENTRY-BRAVO…`. ⚠️ The bare-overwrite check (`doc === recoveredEntry`) was
      asserted FALSE explicitly, not merely implied.  <!-- status: done -->
    - [x] CLI `prompt/` — EXIT=0, 11 files / 126 tests, exit code read directly (no `time`, no
      pipe). The render test confirmed a GENUINE `renderToStaticMarkup` + JSDOM render, not a
      `?raw` guard, asserting both resting states plus a 2-vs-5 count fixture that guards against
      a vacuous length assertion.  <!-- status: done -->
    ⚠️ **The buffer reads used a POSITIVE CONTROL** — a sentinel written and read back through
    BOTH the CM6 `EditorView.state.doc` and the rendered `.cm-line` text before any "the buffer is
    empty" conclusion. That is the discipline `[[xterm-dom-reads-fake-a-blank-pane]]` exists for:
    without it, an instrument error and a real defect are indistinguishable.
  - [ ] verify-human  <!-- status: in-progress -->
    ⚠️ **NOT auto-skipped — gate (c) fails.** The integration boundary APPLIES (condition 2 —
    `PromptPanel.tsx` is an existing UI component with changed user-visible behaviour), which
    forbids the F11 skip path outright regardless of verify-self being all-PASS. The three
    verify-self PASSes are EXCLUDED from the checklist per the pre-filter rule; what remains is
    the product decision.
    - [x] P3.verify-human.1 — confirm-then-overwrite, as ruled  <!-- status: done — REBUILT and re-verified LIVE -->
      ⚠️ **OPERATOR RULING 2026-09-22 — REVERSES P3.2's append decision. DO NOT RE-LITIGATE.**
      Operator's words: *"don't append. instead, show a 'discard' confirmation that can 'cancel'
      the action before overwrite, if confirmed, just overwrite"*.
      **As ruled:** recovering into a NON-EMPTY buffer shows a confirmation naming the discard;
      **Cancel** aborts with the buffer untouched; **confirm** OVERWRITES. An EMPTY buffer keeps
      recovering straight through with no prompt (nothing to discard).
      ⚠️ I had explicitly rejected ask-first as over-built for "minimal" and chosen append. That
      reasoning is SUPERSEDED. The operator's shape keeps the destruction DELIBERATE (a confirm)
      while giving a CLEAN SWAP — append's real cost was the merged document, which I under-weighted.
    - [x] P3.verify-human.2 — affordance confirmed rendering  <!-- status: done — was an AGENT checklist error, not a defect -->
      ⚠️ **AGENT ERROR, NOT A DEFECT.** Operator: *"I don't see anything on scratch-b"* — correct,
      because there IS no ring for scratch-b: the verify-self subagent seeded one, then restored
      state and removed its fixture (as it reported). Live check confirms rings exist on
      **scratch-a** and **scratch-c** only, the recover toggle IS rendering, and scratch-c's draft
      visibly holds append-joined text. **The checklist named a project with no data** — my error
      in writing it, not a failure of the code. Re-present against a project that has a ring.
  - [x] verify-codify  <!-- status: done — dialog spec extracted + 7 tests, 3 mutants killed -->
    ⚠️ **CODIFIED WHAT THE LIVE CHECK PROVED AND NO TEST COVERED: the dialog's two
    SAFETY-CRITICAL PROPS.** `ConfirmModal` focuses the `variant: "primary"` button (so THAT is
    what Enter activates) and resolves Esc/backdrop to `escValue`. Both were inline JSX literals
    in the panel — unreachable by any test, and the exact prop class this project's gate cannot
    see (WP3 shipped TWO prop defects past a fully green 2859-test run). Moving `primary` onto
    "Discard" is a ONE-WORD change that makes Enter destroy the buffer, with no type error and
    nothing for a comment-stripped grep to catch.
    **Extracted to `discardConfirmSpec()`** so the props are driven by a real test. 7 new tests.
    ⚠️ **Mutation-proved, each run INDIVIDUALLY:**
    | Mutant | Killed by |
    |---|---|
    | A — `primary` moved onto Discard (Enter destroys) | 2 tests |
    | B — `escValue` → `"discard"` (Esc destroys) | 1 test |
    | C — panel reverts to an inline literal (spec fn unwired) | 1 test (caller guard) |
    ⚠️ Mutant C matters for the same reason as WP4's earlier extractions: a spec function nothing
    calls would leave these assertions testing a value the app never renders
    (`[[extracted-machine-needs-a-live-caller-guard]]`).
    **Consuming-surface coverage (boundary rule):** the caller guard asserts `PromptPanel.tsx` —
    the consuming surface — renders `ConfirmModal` with the extracted spec, and the arm-ordering
    guards assert the confirm arm reaches the dialog rather than the buffer.

## Current Node
- **Path:** Feature > review-quality
- **Active scope:** ⭐ **SHIPPED as `5af55f6`** (25 files). All three phases complete.
  ⚠️ **NOT PUSHED** — 13 commits now sit unpushed, and 5 of them are INHERITED from before this
  session, so a push publishes those too. The operator has not authorized one.
  ⚠️ **review-quality's diff window WILL break here** — anchor it by hand to `5af55f6` and
  confirm non-empty before spawning (see the carried warnings). Prior scope,
  retained: Phase 3 verify-codify. impl `[x]`, verify-auto `[x]` (RE-RUN post-back-loop,
  EXIT=0, 218 files / 2952 tests), verify-self `[x]`, verify-human `[x]` — **both leaves resolved
  after the F12 back-loop: the operator's confirm-then-overwrite ruling is implemented and was
  driven LIVE (Cancel → buffer byte-identical; Discard → clean swap).**
  ⚠️ Phases 1 and 2 are CLOSED. impl `[x]` (7), verify-auto `[x]` (EXIT=0, 214 files /
  2920 tests), verify-self `[x]`-equivalent (2 CLI PASS + 3 browser UNVERIFIED on a stale bundle),
  verify-human `[x]` — **the operator relaunched the dev app and approved all five leaves**
  (2026-09-22), which CLOSES the three stale-bundle UNVERIFIED items by human observation.
  ⚠️ Phase 1 is CLOSED: every child `[x]`, though verify-human was closed by OPERATOR SKIP with
  its three leaves unrun (see that node — the skip is recorded as a skip, not as passes)
- **Blocked:** none
- **Carried to `/release`:** installed-build regression check for the four `injectCommand`
  consumers (auto-resume, skill row, recycle, supervisor) — Phase 1's unit tests cannot reach it
  and the human gate that would have was skipped
- **Unvisited:** Phase 1 verify-human → verify-codify, then Phase 2 (panel wiring — thread
  `cc_session_id`, buttons, hotkeys, clear-and-archive), then Phase 3 (recover from history)
- **Open discoveries:** none

## Carried warnings for the close

- ⚠️ **review-quality's diff window WILL break here.**
  `SURFACE-2026-09-17-REVIEW-QUALITY-DIFF-WINDOW-BREAKS-ON-A-PARKED-FEATURE` (medium-high) — this
  project commits WIP files at finalize, so at review time the WIP is untracked, `BASE_SHA`
  resolves to nothing, and the reviewer reports "no findings" having examined an EMPTY diff.
  **Anchor the window by hand and confirm it is non-empty before spawning the reviewer.** Worked
  around twice already (WP2, WP3).
- ⚠️ **Dictation stays ASSUMED WORKING** by operator ruling (2026-09-22) — macOS text-input
  services do not engage under `pnpm tauri:dev`. Do not raise it; the reopening condition is an
  operator report *after a release* with F-a complete.
- ⚠️ **At finalize, re-read the operator's own words** in
  `SURFACE-2026-09-15-STAGING-AREA-FOR-PROMPT-INPUT` before closing it — the **durability** half is
  what the pain point was about, not the WBS being ticked.
- **A design prior is owed:** `group-surfaces-by-the-question-they-answer`, proposed at WP3
  verify-human and left unwritten because the operator did not ratify the why. Raise once at the
  next natural checkpoint.
- ⚠️ **`verify:auto` cannot see JSX props** — WP3's two shipped defects were both props (a theme
  routed through `extensions`, and `basicSetup={false}`) past a fully green 2859-test gate. Phase 2
  adds props to a CM6 host; the render tests, not the gate, are what can catch a prop defect.

## Test Triage — offInvariantGuard.test.ts → "the chord arm's content selector reaches panelHost.ts and does not shrink"

Classification: **Obsolete test** — the assertion's expected value is superseded by an intentional
addition; the test itself is correct and its substantive arms still hold.
Confidence: **high**. One plausible explanation, statable in a sentence: verify-codify extracted
`prompt/promptSendRouting.ts`, which the arm's exported-identifier selector correctly picks up, so
the chord-module count moved 17 → 18.
Evidence: `offInvariantGuard.test.ts:1119` asserts `.toBe(17)`; the only new chord module since
that number was set is `promptSendRouting.ts`, added this phase. ⚠️ This is a GROWTH, and the
guard's own comment demands growth be recorded deliberately rather than auto-bumped — a SHRINK is
what silently disarms the arm.
Action: Confirmed the guard's SUBSTANTIVE arms (including the ungated-workflow-chord offender
predicate) still pass against the new module BEFORE editing the count — only the size assertion
needed changing. Bumped 17 → 18 with the reasoning recorded inline at the assertion.
⚠️ Second time this fired in this WP (16 → 17 at Phase 2 build for `promptSendChord.ts`), which is
the tripwire working as designed, not noise.

## Re-verify gate (F12 back-loop, 2026-09-22) — BOTH ARMS DRIVEN IN THE LIVE APP

⚠️ **Not unit tests — the real panel, over the mcp-bridge, on `scratch-c`** (which had a
non-empty buffer AND a 1-entry ring: the exact confirm case). HMR confirmed to have taken the
reversal first (`promptRecover.ts` re-fetched with new timestamps; `ConfirmModal.tsx` newly
loaded).

| Step | Observed |
|---|---|
| Click a ring entry over a NON-EMPTY buffer | Dialog opened; **buffer byte-identical**, not touched |
| Dialog content | "Discard current prompt?" + the discard message + Cancel/Discard |
| **Cancel** | Dialog closed; editor AND stored draft **byte-identical to before** |
| **Discard** | **Clean swap** — old text gone, recovered entry alone, no merge; list auto-collapsed |

⚠️ **State restored:** the confirm test overwrote a REAL draft in `scratch-c`. The original was
written back to storage and verified. The on-screen CM6 buffer still shows the recovered text
until that panel re-seeds (project switch / relaunch); the debounce only writes on an EDIT, so it
will not clobber the restore.

## A MUTANT SURVIVED, AND THE HOLE IS NOW CLOSED (2026-09-22)

⚠️ **Replacing the panel's `setPendingRecover(action.text)` with `applyRecover(action.text)` — i.e.
applying the recovered text WITHOUT ever showing the dialog — passed ALL 130 tests.** Every guard
asserted that `planRecover` and `ConfirmModal` were PRESENT; none asserted the confirm arm
actually REACHES the dialog. That is the proven-machine-with-an-unguarded-caller shape this
project has shipped a CRITICAL from twice (M11 WP4), and a decision module's own tests
structurally cannot see it.
**Closed by two new guards** asserting the arm→action ORDER (not mere presence — `applyRecover(`
legitimately occurs on the `replace` arm and in the dialog handler, so a `toContain` would pass on
the mutant, per `[[raw-guard-substring-must-be-unique-to-its-site]]`). Re-running the mutant now
kills both.

## Code-Quality Review — fa-wp4-send-and-stage (2026-09-22)

**0 CRITICAL · 3 MAJOR · 4 MINOR.** Diff window HAND-ANCHORED to `9264a6f..5af55f6` (25 files,
2981 insertions) — ⚠️ both documented BASE_SHA derivations failed: `main..HEAD` is empty (work is
on main) and the WIP-file fallback resolved to the SHIP COMMIT ITSELF. It happened to be correct
only because WP4 landed as one commit; across two it would have reviewed half the feature.

### Reviewer's verdict on the three MAJORs — ALL CONFIRMED BY MUTATION, ALL FIXED

- ⭐ **MAJOR-1 — `CALL_SYMBOLS`'s `string | string[]` widening was DEAD CAPABILITY.** Zero
  array-valued entries; both send chords resolve to the one `sendModeForChord` symbol, so the gap
  my own Discoveries entry claimed was "fixed IN PLACE" was **still open**. ⚠️ **Mutation-confirmed
  by me before accepting:** deleting `sendModeForChord`'s `isStageOnlyChord` branch — which kills
  ⇧⌘↵ outright — left all 17 registry assertions GREEN. **Fixed:** widening removed (it described
  a coverage it never had), limit documented at the map, and a new
  `both send predicates are reachable from the router` block added that derives its expectation
  FROM THE REGISTRY (a third send chord makes it fail until wired). The mutant now dies to all 3.
- **MAJOR-2 — the count justification did not add up.** Header said "17" while enumerating 16
  items and asserting 18; growth notes were out of chronological order; and my 16→17 paragraph
  spliced MID-SENTENCE into the pre-existing chordRegistry note, so "It is in scope for this arm
  on purpose" attached to the wrong module. ⚠️ The whole value of that guard is making the next
  maintainer reason deliberately — I made it harder than no comment. **Fixed:** rewritten as an
  oldest-first growth log with an enumeration that sums to 18.
- **MAJOR-3 — `promptSendWiring.test.tsx` re-implements the sequence rather than driving it.**
  The reviewer is right that pairing it with source-order guards does NOT close the loop, and
  that two arms (`blank send`, `no live CC session`) asserted pure test-local logic
  (`if (!sessionId) return false`) — nothing about shipped code. **Partially fixed:** both dead
  arms DELETED (13 → 11 tests) rather than left reading as coverage, and the disclosure sharpened
  to say plainly what the file does and does not prove. ⚠️ The component-level version is
  reachable via `onRegisterSend` and is **backlogged, not silently accepted**. Those two behaviours
  remain covered where it counts: `planSend`'s blank rule in `sendStagedDraft.test.ts`, and the
  no-session case by the disabled-button render test.

### MINORs

- **Duplicated doc comment on `applyRecover`** (two stacked blocks, leftover from the
  append→overwrite reversal) — **FIXED**, collapsed to one.
- **Comment DUPLICATION across six files** (the M11-WP4 four-call-sites rationale restated 4×, the
  live-caller provenance 6×, "no retry and no pre-send cancel window" 4×) — ⚠️ **NOT fixed here,
  BACKLOGGED.** The finding is correct and it is the expensive half of the budget rule, but the
  canonical-home-plus-pointers collapse spans files this WP did not author. Doing it inside a
  ship-commit cleanup would widen the diff past what was reviewed.
- **`planRecover` is 2 lines under 58 lines of header** — acknowledged, NOT changed. The reviewer
  itself calls the decomposition "otherwise defensible"; the module earns its place as the seam
  the caller-order guards attach to, which is what caught the real defect.
- **React key mixed index and content** — **FIXED**: keyed on content with the index as a
  trailing tiebreak, so a prepend no longer re-keys every row.

### Assessment (reviewer, verbatim summary)

*"Careful, well-built work that advances the codebase rather than accruing debt… The three MAJOR
findings share one root: guards whose STATED coverage exceeds their ACTUAL coverage… None is a
shipped defect, but each weakens a tripwire that future work will lean on."* ⚠️ That root-cause
reading is the most useful thing in this review and is worth carrying forward: **every one of the
three was a guard I wrote, believed, and documented as stronger than it was.**

### If you disagree

Dismiss any finding by marking its line `[DISMISSED]` in this section before `feature-finalize`
archives the WIP.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SURFACED-2026-09-22] Phase 2 / P2.4 — **`chordRegistry.test.ts`'s `CALL_SYMBOLS` map assumed
ONE predicate per matcher module.** `promptSendChord.ts` exports two (`isAutoSubmitChord`,
`isStageOnlyChord`), so the forward guard could only prove one was called — a host wiring
auto-submit but not stage-only would have passed. Fixed IN PLACE rather than worked around: the
map's value type widened to `string | string[]` and the assertion loops over all mapped symbols.
⚠️ Not backlogged — the gap was closed in this WP, and the widened form is what a future
multi-predicate module needs. Recorded because the ONE-symbol assumption was invisible until a
module violated it.

[SURFACED-2026-09-22] Phase 2 / P2.2 — **`src/App.css` defines almost no CSS custom properties**
(a `grep` for `--name:` declarations finds exactly ONE, `--diff-commits-h`). The file styles
everything with literal hex. A first draft of the action-row CSS used `var(--bg-elevated)`,
`var(--accent)` etc. by analogy with other codebases; those would have silently resolved to
nothing and shipped an unstyled row that no test would catch. Rewritten against the real palette
(`#1a1a1a` / `#3c3c3c` / `#9b9b9b` / `#d4d4d4` / `#6ea8ff`, matching `.panel-tab`).
⚠️ Worth knowing before any future styling work here: **this project has no design-token layer.**
