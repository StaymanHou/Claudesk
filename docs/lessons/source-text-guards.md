# Source-text guards — the ways they stop checking

A **source-text guard** asserts something about code by matching its *text*: a `?raw` import in
Vitest, an `include_str!` in Rust, a `readFileSync` of a sibling module. This repo leans on them
because some properties have no runtime surface — "the cell performs no mount-time IPC read",
"no chord module is ungated", "every emitted class has a rule".

They are also the single most failure-prone instrument here. **Every entry below is a guard that
reported green while checking nothing**, found by mutation rather than by review. The failure mode
is always the same shape and it is the dangerous one: *false reassurance*. A missing guard is
visible. A guard that passes for the wrong reason reads as coverage.

⚠️ **Entries 1–10 are source-text guards; entry 11 is a BEHAVIORAL assertion** (an ordered
effect-log) that failed the same way for a different reason — the step that was wrong could not
appear in what the assertion asserted over. It lives here because the discipline is identical and a
reader looking for "how did a green suite miss this?" should find both in one place.

> **The one-line test, applied before trusting any source-text guard:**
> *Could this assertion still pass if the code it names were deleted?*
> If you cannot answer from the assertion alone, mutate the code and watch it fail.
>
> **Its companion, for a behavioral/ordering assertion (entry 11):**
> *Which steps in this sequence can actually APPEAR in what I am asserting over?*
> A step that emits no observable is outside the guard however strictly the guard is written.

---

## 1. The needle is in the assertion itself

`expect(src).toContain("cc_spawn_env(")` is satisfied by that function's **own declaration** —
and by the assertion line, if the guard reads a file that contains itself.

Measured three ways in one sitting (M12, 2026-08-06), each passing while a mutant broke the
feature. The same trap in a different key: a `?raw` guard asserting a bare identifier is satisfied
by the module's **own comments**, so it passes *exactly when* the named code was deleted and only
the prose describing it survives.

**Fix:** strip comments first, then assert the CALL shape (`fn(`), not the bare name. If the guard
reads a file that could contain its own fixtures, exclude test files explicitly — the
OFF-invariant convention guard reported *itself* as the only offender until it did
(paydown WP2, 2026-08-12).

## 2. Substring where you meant boundary

`css.includes("." + cls)` is a **prefix** test. `.doc-frontmatter` is satisfied by
`.doc-frontmatter-RENAMED`; `.picker-recent-model` by `.picker-recent-model-input`.

Not hypothetical: fixing the first occurrence immediately surfaced a real defect, and a sweep
found **17 prefix-shadowing pairs among 24 `picker-*` classes alone**.

**Fix:** `src/test-support/cssRule.ts` → `hasRule()`. Import it; do not re-derive it.

⚠️ **`.` is a legal boundary character**, so `.cls.is-editing` legitimately satisfies a
boundary match for `cls`. When mutation-testing this, pick a class with **no modifier sibling** —
deleting a base rule whose modifier rule survives is an *invalid probe*, not a guard hole. (Cost
me a wrong diagnosis at paydown WP3.)

## 3. Multi-token patterns break on reflow

A regex spanning more than one token breaks the moment Prettier rewraps the line. The guard does
not fail loudly — it stops matching and reports green.

**Fix:** flatten whitespace before matching (`squeezed`), or match a single token. And keep
`pnpm format:check` in the **per-phase** verify-auto gate, so drift cannot accumulate behind a
"gate green" claim (M12, 2026-08-05).

## 4. Positional slicing truncates

`src.split("#[cfg(test)]").next()` isolates production code **only while the file contains
exactly one** `#[cfg(test)]`. Add a second — most naturally a `#[cfg(test)] pub mod fixture;`
near the top — and the guard silently checks a fraction of the file.

**Fix:** split on `mod tests` instead, and **pin a positive assertion to the file's LAST
production item**. Truncation always eats the tail, so a head-anchored assertion cannot see it.

## 5. Whole-module predicates excuse per-export violations

A module-level exemption ("this file mentions the gate, so it is gated") excuses every export
beside the one that gates. Two successive predicates were built this way and **both passed the
full suite 19/19** while blind to an ungated sibling.

**Fix:** scan per export. Then scope the scan — an unscoped per-export version flagged four
innocent data exports, and false positives are how a guard gets deleted by the next person who
trips it.

## 6. "Did you remember to register X?" is not a guard

…when its own mechanism is a **hand-maintained enumeration that also has to be remembered**.
Forgetting the registration and forgetting the enumeration are the *same act of forgetting*, so
the guard is defeated by exactly the mistake it exists to catch.

**Fix:** move the burden to the compiler where possible. Where it is not, **state the guard's
limit in the open** rather than shipping another formulation of the same illusion.

## 7. Enumerating a SET does not prove each member has a CALLER

A registry, a route table, a list of skills — all testable as data, all silently able to contain a
member nothing invokes. M12 shipped an `/exit` clean-exit variant that round-tripped through two
test suites while being called by nothing, and the exhaustiveness test's green *read as coverage*.

**Fix:** assert the call site, not the primitive. Funnel writes of shared state through ONE
function and guard that.

## 8. A deferral must name a FILE, not a process

> *"The inverse direction is covered by verify-auto's className→CSS sweep."*

No such sweep existed. No `package.json` script performed it and no test asserted it — the
comment described an ad-hoc command run once during a verify-auto pass. **An ad-hoc run is
evidence about a single moment; only a standing test is coverage.** Because the comment read as
authoritative, the direction stayed open across two work packages *while appearing closed*.

The same shape in Rust: a doc comment asserted that a named test *"guards that this receives
`cc_spawn_env`'s output"* — and the test did not exist. `cargo test`, `clippy`, and `fmt` all
passed, because a prose citation of a missing item is invisible to every gate.

**Fix:** when a comment defers a property to other coverage, it must name the **file** (ideally
the test name) — a name is grep-able and rots loudly; a workflow phase or a process cannot be
checked by anyone.

⚠️ **`#![deny(rustdoc::broken_intra_doc_links)]` does NOT work for this, and the reason is worth
knowing before someone tries it again** (measured 2026-08-12, then reverted). Two independent
blockers:

1. **This crate has zero `pub mod`** — all 28 modules are private, and rustdoc does not document
   private items by default. Without `--document-private-items` the lint has nothing to resolve,
   so it is silently inert. A probe that "passes" here proves nothing.
2. **With `--document-private-items` it fires 31 times on the untouched tree**, and **all 10
   `tests::*` citations point at tests that genuinely EXIST.** They are unresolvable only
   because `#[cfg(test)]` modules are not compiled during `cargo doc`. Turning it on would mean
   31 errors on correct code — a false-positive generator, which is how a guard gets deleted.

So a Rust doc citation of a test is **structurally uncheckable** by rustdoc. Either grep for it
(`grep -rc "fn <name>"` returning 1 means only the citation exists), or accept the limit and
state it — do not ship a gate that reports 31 correct citations as broken.

⚠️ The general case is worse than either instance: **a doc-correction task's enumerated site
list is a FLOOR, not a boundary.** Grep the retracted *claim* repo-wide before trusting the
list — a stale identifier that a backlog entry said appeared in four docs was in five, and the
extra one had been written hours earlier in the same session.

## 9. A filtered test run proves nothing without a count

`cargo test -p claudesk <filter>` with a filter matching **zero tests** prints
`test result: ok. 0 passed; 0 failed` and **exits 0**. An Observable Outcome or CI gate written
as `<runner> <filter>` therefore passes against an empty codebase, a renamed test, or a typo —
and reads as a green gate. Measured 2026-08-12: still true.

(Vitest is the exception — `pnpm test <nonexistent>` exits non-zero. Do not generalize from it.)

**Fix:** pin a **count** or name a specific test, and assert the number:

```bash
cargo test -p claudesk <filter> 2>&1 | grep -q "26 passed"   # not just "exits 0"
```

The same rule covers every "did the thing run" observation: *would this output look different
if the code under test had been deleted?* If not, it is not evidence. Two sibling cases already
banked — a browser supplying the behavior under test (so the check passes whether or not the
app implements it), and jsdom reporting `clientHeight === 0` for **visible** elements just as
much as hidden ones, which makes a visibility assertion built on it non-decisive in both
directions. In each, the fix is the same: assert a value the implementation actually produces,
or inject the geometry as a value rather than measuring it in an environment that has none.

---

## 10. The guard whose subject does not exist yet

A test can only pin the **present**. An assertion about work that has not happened — "the next
milestone will not widen this list", "no future surface may add an arm here" — has no subject to
observe, so it either passes vacuously forever or fails the moment someone does the very thing the
project decided to allow.

Measured instance (`SURFACE-2026-08-14-A-TEST-CANNOT-ENFORCE-A-FUTURE-SCOPE-DECISION`): a guard was
proposed to enforce a *scope commitment* — that a particular vocabulary would not be widened later.
There is nothing to assert. The commitment is real and worth recording, but its home is the **WBS or
the WIP file**, where the next planner reads it, not a test file where it masquerades as coverage.

**The discriminator:** ask what code change would make the assertion go red. If the answer is
"someone deciding differently in a planning conversation", it is not a guard — it is a note in the
wrong file. If the answer names a concrete edit to a concrete symbol, it is a guard.

⚠️ **The failure mode is not a false pass — it is misplaced confidence.** The scope decision looks
protected, so nobody re-states it where planners look, and the guard is deleted (correctly) the first
time it obstructs an intentional change. Both halves of the protection are then gone at once.


## 11. An ordering assertion is blind to any step that emits NO observable

Entries 1–10 are about *source-text* guards. This one is the **behavioral-assertion** analogue, and
it is worse in one specific way: the assertion can be strict, exhaustive, and correct about every
step it can see, while being structurally incapable of seeing the step that is wrong.

Measured instance (`SURFACE-2026-08-18-RECYCLE-TYPES-SESSION-RESTORE-BEFORE-THE-FRESH-TUI-IS-READY`,
fixed 2026-08-19). `recycleSession.test.ts` asserted the full recycle sequence as an **ordered
array** — five effects, each position deliberate, with a comment explaining why each mattered:

```
expect(effects).toEqual([
  `inject:${HANDOFF_COMMAND}`, "markClean:recycle-session", "relaunch",
  "awaitFreshSessionId", `inject:${RESTORE_COMMAND}`,
]);
```

Every step in that list pushes an entry into `effects`. The **settle did not** — it was a bare
`await sleep(ms)`. So the settle's position was unobservable, it sat on the wrong side of
`awaitFreshSessionId()` for the whole of v0.3.3, the restore was typed into a TUI that was not yet
reading keystrokes, and **the suite stayed green the entire time.** The operator found it by using
the feature.

**Why the standing test does not catch this.** *"Could this still pass if the code it names were
deleted?"* asks about the code the assertion **names**. Here the assertion named five things and all
five were correct; the defect was in a sixth thing it did not name and could not have named. The
question to add is: **which steps in this sequence can actually APPEAR in what I am asserting over?**
Anything that cannot appear is outside the guard regardless of how the guard is written.

**The fix is a seam, not a stricter assertion.** Give the invisible step an injectable form that
records itself — here, `RecycleInputs.settle?: (ms) => Promise<void>`, defaulting to the real
`sleep`, which tests replace with one that pushes `"settle"` into the effect log. The ordering then
becomes an ordinary asserted position. ⚠️ **Do not collapse such a seam back to an inline call to
save a line** — that re-blinds the assertion, and the re-blinding is invisible.

**Prove it the same way as any guard, but mind the under-determined failure.** Installing the seam
and *then* reordering is the wrong sequence: with no seam, the pre-fix run fails with
`settleAt === -1` ("the seam is missing"), which is **not** evidence of a wrong order and would
"pass" a mutation test for the wrong reason. Install the seam **first, leaving the old order in
place**, and confirm the failure reads as a genuine ordering violation (it read `expected 3 to be
greater than 4` — the settle at index 3, the awaited id at 4). Then fix, then re-mutate from a
pristine copy.


## Comment budget — what belongs at the code, and what does not

Comment density has been flagged in **four consecutive reviews** of the same file, and each
review trimmed a bit and moved on. That is why it keeps coming back: trimming treats the symptom.
The rule is a **budget with a test attached**, not a line count.

**Keep at the code** — the things a reader cannot recover by any other means:

- the **invariant** ("an unmeasurable box means DEFER, never restore to 0")
- the **⚠️ what-to-do-when-this-fails** paragraph on a guard or hazard test
- a **rejected alternative** that looks correct ("do NOT harmonize this to `String`")
- a **measurement** whose absence would invite the wrong inference ("jsdom reports 0 for
  visible elements too")

**Move to the WIP / archive / CHANGELOG** — anything answering *how did we get here*:

- how many attempts failed and in what order
- what a previous version of this code did
- which review caught what, and when

> **The test:** would a reader who has never seen the WIP make a **worse decision** without this
> sentence? If no, it is provenance — it belongs in the archive, which is exactly where a reader
> looking for history will go.

⚠️ **Duplication is the expensive half, not length.** The same rationale stated in six places is
six things to update, and they drift asymmetrically: the copy someone edits becomes right while
the other five keep asserting the old thing with equal confidence. State it **once**, at the
canonical home, and make every other site a pointer. Measured instances in this repo: a milestone
rationale in six files, a validation-asymmetry warning in three, an incident narrative in three.

⚠️ **At high density, prose that is 95% accurate reads as authoritative** — and the wrong 5% is
what gets acted on. Three findings in one review were stale *comments* rather than code, including
a headroom figure the same commit corrected in three other files. Density is not free even when
every line was true when written.

- **Mutation-prove each added form INDIVIDUALLY.** A composite fixture exercising six declaration
  forms passes as soon as *one* matches, so a form that stayed blind is reported as covered.
- **Confirm the mutation landed in EXECUTABLE code** — `sed -n '<line>p'` it. A mutation that
  silently no-ops looks exactly like a real guard hole, and leads to weakening a guard that was
  fine.
- **An invalid probe and a real hole are indistinguishable from the result alone.** Verify the
  probe's premises before concluding the guard is broken (see §2's modifier-sibling trap).
- **When widening a selector, diff the OLD and NEW candidate sets.** "Does it catch the new
  target?" passes while silently dropping a module that was previously in scope.
- **Prefer extract-for-import for BEHAVIORAL properties.** A better source-text predicate can only
  encode shapes you already thought of. `renderToStaticMarkup` + jsdom is available today for
  resting-DOM assertions — no new dependency, no `@testing-library/react`.

## The render-harness note, corrected (THE authority — cite this, do not restate it)

⚠️ **"This repo has no component-render harness" is HALF TRUE, and the discouraging half has been
steering work toward the guard style that failed the nine ways above.** Stated once here because
**29 files** cite the original note; they are pointers, and this is the text.

**What is true:** `@testing-library/react` is not a dependency, so there is no harness for
*interaction* — no click dispatch, no state transition, no `act()`.

**What is ALSO true, and was under-claimed:** `renderToStaticMarkup` ships with the installed
`react-dom` and `jsdom` is already a devDependency, so a component's markup can be **rendered and
parsed as a real DOM tree today**, with no new dependency. Proven on a component with `useState` ×5,
`useRef` ×4, `useEffect` ×2 **and** Tauri IPC — not just a pure one. Working precedents:
`docsRender.test.tsx`, `projectModelCellRender.test.tsx`.

⚠️ **The boundary, which must be stated wherever this is used** — a reader who does not know it will
mis-attribute a correct render as a bug:
  - Server rendering **cannot dispatch events or transition state.** Anything sequential stays a
    pure-function test or live MCP-bridge verification.
  - A hook that seeds **asynchronously returns its pre-seed default.** For
    `useWorkflowFeaturesEnabled` that default is `false` — which is why only the **gate-OFF** shape
    is reachable in a server render. That is not a limitation to work around; for gated surfaces it
    is the single most valuable assertion available ("the surface is ABSENT when off"), and a parsed
    DOM is the honest form of it rather than a grep.

**The rule:** when the question is *"what does the DOM look like at rest"*, render it. When it is
*"what does the source say"*, guard the source. Reaching for `?raw` on a DOM question is how this
repo accumulated its nine failure forms.
