# Source-text guards — the ways they stop checking

A **source-text guard** asserts something about code by matching its *text*: a `?raw` import in
Vitest, an `include_str!` in Rust, a `readFileSync` of a sibling module. This repo leans on them
because some properties have no runtime surface — "the cell performs no mount-time IPC read",
"no chord module is ungated", "every emitted class has a rule".

They are also the single most failure-prone instrument here. **Every entry below is a guard that
reported green while checking nothing**, found by mutation rather than by review. The failure mode
is always the same shape and it is the dangerous one: *false reassurance*. A missing guard is
visible. A guard that passes for the wrong reason reads as coverage.

> **The one-line test, applied before trusting any source-text guard:**
> *Could this assertion still pass if the code it names were deleted?*
> If you cannot answer from the assertion alone, mutate the code and watch it fail.

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

## 8. A filtered test run proves nothing without a count

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

## Method notes

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
