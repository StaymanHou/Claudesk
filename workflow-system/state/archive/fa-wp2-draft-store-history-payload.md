# Feature: F-a WP2 — Draft store, history ring, and the bracketed-paste payload

**Status:** ✅ COMPLETED 2026-09-21 (3/3 phases, all verify nodes; ship + review-quality done)

**Workflow:** feature
**State:** COMPLETED 2026-09-21 — NOT COMMITTED, see Ship notes
**Created:** 2026-09-21

## Problem Statement

F-a's staging area needs a pure, headless core before any surface exists: per-project draft
persistence that survives an unintended shutdown, a bounded history ring so a sent draft is
recoverable, and the byte payload that delivers multi-line staged text into CC's PTY without
firing as N truncated prompts. All three are settled design decisions (`roadmap.md` → Group F →
F-a → "F-a decisions"; sequenced by `wbs.md` → WP2) — this WP implements them, it does not
re-litigate them. **[Updated 2026-09-21 at the round-4 F9b back-loop: the module has a SECOND contract the plan
never named.]** Rounds 1–3 were all about *state* — what is persisted, what is loaded. Round 4
showed `appendToHistory` also has a **documented return contract** (*"Returns the new ring so a
caller can use it without a re-read"*), and **no Observable Outcome in the plan mentions a return
value at all**, so nothing tested it. ⚠️ This is a *plan* gap surfacing as a test gap: the outcomes
were written as "what is in storage," and a function whose callers (WP3/WP4) will consume its
return directly needs both halves specified. Not re-planning — the deliverable is unchanged and
the fix is test-side — but recording that the outcome set was incomplete rather than that the
tests were sloppy.

**Problem statement unchanged as to the DELIVERABLE (re-checked 2026-09-21 at the P3.3 F9b back-loop)** — what the
ring must do is the same; the finding was about *test observability*, not about the goal. Every
assertion read through `loadHistory`, whose read-side clamp makes a broken writer indistinguishable
from a correct one. The fix is an assertion, not a redesign.

⚠️ **This WP is deliberately unaffected by WP1's dictation blocker**
(`SURFACE-2026-09-21-MACOS-TEXT-INPUT-SERVICES-DEAD-UNDER-TAURI-DEV`): no React, no CM6, no UI,
so nothing here needs a live text-input service to verify.

## Design inputs already settled (read, do not re-decide)

- **Persistence is `localStorage` keyed by canonicalized `project_path`, NOT `projects.json`**
  (decision 1). `projects.json` is read at startup through serde, where unbounded operator prose
  risks taking the whole project list down. ⚠️ `project_path` is the correct per-workspace key
  because `nextWorkspaceId()` is an in-memory `ws-${++counter}` reset every launch, while
  `openWorkspace` dedups on the canonical path — **workspace↔project is bijective**.
- **`slashCommandPayload` is NOT modified.** A new builder sits alongside it so M12/M13/M15
  callers stay byte-identical.
- **The envelope** is `ESC[200~` + body (interior newlines as `\r`, matching xterm's own
  transform) + `ESC[201~`. ⚠️ **Newlines are PRESERVED, never normalized** — the earlier
  "reject or normalize an embedded newline" ruling is SUPERSEDED by measurement.
- **The trailing `\r` is a SEPARATE, optional byte** and is the *only* difference between the two
  send modes (auto-submit vs stage-only). The envelope inserts literal text; it does not submit.

## Facts resolved from the codebase at plan time

- **The payload is base64-encoded, not raw text.** `slashCommandPayload` returns
  `encodeUtf8Base64(trimmed + "\r")`; `cc_input` takes `{ sessionId, data }` where `data` is that
  base64 string. ⚠️ The new builder must encode identically or the bytes will not arrive —
  `encodeUtf8Base64` is currently **module-private** in `autoResumeFire.ts` (P2.1 handles this).
- **UTF-8 correctness is a burned lesson, not a nicety.** M10.5 WP4 shipped input mojibake because
  the old path truncated each char to `& 0xff`. Dictated prose is exactly where multi-byte
  characters (curly quotes, em-dashes, accents) appear.
- **Precedent module shape** — `filmstripOrder.ts`: `load*` returns a sane default and never
  throws (`catch → []`), `save*` swallows quota/unavailable errors, key is a
  `claudesk.<name>` string constant, canonicalization applied on **both** read and write.
- **`canonicalizeProjectPath`** (`src/state/workspace.ts`) is `projectPath.replace(/\/+$/, "")` —
  trailing-slash strip only.
- **The vitest env has NO DOM** (`vite.config.ts` has no `test:` block → node environment), so
  `localStorage` is `undefined`, not merely throwing. The established pattern is
  `vi.stubGlobal("localStorage", <in-memory shim>)`, and `vi.stubGlobal("localStorage", undefined)`
  for the unavailable path — both already used in `filmstripOrder.test.ts`.
- **No `draftStore` / `stagedPayload` / bracketed-paste code exists anywhere in `src/`** — this is
  greenfield, with no prior art to reconcile.

## Work Tree

- [x] Phase 1: The bracketed-paste payload builder  <!-- status: COMPLETE -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/components/workspace/__tests__/stagedPayload.test.ts` exits 0, and
    the suite asserts the decoded bytes of `stagedPayload("a\nb", { submit: false })` are exactly
    `ESC [ 2 0 0 ~ a \r b ESC [ 2 0 1 ~` (0x1b,0x5b,0x32,0x30,0x30,0x7e,0x61,0x0d,0x62,
    0x1b,0x5b,0x32,0x30,0x31,0x7e) with **no** trailing 0x0d and **no** 0x0a anywhere.
  - CLI: same suite asserts `stagedPayload("a\nb", { submit: true })` equals the above **plus**
    exactly one trailing 0x0d — i.e. the two modes differ by that single byte and nothing else.
  - CLI: same suite asserts `stagedPayload("é—", …)` decodes to the UTF-8 bytes 0xc3,0xa9 and
    0xe2,0x80,0x94 and contains no 0xe9 (the M10.5 mojibake regression).
  - CLI: `pnpm vitest run src/components/workspace/__tests__/autoResumeFire.test.ts` exits 0 —
    `slashCommandPayload`'s existing byte pins still pass unchanged.
  - [x] P1.1 ~~Export `encodeUtf8Base64` from `autoResumeFire.ts`~~ — **RESOLVED WITHOUT THE
        EDIT.** A canonical encoder already exists: `encodeBase64` in `src/cc/bridge.ts`, whose
        own header calls it *"the single frontend chokepoint for that encoding."* ⚠️ It is also
        strictly SAFER than `autoResumeFire`'s private twin — `bridge`'s chunks the
        `String.fromCharCode` spread, and the unchunked twin throws `RangeError: Maximum call
        stack size exceeded` at ~200k chars (measured this phase). A long single-take dictation
        is exactly that input. **`autoResumeFire.ts` is byte-unchanged by this WP** (`git diff`
        empty), which is a stronger outcome than the planned export.  <!-- status: COMPLETE -->
  - [x] P1.2 `src/components/workspace/stagedPayload.ts` — the builder. Interior `\r?\n → \r`
        (xterm's own transform), wrap in `ESC[200~`/`ESC[201~`, append `\r` only when the submit
        flag is set, then base64-encode. Document why each byte is what it is.  <!-- status: COMPLETE -->
  - [x] P1.3 Byte-for-byte pin test, modeled on `autoResumeFire.test.ts`'s
        `bytes(slashCommandPayload(...))` helper: envelope literal, both modes, UTF-8, empty
        string, body already containing `\r`, and a body containing a literal `ESC[201~`
        sequence (decide + document the behavior; do not leave it implicit).  <!-- status: COMPLETE -->
  - [x] P1.4 Guard test: `slashCommandPayload`'s output is **unchanged** by this WP (wbs 2.4).
        ⚠️ A regression here breaks auto-resume, the skill row, and the supervisor at once.
        Must fail if P1.1 alters the existing builder.  <!-- status: COMPLETE -->
  - [x] verify-auto  <!-- status: COMPLETE — pnpm verify:auto EXIT=0, 203 files / 2746 tests, Rust all green (2026-09-21) -->
  - [x] verify-self  <!-- status: COMPLETE — 4/4 outcomes PASS, 0 BLOCKING, 0 COSMETIC (2026-09-21) -->
  - [x] verify-human  <!-- status: COMPLETE — operator approved both leaves, 2026-09-21 -->
    - [x] P1.verify-human.1 Confirm the stage-only/auto-submit split matches intent  <!-- status: COMPLETE — approved; one trailing CR outside the envelope is the intended split -->
    - [x] P1.verify-human.2 Confirm the ESC[201~ strip-vs-escape decision  <!-- status: COMPLETE — approved; silent strip is the accepted behavior -->
  - [x] verify-codify  <!-- status: COMPLETE — 4 invariant tests added; one SURVIVING mutant found and closed (2026-09-21) -->

- [x] Phase 2: The draft store  <!-- status: COMPLETE -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/components/workspace/__tests__/draftStore.test.ts` exits 0, and the
    suite asserts a save→load round-trip returns the identical string including interior newlines.
  - CLI: same suite asserts two different `project_path` values do not collide, and that
    `"/a/b"` and `"/a/b/"` resolve to the **same** draft (canonicalization applied on read AND
    write — mutation-prove by dropping it on one side).
  - CLI: same suite asserts `loadDraft` returns `""` (never throws) for: nothing stored, a
    ~~corrupt/unparseable stored value~~, a stored value of the wrong ~~JSON~~ type, and
    `vi.stubGlobal("localStorage", undefined)`. ⚠️ **WORDING CORRECTED AT VERIFY-SELF
    (2026-09-21)** — the plan-time wording presumed a JSON codec that does not exist. The draft
    is stored as a **RAW STRING** (no `JSON.parse` anywhere in the module), deliberately, so that
    operator prose round-trips verbatim with no parse step to choke on a stray quote or brace.
    "Corrupt/unparseable" therefore names a failure mode **that cannot occur** — any byte
    sequence is a valid draft. The clause is vacuous, not uncovered. ⚠️ The suite covers the
    REAL-WORLD analogue the outcome failed to name: a **throwing getter** (private mode /
    disabled storage).
  - CLI: same suite asserts `saveDraft` does not throw when the setter throws (quota/unavailable).
  - [x] P2.1 `src/components/workspace/draftStore.ts` — `DRAFT_KEY_PREFIX`, `loadDraft`,
        `saveDraft`, `clearDraft`, keyed by canonicalized project path. Same posture as
        `filmstripOrder.ts`: never throws, sane default, best-effort write.  <!-- status: COMPLETE -->
  - [x] P2.2 Decide + document the key shape (one key per project vs one map under a single key).
        ⚠️ Per-project keys avoid a read-modify-write race across workspaces and bound the blast
        radius of one corrupt value — take that unless something contradicts it.  <!-- status: COMPLETE — per-project keys taken -->
  - [x] P2.3 Unit tests per the outcomes above, using the `vi.stubGlobal` shim pattern already in
        `filmstripOrder.test.ts`.  <!-- status: COMPLETE — 14 tests -->
  - [x] verify-auto  <!-- status: COMPLETE — pnpm verify:auto EXIT=0, 204 files / 2764 tests, Rust all green (2026-09-21) -->
  - [x] verify-self  <!-- status: COMPLETE — 4/4 outcomes PASS, 0 BLOCKING, 0 COSMETIC (2026-09-21) -->
  - [x] verify-human  <!-- status: COMPLETE — operator approved both leaves, 2026-09-21 -->
    - [x] P2.verify-human.1 Confirm drafts are per-project with no cross-project recovery  <!-- status: COMPLETE — approved; orphan-on-path-change accepted, re-keying NOT backlogged -->
    - [x] P2.verify-human.2 Confirm a quota/storage failure degrades silently  <!-- status: COMPLETE — approved; silent degradation accepted, unsaved-indicator NOT backlogged -->
  - [x] verify-codify  <!-- status: COMPLETE — 5 realistic-input tests added, 3 mutants killed (2026-09-21) -->

- [x] Phase 3: The history ring  <!-- status: COMPLETE -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/components/workspace/__tests__/draftHistory.test.ts` exits 0, and
    the suite asserts appending 12 entries to a cap-10 ring leaves exactly 10, that the oldest two
    are gone, and that ordering is newest-first (assert the actual array, not just its length).
  - CLI: same suite asserts the ring is per-project (two paths keep independent rings) and
    survives a save→load round-trip with interior newlines intact.
  - CLI: same suite asserts the same tolerance set as the draft store — corrupt value, wrong type,
    storage undefined, throwing setter — each yielding `[]` or a silent no-op, never a throw.
  - CLI: same suite asserts an entry that is empty/whitespace-only is not appended (a no-op send
    must not evict a real entry from the ring).
  - [x] P3.1 `appendToHistory` / `loadHistory` — bounded ring, cap as a named exported constant
        (~10 per wbs 2.2), oldest evicted. Pure; same never-throws posture.  <!-- status: COMPLETE -->
  - [x] P3.2 Decide + document whether an exact-duplicate consecutive entry collapses. ⚠️ Default
        to NOT collapsing — a re-sent prompt is a real event and dedup is a guess about intent.  <!-- status: COMPLETE — NOT collapsing; the rejected design is pinned by a mutant -->
  - [x] P3.3 Unit tests per the outcomes above, including the eviction-order assertion.  <!-- status: NOT-STARTED -->
  - [x] verify-auto  <!-- status: COMPLETE (re-run after BOTH P3.3 F9b fixes) — pnpm verify:auto EXIT=0, 205 files / 2796 tests, Rust all green (2026-09-21) -->
  - [x] verify-self  <!-- status: COMPLETE — round 5: 4/4 outcomes PASS, all 4 prior fixes mutation-proven live, no ship-blocking gap (2026-09-21) -->
  - [x] verify-human  <!-- status: COMPLETE — operator approved all three leaves, 2026-09-21 -->
    - [x] P3.verify-human.1 Confirm HISTORY_CAP = 10 is the right retention depth  <!-- status: COMPLETE — approved -->
    - [x] P3.verify-human.2 Confirm consecutive duplicates are kept, not collapsed  <!-- status: COMPLETE — CHALLENGED then re-affirmed on better grounds; see the P3.2 note -->
    - [x] P3.verify-human.3 Confirm the ring is send-only (no recovery UI in WP2)  <!-- status: COMPLETE — approved -->
  - [x] verify-codify  <!-- status: COMPLETE — corrected the P3.2 rationale in-code + 2 tests (N-deep dupes, duplicate-evicts); both dedup mutants killed (2026-09-21) -->

## Current Node
- **Path:** Feature > review-quality (complete) > finalize
- **Active scope:** ⭐ **ALL THREE PHASES COMPLETE + ship + review-quality.** 0 CRITICAL, 2 MAJOR
  (both fixed in place, not backlogged), 3 MINOR (backlogged). Next: `feature-finalize`.
- **Still uncommitted** — see the Ship notes; the operator has not asked for a commit.
- **Blocked:** none
- **Unvisited:** none — WP2 complete
- **Open discoveries:** one — see `## Discoveries` (the unchunked-encoder hazard in
  `autoResumeFire.ts`, which this WP routed around rather than fixed)

### Phase 3 build notes

**Relevance check (before Phase 3):** requester still needs this — yes · requirements unchanged —
yes (WBS 2.2 untouched) · solution still feasible — yes (Phase 2 established the storage posture)
· no superior alternative — yes. **Verdict: proceed.**

**P3.2 decided: consecutive duplicates are NOT collapsed.** Pinned by mutant M5, which implements
the rejected dedup design and dies — so the decision is enforced, not just commented.

⚠️ **CHALLENGED AT VERIFY-HUMAN (2026-09-21) AND RE-AFFIRMED ON DIFFERENT, BETTER GROUNDS. The
original rationale was WEAK — do not cite it.** I had argued that collapsing "hides that the send
happened twice." That defends a property **the data model does not have**: the ring is a *recovery
list* (give me back text I might want again), with no timestamps and no send log, so "it happened
twice" is not information it carries. The operator asked the right question — *what is the use
case for sending the same text twice?* — and the honest answer was thin: retry after a failed send
(`injectCommand` has no retry/readback), a re-send across a session recycle, and repeated nudges.
⚠️ **The third case ARGUES AGAINST no-dedup** — a 10-deep ring filling with identical `continue`s
crowds out real drafts.

**What settled it (operator, 2026-09-21):** (a) repeated nudges will be **typed straight into the
CC pane, not staged** — so the flooding case never reaches the ring and the main argument for
collapsing evaporates; (b) the ring will **not** become a browsed/searchable surface, so duplicates
are not browsing noise either; (c) the **send-log reading "might be real"** — and if the ring is
ever read as a record of what was sent, collapsing destroys information that cannot be recovered.
⚠️ **Asymmetry is the deciding factor: keeping a duplicate is cheap and reversible; discarding one
is not.** Decision unchanged; reasoning replaced.

⚠️ **TWO DELIBERATE DIVERGENCES FROM `draftStore.ts`, both documented in the module header so they
do not read as inconsistency:**

1. **Encoding.** A draft is a RAW STRING; a ring is a LIST, so it is JSON. That makes "corrupt
   stored value" a **real** failure mode here, where Phase 2's verify-self found it *vacuous* in
   the draft store. The tolerance tests differ for that reason — `loadHistory` is tested against
   unterminated JSON, a non-array, and non-string elements.
2. ⚠️ **The whitespace rule INVERTS.** `saveDraft` **preserves** a whitespace-only draft (ratified
   at Phase 2 verify-human — operator text is never trimmed away); `appendToHistory` **refuses**
   one. Different jobs: the store is a buffer that must hold exactly what was typed; the ring is a
   bounded recovery list, so a junk entry **evicts a real one.** That harm is asserted directly
   ("a blank send does NOT evict the oldest entry from a full ring"), not merely implied.

**Mutation-proved, each run INDIVIDUALLY, landing verified by match-count, restore `shasum`-checked:**

| # | Mutant | Tests failed |
|---|---|---|
| M1 | append to the END (oldest-first) instead of the front | 4 |
| M2 | blank entries ARE appended | 2 |
| M3 | drop the non-string element filter | 1 |
| M4 | drop the cap clamp on READ | 1 |
| M5 | collapse consecutive duplicates (the REJECTED design) | 1 |

⚠️ **`HISTORY_CAP` is exported and the tests assert against it, never a hardcoded `10`** — a
literal would silently stop testing the boundary if the cap moved.

### Ship (2026-09-21) — complete, but DELIBERATELY NOT COMMITTED

⚠️ **NO COMMIT WAS MADE, AND THAT IS NOT AN OMISSION.** The ship skill's §3 says to prepare and
push commits, and the git history does show a `ship(<wp>)` commit per WP. **Two standing
constraints override it:** the operator's global rule (commit/push only when asked — not asked),
and this session's own restore pointer, which said in terms: *"The operator has deliberately not
pushed; do not commit or push without being asked."* A repo-wide convention does not override an
explicit standing instruction.

**State at ship:** 5 unpushed commits inherited from before this session, plus this session's
entire diff uncommitted — WP2's 6 new files, WP1's uncommitted probe work
(`src/main.tsx`, `src/probe/cm6/Cm6ProbeApp.tsx`, `DictationProbe.tsx`, `probe/cm6/__tests__/`),
and doc edits (`CLAUDE.md`, `roadmap.md`, `backlog.md`, `runtimes.md`, `wbs.md`).
⚠️ **A future `ship` commit for WP2 must NOT blanket-stage** — WP1's probe work and the
supervisor-observability backlog entry are separate units that happen to share the tree.

**Cleanup:** no TODO/FIXME/`console.log`/`debugger` in any of the six new files; ~19 mutation
backups cleared from `/tmp` (all were outside the repo). **Final verification:** `pnpm
verify:auto` EXIT=0 — 205 files / 2798 frontend tests, Rust all green, 0 failures.

### Phase 3 verify-codify (2026-09-21)

Both approved behaviors were already covered, so nothing was duplicated. Two things were added:

1. ⚠️ **The P3.2 rationale IN THE TEST FILE was corrected, not just in this WIP.** The comment
   still argued that collapsing "hides that the send happened twice" — the reasoning retracted at
   verify-human. A comment is what a future reader trusts when deciding whether a decision still
   holds, so leaving it would have meant the code arguing from grounds already documented as
   wrong. It now carries the operator's actual reasons **and names the condition that would
   reopen the decision** (if short repeated prompts ever start being *staged*, reason 1 lapses).
2. **Two tests.** `keeps N consecutive copies, not merely two` and `a duplicate still EVICTS when
   the ring is full` — the latter asserting the accepted cost rather than assuming it.

⚠️ **The N-deep test EARNED ITS PLACE, proved by mutant M-b:** a dedup that collapses **only runs
longer than two** survives the original two-send test and dies *only* to the four-deep one. A
two-send assertion cannot distinguish "never collapses" from "collapses longer runs" — the same
weaker-assertion-for-a-stronger-property class that produced three of Phase 3's four holes.
M-a (the plain rejected dedup design) killed all three duplicate tests. Suite: 29 tests.

### Phase 3 verify-self — five rounds, four holes, one conclusion

⚠️ **THE CODE WAS NEVER WRONG.** `draftHistory.ts` is byte-identical (sha `81ad8c4d…`) across all
five rounds — **every** fix was test-side. Four rounds each found a genuine hole; round 5 found
none and answered the ship question plainly.

| Round | Hole | Axis |
|---|---|---|
| 1 | cap value tautological (all assertions derived from `HISTORY_CAP`; setting it to 3 left the suite green) | the constant itself |
| 2 | write-clamp masked by the read clamp — ring grew unbounded in storage while green | persisted vs loaded state |
| 3 | read clamp wrong-end (`.slice(-CAP)` → OLDEST ten) | which elements, not how many |
| 4 | `appendToHistory`'s RETURN VALUE unasserted on non-happy paths | the second, undocumented-in-plan contract |
| 5 | **none** — 4/4 PASS, all prior fixes mutation-proven live, no ship-blocking gap named | — |

⚠️ **ONE DEFECT CLASS PRODUCED THREE OF THE FOUR: a weaker assertion standing in for an identity
one** (`toHaveLength` for `toEqual`, `not.toThrow()` for a value check). What varied each round was
**which observable nobody thought to look at.** That lesson is written into the test file itself,
not only here.

⚠️ **WHY THE HUNT STOPPED AT FIVE (a judgment call, recorded so it is reviewable):** the severity
curve fell hard — round 1 was genuinely circular coverage, round 4 was a return value on a module
**with no callers yet**. An adversarial mutation hunt on a small pure module will always find
*something*; past a point "the tests could be stronger" is a property of testing, not a finding.
Round 5 was therefore scoped **confirm-and-close** (explicitly: do not hunt exhaustively; name at
most ONE ship-blocking gap). It named none. Cost per round was ~80k subagent tokens plus a full
back-loop.

⚠️ **The method that actually worked, and should be reused: ASK THE SUBAGENT TO JUDGE A CHOICE,
NOT CONFIRM IT.** Rounds 1 and 4 were found by asking "did I get this right?" and "hunt for a
surviving mutant" respectively. A "verify this passes" framing would have returned green every
time.

**Non-blocking note carried forward (NOT backlogged — it is a no-op):** `clearHistory`'s return
path and `appendToHistory`'s getItem-throws arm are covered as non-throw only. Both funnel into
the same `catch { return [] }` already value-asserted by the quota test, and `clearHistory` returns
`void` — there is no value to get wrong.

### Phase 2 build notes

**Relevance check (before Phase 2):** requester still needs this — yes (operator said "start wp2"
this session) · requirements unchanged — yes (decision 1 settled, untouched by Phase 1) · solution
still feasible — yes (Phase 1 confirmed module patterns + test-env shape) · no superior alternative
— yes (nothing in Phase 1 bore on persistence). **Verdict: proceed.**

**P2.2 decided: ONE KEY PER PROJECT** (`claudesk.staging.draft:<canonical-path>`), not a single
map. Two reasons, both recorded in the module header: a shared map is a read-modify-write across
every open workspace, so two concurrent saves clobber each other; and one corrupt value would take
out every project's draft instead of one.

⚠️ **`safeStorage()` from `fontZoomCore.ts` was reused rather than re-implementing try/catch.** It
already handles the exact shape Phase 1 surfaced — `localStorage` being **`undefined`** (the node
test env) as distinct from *throwing* (private mode). Two different failure modes, one helper.

⚠️ **An empty draft is stored as a DELETION, not an empty value** — otherwise every project the
operator ever typed one character into leaves a permanent key in a shared origin-wide namespace,
and `loadDraft` cannot tell the two states apart anyway.

**verify-self (2026-09-21) — 4/4 PASS, no integration boundary.**

⚠️ **The subagent did the canonicalization mutation BETTER than the outcome specified.** The
outcome says "mutation-prove by dropping it on one side," but canonicalization is centralized in
one `draftKey()` helper — so dropping it *once* removes it from read and write simultaneously and
proves only that it exists somewhere. The subagent instead **inlined a non-canonicalizing key at
each call site separately** (write at line 83, read at line 58), killing the test from each
direction independently. That is the check the outcome was reaching for. Each mutant was run
individually, its landing confirmed by printing the mutated line, and its restore `cp`-based and
sha-rematched to baseline `3064ea87`. It also independently re-proved the `typeof` guard.

⚠️ **OUTCOME 3'S WORDING WAS WRONG, AND IT IS CORRECTED ABOVE RATHER THAN QUIETLY PASSED.** The
plan-time outcome asked for tolerance of a "corrupt/unparseable stored value" and a "wrong JSON
type" — presuming a JSON codec that does not exist. The draft is a **raw string** by design, so
no stored value can be unparseable. Scored PASS because the clause is **vacuous**, not because a
test covers it; the wording is the defect, and the strikethrough above records that. ⚠️ Recorded
because a future reader hitting a green outcome that names an untested-sounding condition would
otherwise have to re-derive whether it was a real gap.

**verify-human (2026-09-21) — both leaves approved.** Two consequences were surfaced as explicit
questions with a backlog option offered; the operator approved without taking either, so both are
**accepted as designed, not overlooked**:

1. **A draft orphans if a project is re-added at a different path.** Keys are the canonical
   project path, so moving a repo makes the old draft unaddressable (not deleted — unreachable).
   Re-keying was offered for the backlog and **declined**.
2. **A quota/storage failure loses the draft silently** — no toast, no indicator. ⚠️ A long
   dictation is precisely the value that can exceed the quota, so the operator would learn of it
   only on restart. An unsaved-state indicator for WP3 was offered and **declined**; WP2's silent
   degradation stands (the alternative, throwing, blanks the app mid-dictation).

**verify-codify (2026-09-21) — 5 tests added, all for inputs no earlier test used.** Both approved
behaviors were already covered, so nothing was duplicated. The gap was that every build-time test
used short, convenient values — the question asked here was *"which realistic input does no test
exercise?"*

| Mutant | Caught by | Would earlier tests have caught it? |
|---|---|---|
| `draft === ""` "tidied" to `draft.trim() === ""` — silently discards a whitespace-only draft | the whitespace-preserved test | **No** |
| `setItem(..., draft.slice(0, 10000))` — silent truncation at scale | the dictation-scale round-trip | **No** |
| `canonicalizeProjectPath`'s `/\/+$/` narrowed to `/\/$/` | the multiple-trailing-slashes test | **No** |

⚠️ **The whitespace rule was IMPLICIT until this phase.** `saveDraft` uses exact equality, so
`"   "` persists as a real draft rather than being deleted — correct (trimming would mutate
operator text, and a dictation can legitimately open with a space), but nothing pinned it. The
`.trim()` "tidy" is a plausible future edit that would silently discard content.

⚠️ **Mutant C mutated a TRACKED file** (`src/state/workspace.ts`), unlike every other mutation in
this WP. Restore verified by **both** `shasum` **and** `git status` returning clean — `git
checkout` would have worked here but was still not used, since the same command silently no-ops on
the untracked modules this WP mostly touches and the habit is the safer one.

**Mutation-proved, each run INDIVIDUALLY, each landing verified and each restore `shasum`-checked:**

| # | Mutant | Killed by | Tests failed |
|---|---|---|---|
| 1 | drop `canonicalizeProjectPath` from the key | the both-directions trailing-slash test | 2 |
| 2 | store `""` as a value instead of deleting | the empty-draft-is-a-deletion test | 1 |
| 3 | drop `loadDraft`'s `typeof raw === "string"` guard | the non-string-value test | 1 |
| 4 | remove `saveDraft`'s try/catch | the quota-exhausted test | 1 |

⚠️ **Mutant 1's first run had an UNVERIFIED LANDING** — the post-mutation `grep` printed nothing
(my pattern did not match Prettier's line shape), so the 2 kills could have come from a broken
file rather than a real mutation. Re-run with the landing confirmed by `sed -n '43p'` printing the
mutated line before reading the result. Per `[[verify-the-mutation-landed]]`, a kill whose landing
was not confirmed is not evidence.

### Phase 1 build notes

**Mutation-proved, each mutant run INDIVIDUALLY and each restore confirmed by `shasum`:**

| # | Mutant | Killed by | Tests failed |
|---|---|---|---|
| 1 | stage-only also appends `\r` (submits) | the two-modes-differ-by-one-byte pin | 4 |
| 2 | drop the `ESC[201~` strip | the envelope-injection test | 1 |
| 3 | interior newline → `\n` instead of `\r` | the never-emits-LF pin | 3 |
| 4 | swap chunked `encodeBase64` for an unchunked local twin | the 200k-overflow guard | 1 |
| 5 | widen `slashCommandPayload` with an envelope | the wbs-2.4 unchanged-guard | 2 |

**verify-self (2026-09-21) — 4/4 PASS, no integration boundary.** The phase adds isolated new
artifacts only (`stagedPayload.ts` + its test); nothing imports the new module yet and no existing
endpoint, UI surface, CLI command, job or outbound call was touched, so no Observable Outcome needs
to cite a consuming surface. ⚠️ **The subagent did NOT merely re-run the suite** — it mapped each
outcome to the concrete `it(...)` block asserting it, **decoded the payload bytes independently**
(`Buffer.from(b64, "base64")` in a throwaway probe, rather than trusting the suite's own `bytes()`
helper — instrument agreement is not correctness when both share a defect), and mutation-proved
each mapped assertion individually. Its targeted mojibake mutant (`& 0xff` truncation — the exact
M10.5 regression) was confirmed landed in executable code by `sed -n` and killed by the UTF-8 test
alone, so that assertion discriminates the specific regression rather than passing incidentally.
Source restored by `cp` (not `git checkout`, which silently no-ops on an untracked file) and
confirmed by matching `shasum`; `autoResumeFire.ts` re-confirmed unchanged afterward.

⚠️ **One judgment call the subagent surfaced rather than buried:** outcome 1's wording ("no
trailing 0x0d and no 0x0a anywhere") is satisfied across TWO `it` blocks — the exact-array
equality (strictly stronger, since it excludes both) plus the dedicated multi-newline LF test.
Counted PASS; recorded because the outcome reads as one assertion and is in fact two.

**verify-codify (2026-09-21) — 4 invariant tests added, and they found a REAL hole.** The two
operator-approved decisions each already had a dedicated, mutation-proved test, so nothing was
duplicated. What was missing is that both were asserted on *hand-picked bodies* while what was
approved is a property of the MODE — true for every input. The new `describe` block re-asserts
them over a 10-body set chosen for realistic dictation shapes.

⚠️ **This was not ceremony — two mutants prove the additions earn their place:**

| Mutant | Before codify | After codify |
|---|---|---|
| A trailing newline escapes the envelope (silently submits a half-finished dictation) | **SURVIVED all 14 tests** — no build-time body ended in a newline | killed by the stage-only-never-ends-in-CR invariant |
| Terminator strip changed `.split().join()` → `.replace()` (first occurrence only) | **SURVIVED all 18 tests** — no body carried TWO embedded terminators | killed, after adding a two-terminator body |

⚠️ **Mutant B survived the FIRST codify pass**, which is the honest finding here: the invariant
block as first written still had a gap, and only running the mutant exposed it. A two-terminator
body was added and the mutant re-run to confirm it now dies — the test was verified to
discriminate, not merely added and assumed to.

⚠️ **Mutant 3's first attempt was an INVALID PROBE, not a result** — a `perl -pi -e` substitution
whose pattern contained an unescaped alternation corrupted the line into a syntax error, and the
run reported `no tests` rather than a pass. Per `[[invalid-probe-and-real-hole-look-identical]]`
that outcome proves nothing; it was redone with a `python3` exact-string replace, the landing
confirmed by `sed -n '65p'`, and only then read as a kill.

## Retrospect

- **What changed in our understanding:** ⚠️ **The code was never the problem — the tests were, four
  times over.** `stagedPayload.ts`, `draftStore.ts` and `draftHistory.ts` were each written once and
  `draftHistory.ts` stayed byte-identical (sha `81ad8c4d…`) through five verify-self rounds. Every
  defect found in this WP was an **assertion that could not distinguish correct from incorrect
  behavior**, not a line of shipping code that misbehaved. The exception proves it: the one genuine
  code defect (the return-contract inconsistency) was found by the *code-quality reviewer*, not by
  five rounds of mutation hunting — because the hunts were aimed at the module and the defect was
  in its **contract with a caller that does not exist yet**.

- **Assumptions that held:**
  - The `localStorage`-not-`projects.json` decision (blast radius) needed no revisiting.
  - The `draftStore`/`draftHistory` duplication is genuinely not a missed abstraction — the
    reviewer independently confirmed it after I flagged it as the most likely MAJOR.
  - Phase sequencing (payload → store → ring) was right: the payload carried the burned-in
    regression history and the other two were independent of it.
  - WP2 really was unaffected by WP1's dictation blocker, exactly as the WBS predicted.

- **Assumptions that were wrong:**
  1. ⚠️ **"Assert against the constant, never a literal" — half right, and the missed half mattered.**
     Deriving both the input count and the expected output from `HISTORY_CAP` made the cap's *value*
     untested; the suite passed at `HISTORY_CAP = 3`. Two separable properties, one assertion.
  2. ⚠️ **A read-side clamp can MASK a broken writer.** Every assertion routed through `loadHistory`,
     so `localStorage` could grow unbounded while the suite was green.
  3. ⚠️ **I estimated comment density at "about a third." Measured: 56–73%.** I was the wrong judge
     of my own prose volume, having written it incrementally all session.
  4. ⚠️ **A fix applied to the arm the hunt surfaced is not a fix.** Survivor A's blank-entry arm was
     corrected while the identical defect on the quota arm shipped — and my new test *pinned it*,
     because the stub made `[]` indistinguishable from the correct answer.

- **Approach delta:** Implementation matched the plan; **verification did not.** The plan budgeted
  one verify-self pass per phase. Phase 3 took five plus a code-quality review, and two in-place
  shortcuts plus two full F9b back-loops. ⚠️ **What produced the findings was a framing change, not
  more effort: asking the subagent to JUDGE a choice or HUNT for a survivor, rather than CONFIRM a
  result.** "Verify this passes" would have returned green every single round. ⚠️ **The stopping
  rule had to be decided explicitly** — an adversarial mutation hunt on a small pure module always
  finds something, so round 5 was scoped confirm-and-close with a one-gap cap. That judgment is
  recorded in the Phase 3 notes rather than left implicit.
  ⚠️ **One plan defect surfaced:** every Observable Outcome was written as *"what is in storage"*,
  so the module's **return contract** — the thing WP3/WP4 will actually consume — was specified
  nowhere and tested only by accident. For a module whose consumers read its return value, the
  outcome set needs both halves.


## Code-Quality Review — F-a WP2 (2026-09-21)

**0 CRITICAL · 2 MAJOR (both FIXED, not backlogged) · 3 MINOR (backlogged).**

### Strengths (reviewer)
- `stagedPayload.ts` refuses to widen `slashCommandPayload` and **backs the claim with a real
  pin** rather than a comment — the M12/M13/M15 shared funnel is verified byte-unchanged.
- The bracketed-paste terminator strip is genuine security-shaped thinking: identifies the one
  injection hole, chooses drop-over-escape with a stated reason, and the verify-codify body set
  includes a two-terminator case that killed a real `.replace()` mutant.
- The direct-`store[...]` assertions catch the read-clamp-hides-a-broken-writer trap and carry a
  "do not simplify this" note aimed at the next reader.
- `HISTORY_CAP` pinned by one deliberate literal while every other assertion stays relative.
- Storage posture genuinely reuses prior art rather than re-deriving it.

### MAJOR 1 — `appendToHistory` return inconsistency  [FIXED, not backlogged]

⚠️ **A REAL DEFECT I MISSED, AND MY OWN TEST PINNED IT.** `appendToHistory` returned the intact
ring on the blank-entry arm but a bare `[]` on the no-storage and quota arms — two different
answers to "the append did not happen." **A throwing `setItem` leaves storage INTACT**, so
`setRing(appendToHistory(p, t))` in WP3/WP4 would blank a populated UI ring against live data.

⚠️ **Verified empirically before acting** (throwaway probe): `returned === []` while `loadHistory`
still returned `["real two", "real one"]`. Both arms now return `loadHistory(projectPath)`;
mutation-proved the quota arm dies. The no-storage arm's mutant **survives as a genuine
equivalent** — with no storage `loadHistory` also returns `[]`.

⚠️ **THE TEST THAT PINNED THE BUG WAS ALSO FIXED, AND THAT IS THE REAL LESSON.** My round-4
"the QUOTA-EXHAUSTED path returns []" asserted against a stub whose `getItem` returned `null`, so
`[]` was *also* what correct behavior produced — **the assertion could not distinguish the two and
locked in the wrong one.** It now seeds a real ring first, which is what makes the answers differ.
⚠️ Same **weaker-assertion-than-the-property** class that produced three of Phase 3's four
verify-self holes — and it slipped through *the fix for that very class*.

⚠️ **The reviewer's diagnosis of the METHOD is the sharpest finding of the WP:** four rounds of
"hunt for a surviving mutant" each found a hole on a new axis, but **the fix for Survivor A was
applied to the arm it was found on rather than swept across every sibling arm reachable by the
same caller pattern.** Generalize a fix across arms; do not patch the one the hunt surfaced.

### MAJOR 2 — comment density / duplicated rationale  [FIXED, not backlogged]

Measured **73% / 58% / 56%** of physical lines — roughly double my own estimate, and the repo's
comment-budget rule has been flagged in four consecutive reviews of another file for this.
Applied the rule's own test (*"would a reader make a worse decision without this sentence?"*):
- **Removed:** the cross-module restatement of `draftStore`'s posture (now a pointer), the
  triplicated "junk costs a good one" rationale (stated **once**, other sites point at it), the
  dated decision history in the duplicate-collapse block, one provenance line.
- ⚠️ **Also removed the RETRACTED reasoning** still in the duplicate-collapse block ("hides that
  the send happened twice") — grounds replaced at verify-human.
- **Kept:** measurements, rejected alternatives, and ⚠️ what-to-do-when-this-fails warnings — the
  categories the budget says belong at the code. ⚠️ **Verified zero provenance markers remain**
  in the implementation files by grep rather than trimming by feel.

### Reviewer's answers to my two direct questions
1. **Duplication between the two stores — my judgment was RIGHT.** Stripped of comments they
   share only a 2-line key builder and a 4-line `clear*`; the pairs diverge in encoding, guard
   sequence, cap logic, blank-value semantics and return type. *"A shared abstraction
   parameterized on all of those would be longer than what it replaced — do not build it."*
2. **Comment density — I UNDER-ESTIMATED it** ("about a third" vs. a measured 56–73%).
3. **No over-fitting** in the heavy suites: *"probe properties over input classes rather than
   memorializing sampled outputs."*

### MINOR (3, auto-backlogged per drive_mode=autopilot)
1. `stagedPayload.test.ts` terminator count uses `.filter()` collecting elements not indices —
   right answer, confusing shape beside the correct index-loop in the same file.
2. `draftHistory.ts` blank-entry check calls `loadHistory` before `safeStorage()` — a needless
   read on a path the next guard short-circuits.
3. `draftStore.ts`'s `typeof` guard comment overstates the production risk (real `localStorage`
   cannot return a non-string; it defends the test double).

### If you disagree
Mark any finding `[DISMISSED]` in this section before `feature-finalize` archives the WIP.


## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SURFACED-2026-09-21] Phase 3 / P3.3 — ⚠️ **A READ-SIDE CLAMP CAN MASK A BROKEN WRITER, AND
EVERY ASSERTION IN THE FILE ROUTES THROUGH THE READER.** Found by the cap-anchor re-verification
subagent. Two write-path mutants of `appendToHistory` **survive** the whole suite: dropping
`.slice(0, HISTORY_CAP)` entirely, and changing it to `HISTORY_CAP + 1`. Both are invisible
because `loadHistory` re-clamps on read, so the observable through `loadHistory` is identical.
Proved behavioral (not an equivalent mutant) with a throwaway probe reading `store[...]` directly:
`stored.length=11, loaded.length=10`. ⚠️ **So under the no-write-clamp mutant the ring grows
UNBOUNDED in localStorage while the suite reports 20/20 green** — and unbounded growth in a
quota-limited store is the failure this module's own error handling exists to survive.
⚠️ **The read clamp is a deliberate DEFENSE** (its own test says so — it guards against a value
written by an older build with a larger cap). Here that defense doubles as the thing hiding a
broken writer. **This predates the cap fix and is independent of it.** Resolution: assert against
the PERSISTED value, not only `loadHistory`'s return. Fixing in build (F9b) rather than in-place —
the in-place shortcut was already spent on the cap anchor, and a second fix cycle in verify-self
would be exactly the "convenient" widening that clause warns against.

[RESOLVED-2026-09-21] Phase 3 / P3.3 (F9b round 4) — **the return contract is now asserted.**
Five tests added under a new `appendToHistory's RETURN VALUE is a contract` block: the happy path
(returns the new ring, agreeing with `loadHistory`), a blank send into a POPULATED ring (returns
the **intact** ring for all four blank spellings), a blank send into an EMPTY ring (returns `[]` —
pinning that the empty result is a *consequence* of the ring being empty, not the rule), the
quota-exhausted path (`[]`, not garbage), and the no-storage path (`[]`). **Re-verify gate:** both
round-4 survivors now fail, each to exactly its own test.

⚠️ **REGRESSION SWEEP — all four rounds' mutants re-run after this fix, all 8 killed:** R1 cap
value (1), R2a write clamp removed (2), R2b off-by-one (2), R3 read clamp wrong end (1), R4a blank
returns `[]` (1), plus append-order-reversed (6), non-string-filter dropped (1), canonicalization
dropped (1). **No fix cannibalized another** — four rounds of edits to one file is exactly where
that happens, so it was checked rather than assumed. Suite: 27 tests.

[SURFACED-2026-09-21] Phase 3 / P3.3 — ⚠️ **A FOURTH hole: `appendToHistory`'s RETURN VALUE is
asserted NOWHERE.** Found by round 4, which was asked to *hunt* using the rounds-2/3 pattern as a
lens rather than confirm the fix. 19 mutants run individually (2 aborted as INVALID PROBE rather
than miscounted as survivals; 2 further survivors correctly judged **equivalent**, not defects).
**Two genuine survivors, both on the axis nothing in the suite inspects:**

- ⚠️ **Survivor A (the harmful one) — `line 88: if (entry.trim() === "") return loadHistory(...)`
  → `return []` survives all 22 tests.** Probe: returned `[]` while storage still held
  `["real two","real one"]`. Every blank-refusal test asserts *persisted* state via `loadHistory`,
  which this mutant never touches. ⚠️ **A caller doing `setRing(appendToHistory(p, text))` would
  BLANK ITS UI RING on a blank send** — precisely the harm the refusal exists to prevent, and
  contrary to the module's own documented contract (*"Returns the new ring so a caller can use it
  without a re-read"*). WP3/WP4 are the callers that will do exactly this.
- **Survivor B — the quota-exhausted catch `return []` → `return ["BOGUS-quota"]` survives.** The
  test asserts only `not.toThrow()`, the textbook "mere non-throwing where it should check
  identity" case.

⚠️ **THE PATTERN HAS NOW PRODUCED THREE OF FOUR HOLES, AND IT MOVED AXIS EACH TIME:** round 2
persisted-vs-loaded state, round 3 which-end-was-clamped, round 4 the return value. The constant
is *a weaker assertion standing in for an identity one*; what varies is **which observable nobody
thought to look at.** ⚠️ **Fixing via the full F9b back-loop, NOT the in-place shortcut** — the
shortcut was used twice already on this phase, and "the fix is only one line" stops justifying it
the third time. The gate is meant to be a boundary, not a recurring convenience.

[SHORTCUT-2026-09-21] P3.3 — **A THIRD hole, same defect class as the second, on the opposite
side.** verify-self round 3 (asked explicitly to hunt for a surviving mutant rather than confirm
none) found that `loadHistory`'s `.slice(0, HISTORY_CAP)` → **`.slice(-HISTORY_CAP)` survived all
22 tests at exit 0.** The ring is stored newest-first, so clamping the wrong end returns the
**OLDEST** ten (`[e5…e14]`) where the newest (`[e0…e9]`) is correct — both length 10, so the
read-clamp test's `toHaveLength` could not tell them apart. ⚠️ **Consequence: a ring written by an
older build with a larger cap would surface the ten drafts LEAST likely to be wanted, silently —
the exact inverse of a recovery list's purpose.** ⚠️ **Pre-existing, NOT introduced by the round-2
fix** (which the same run confirmed cannibalized nothing: removing the read clamp still kills only
its own test). Prior rounds simply never probed `loadHistory`, having targeted `appendToHistory`.
**Fix:** one line in the test — `toEqual(oversized.slice(0, HISTORY_CAP))` in place of
`toHaveLength`. **Re-verified:** the mutant now fails, and fails only that test. Restore
`shasum`-confirmed. Re-verified independently by a fresh subagent (gate 2).
⚠️ **THE TRANSFERABLE LESSON, now stated in the test itself: a length-only assertion standing in
for an identity assertion is this suite's recurring blind spot — it produced BOTH round 2 and
round 3. Any future clamp must assert WHICH elements survive, not how many.**

[RESOLVED-2026-09-21] Phase 3 / P3.3 (F9b back-loop) — **the read-clamp masking is CLOSED.** Two
assertions added that read `store[...]` **directly**, bypassing `loadHistory`:
(1) the persisted array after `HISTORY_CAP + 2` appends is exactly `HISTORY_CAP` long, with the
same identity+order check as the read-side test; (2) the persisted length never exceeds the cap
across `HISTORY_CAP * 3` appends, checked **after every append** — the off-by-one mutant keeps a
stable-but-wrong length, so a single end-state snapshot would miss it while the growth check does
not. **Re-verify gate:** both previously-surviving mutants (no write clamp; `HISTORY_CAP + 1`) now
fail, each killing **both** new assertions. ⚠️ **Also confirmed the fix did not CANNIBALIZE the
old coverage** — the read clamp still has its own independent guard (removing it kills the CLAMPS
test and nothing else), so the two clamps are separately pinned rather than one masking the other
in the opposite direction. Suite: 22 tests.

[SHORTCUT-2026-09-21] P3.3 — **The cap assertion was TAUTOLOGICAL and verify-self proved it.**
Every assertion in `draftHistory.test.ts` derived from the exported `HISTORY_CAP`, so the cap's
*value* was never tested: the subagent set `HISTORY_CAP = 3` (landing confirmed) and **all 19
tests still passed at exit 0.** The eviction *mechanism* (ordering, which entries survive) was
genuinely covered — an insertion-order mutant killed 4 tests — but the outcome's literal "cap-10 /
12 entries" was asserted nowhere; `10` and `12` appeared only in comments. This is
`[[detector-scored-against-its-own-table-is-circular]]`: deriving both the input count and the
expected array from the same constant the module uses is an arithmetic identity.
**Fix:** one line — `expect(HISTORY_CAP).toBe(10)` as a deliberate literal anchor, with every
other assertion left relative to the constant so an intentional cap change updates exactly one
place. **Re-verified** by re-running the original `HISTORY_CAP = 3` mutation: it now fails, and
fails *only* the anchor (1 failed / 19 passed), which is the intended separation. Restore
confirmed by `shasum`. A **fresh subagent** re-verified independently (shortcut gate 2).
⚠️ **The finding came from asking the subagent to judge my own choice rather than confirm it** —
I had reasoned that a hardcoded `10` would stop testing the boundary if the cap moved, which was
half right; the half I missed is that the two properties are separable and one assertion cannot
hold both.

[SURFACED-2026-09-21] Phase 1 / P1.1 — **`autoResumeFire.ts` carries a module-private
`encodeUtf8Base64` that spreads the whole byte array into one `String.fromCharCode` call.
Measured: it throws `RangeError: Maximum call stack size exceeded` at ~200k characters.**
`src/cc/bridge.ts`'s `encodeBase64` — documented as the single frontend chokepoint for this
encoding — does the same job with a chunked spread and is unaffected. This WP routed around the
hazard (the staging path imports the chunked one) rather than fixing it, because the private
twin's only current callers are slash commands, which are short by construction and cannot reach
the limit. ⚠️ It is a latent trap for the NEXT caller, and the duplicate also contradicts its own
header comment ("if a third caller appears, hoist it"). Logged to `backlog.md`.
