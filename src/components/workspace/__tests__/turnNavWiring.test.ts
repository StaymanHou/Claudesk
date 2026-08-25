import { describe, expect, it } from "vitest";
import paneSource from "../XtermPane.tsx?raw";

// M13.5 WP3 Phase 2 — the CALLER contract for turn navigation.
//
// ⚠️ WHY THIS EXISTS. `arch.md` records this repo's recurring defect shape — hit four times, once
// as a shipped CRITICAL: *"extracting a pure state machine proves the MACHINE, not its CALLER."*
// Phase 1's 62 tests prove `stepTurn`/`scrollTargetFor`/`navState` exhaustively and would ALL stay
// green if `XtermPane` wired them up wrongly. The corollary in `arch.md` is the specific rule this
// guard enforces: **funnel shared-state writes through ONE function and guard THAT function.**
//
// ⚠️ This is a STRUCTURAL guard and that is all it is (`docs/lessons/source-text-guards.md`). It
// cannot prove the navigation behaves; Phase 1's suite owns behaviour and Phase 2's live-pane
// outcome owns the integration. What a source-text guard CAN honestly assert is the shape of the
// wiring: that there is exactly one writer, that geometry is read at call time, and that the
// deleted API has not crept back.
//
// ⚠️ COMMENTS ARE STRIPPED FIRST. `XtermPane.tsx`'s prose deliberately names `nextJump`,
// `jumpToPreviousTurn` and `turnWalkRef` while explaining why they are gone, so an unstripped
// haystack would make the absence assertions permanently false-positive
// (`[[raw-guard-identifier-satisfied-by-own-comments]]` — here the risk runs the other way).
const code = paneSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("XtermPane turn-navigation wiring", () => {
  it("is not vacuous — the stripped source still contains the real component", () => {
    // ⚠️ The emptiness meta-guard. Several assertions below are `not.toMatch`, so an over-eager
    // strip (a regex change, a `?raw` import silently resolving to "") would leave `code` empty
    // and every absence assertion would PASS while checking nothing. Pin the haystack first.
    // ⚠️ Anchored on LIVE symbols only — a meta-guard naming a removed symbol is permanently
    // vacuous, the trap found at Phase 1 verify-codify.
    expect(code).toMatch(/useImperativeHandle\(/);
    expect(code).toMatch(/setTurnPosition/);
    expect(code.length).toBeGreaterThan(2000);
  });

  it("⚠️ has exactly ONE writer of the position ref — the arch.md funnel rule", () => {
    // The rule: shared-state writes go through one function, and the guard sits on THAT function.
    // Two writers is how AC-6's newest-reset and AC-7's eviction re-clamp drift apart — one path
    // re-clamps, the other does not, and the stale index survives until it targets a disposed
    // marker. A raw `turnPositionRef.current = …` anywhere is that second writer.
    const rawWrites = code.match(/turnPositionRef\.current\s*=/g) ?? [];
    expect(
      rawWrites.length,
      `found ${rawWrites.length} raw writes to turnPositionRef.current — every position change must go through setTurnPosition() so the clamp cannot be skipped`,
    ).toBe(1); // the one inside setTurnPosition itself

    // ...and that single write must BE the one inside the setter, not somewhere else.
    expect(code).toMatch(
      /const setTurnPosition = useCallback\(\s*\(next: TurnPosition\) => \{\s*turnPositionRef\.current = clampPosition\(/,
    );
  });

  it("⚠️ always re-clamps — clampPosition is not conditional on an eviction path", () => {
    // AC-7. If the clamp were applied only where eviction is "expected", every other caller
    // would have to remember whether markers might have been evicted since capture.
    expect(code).toMatch(/turnPositionRef\.current = clampPosition\(/);
  });

  it("⚠️ reads viewport geometry at CALL time and passes it as a value", () => {
    // `arch.md`: scroll geometry must never be read off a DOM element, and a CACHED viewport is
    // the other half of that hazard — `buffer.active.length` grows as CC writes and `rows` changes
    // on resize, so a stale ceiling would clamp against the wrong number.
    //
    // ⚠️ ANCHORED TO THE `scrollTargetFor` CALL SITE, not asserted as two loose substrings. A
    // verify-self mutation probe caught the first draft half-vacuous: `rows: term.rows` also
    // appears in the unrelated `cc_resize`/fit path, so hard-coding the nav call's rows to a
    // literal left that assertion GREEN — it was matching a line the guard is not about, and only
    // the sibling `length:` assertion (unique to the nav site) caught the mutant. Matching BOTH
    // fields inside one `scrollTargetFor(...)` argument list is what makes each half load-bearing.
    // Same class as `[[raw-guard-identifier-satisfied-by-own-comments]]`: a bare identifier match
    // finds the identifier somewhere other than where the check meant.
    expect(code).toMatch(
      /scrollTargetFor\([\s\S]{0,200}?\{\s*length: term\.buffer\.active\.length,\s*rows: term\.rows,?\s*\}/,
    );
  });

  it("⚠️ compacts BEFORE stepping, so both step and scroll see one list", () => {
    const stepBody = code.slice(code.indexOf("stepTurn: (direction)"));
    const compactAt = stepBody.indexOf("compact(turnMarkersRef.current)");
    const stepAt = stepBody.indexOf("stepTurn(");
    expect(compactAt).toBeGreaterThanOrEqual(0);
    expect(stepAt).toBeGreaterThanOrEqual(0);
    expect(
      compactAt,
      "compact() must run before stepTurn() — otherwise a disposed marker can shift the indices the position is expressed in",
    ).toBeLessThan(stepAt);
  });

  it("⚠️ resets to the newest turn on a recorded turn start (AC-6), through the setter", () => {
    expect(code).toMatch(/setTurnPosition\(positionAtNewest\)/);
  });

  it("⚠️ hands the parent FRESH nav state on the turn-recorded edge", () => {
    // The shipped defect was the parent never learning a new turn made an empty list non-empty.
    // Passing the state (rather than making the parent poll) is what keeps AC-4 correct.
    //
    // ⚠️ ASSERTS THE ARGUMENTS, NOT JUST THE CALL SHAPE. A mutation probe caught the first draft
    // of this guard passing while the nav state was computed from `positionAtNewest` instead of
    // the live ref — the call shape was identical, so `onTurnStartRecorded?.(navState(` matched
    // either way. That is the "guard reports green while checking nothing" class from
    // `docs/lessons/source-text-guards.md`: the predicate must name the value that can be wrong.
    // Reading a literal here instead of the ref would report a position the pane is not at.
    expect(code).toMatch(
      /onTurnStartRecorded\?\.\(\s*navState\(\s*turnMarkersRef\.current,\s*turnPositionRef\.current,?\s*\)/,
    );
  });

  it("⚠️ the DELETED walk API has not crept back", () => {
    // Two live paths with different semantics is how the original defect survived three verify
    // rounds. `tsc` catches an import, but not a locally re-introduced helper of the same name.
    for (const gone of [
      "nextJump",
      "resetWalk",
      "initialWalkState",
      "inertAfter",
      "TurnWalkState",
      "turnWalkRef",
      "jumpToPreviousTurn",
    ]) {
      expect(
        code,
        `\`${gone}\` is part of the deleted backward-walk API — it must not reappear in XtermPane`,
      ).not.toMatch(new RegExp(`\\b${gone}\\b`));
    }
  });

  it("⚠️ does not re-add registerDecoration — it throws without allowProposedApi", () => {
    // The 3.1 probe: `registerDecoration` is proposed API and THROWS (not returns falsy) when the
    // flag is unset, and the throw was silent because the call sat un-caught inside a listener.
    expect(code).not.toMatch(/registerDecoration/);
    expect(code).toMatch(/registerMarker\(/);
  });
});
