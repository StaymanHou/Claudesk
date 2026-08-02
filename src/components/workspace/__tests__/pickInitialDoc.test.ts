import { describe, expect, it } from "vitest";
import { pickInitialDoc, selectedDoc } from "../docs/pickInitialDoc";
import { decideReload } from "../docs/docsReloadDecision";
import type { DocEntry } from "../docsOrder";

// M11 WP3 P2.1 — the auto-select ranking, operator-confirmed 2026-08-02.
//
// The property under test is "the MOST DOWNSTREAM artifact wins": .session.md first,
// vision.md last. ⚠️ The operator's own phrasing runs the other way ("vision > roadmap >
// wbs > wip > session pointer") because `>` there means "flows toward", not "outranks" —
// a reader who takes the arrow as precedence inverts the function. These tests are the
// unambiguous statement of which end wins.

const doc = (rel_path: string, kind: string, mtime_ms = 0): DocEntry => ({
  rel_path,
  kind,
  file_name: rel_path.slice(rel_path.lastIndexOf("/") + 1),
  mtime_ms,
});

const VISION = doc("workflow-system/product/vision.md", "vision");
const ROADMAP = doc("workflow-system/product/roadmap.md", "roadmap");
const WBS = doc("workflow-system/product/wbs.md", "wbs");
const ARCH = doc("workflow-system/product/arch.md", "arch");
const BACKLOG = doc("workflow-system/state/backlog.md", "backlog");
const WIP = doc("workflow-system/state/wip/feature-a.md", "wip");
const SESSION = doc("workflow-system/state/.session.md", "session");

describe("the ranking — most downstream wins", () => {
  it("picks .session.md when present, over everything else", () => {
    // Deliberately passing the FULL set in reverse-relevance order: if the function were
    // returning "first in the input" or "first in display order", vision would win.
    expect(
      pickInitialDoc([VISION, ROADMAP, WBS, ARCH, BACKLOG, WIP, SESSION]),
    ).toBe("workflow-system/state/.session.md");
  });

  it("falls to the active wip when there is no session pointer", () => {
    expect(pickInitialDoc([VISION, ROADMAP, WBS, WIP])).toBe(
      "workflow-system/state/wip/feature-a.md",
    );
  });

  it("falls to wbs.md when there is no session pointer and no wip", () => {
    expect(pickInitialDoc([VISION, ROADMAP, WBS, ARCH])).toBe(
      "workflow-system/product/wbs.md",
    );
  });

  it("falls to roadmap.md when only strategy docs remain", () => {
    expect(pickInitialDoc([VISION, ROADMAP, ARCH])).toBe(
      "workflow-system/product/roadmap.md",
    );
  });

  it("REGRESSION: does NOT pick vision.md when a downstream doc exists", () => {
    // The inverted-arrow failure, stated as its own test. vision.md exists in nearly every
    // project, so if precedence were reversed this function would land on it essentially
    // always and the rest of the ranking would be unreachable dead code — a bug that
    // "works" and is easy to miss.
    expect(pickInitialDoc([VISION, SESSION])).not.toBe(VISION.rel_path);
    expect(pickInitialDoc([VISION, WIP])).not.toBe(VISION.rel_path);
    expect(pickInitialDoc([VISION, WBS])).not.toBe(VISION.rel_path);
  });
});

describe("fallbacks and edge cases", () => {
  it("returns null for an empty doc set — no crash, no fabricated path", () => {
    // A project with no workflow-system/ at all. Normal, not an error: the panel shows
    // its "no docs" view and must not be handed a path to fetch.
    expect(pickInitialDoc([])).toBeNull();
  });

  it("falls back to display order when NOTHING ranked is present", () => {
    // Only reference-tail docs. The landing doc should be the panel's top row, so the
    // selection and the visible list agree — a selection that isn't the top row, with no
    // ranked reason, reads as a bug.
    expect(pickInitialDoc([ARCH, VISION])).toBe(
      "workflow-system/product/vision.md",
    );
  });

  it("handles a single doc of any kind", () => {
    expect(pickInitialDoc([ARCH])).toBe("workflow-system/product/arch.md");
    expect(pickInitialDoc([SESSION])).toBe("workflow-system/state/.session.md");
  });

  it("tolerates an unknown kind without dropping it", () => {
    // The backend owns the curated set; if it grows a kind the frontend hasn't learned,
    // showing (and selecting) it beats crashing or returning null.
    const unknown = doc("workflow-system/product/charter.md", "charter");
    expect(pickInitialDoc([unknown])).toBe(
      "workflow-system/product/charter.md",
    );
  });
});

describe("the multi-WIP tiebreak — most recently MODIFIED wins", () => {
  // ⚠️ Names chosen so alphabetical order and mtime order DISAGREE. `a-stale.md` sorts
  // first alphabetically but is older; `z-active.md` sorts last but is the one being
  // worked in. A test where the two agree would pass under either implementation and
  // prove nothing — this is the whole point of the fixture.
  const stale = doc("workflow-system/state/wip/a-stale.md", "wip", 1000);
  const active = doc("workflow-system/state/wip/z-active.md", "wip", 9000);

  it("picks the most recently modified wip, NOT the alphabetically first", () => {
    expect(pickInitialDoc([stale, active])).toBe(
      "workflow-system/state/wip/z-active.md",
    );
  });

  it("is DETERMINISTIC across input orderings", () => {
    // Filesystem enumeration order is not stable, so the landing doc must not depend on
    // it. Same answer whichever way the backend hands them over.
    expect(pickInitialDoc([stale, active])).toBe(
      pickInitialDoc([active, stale]),
    );
  });

  it("REGRESSION: creation-time semantics would pick the WRONG file", () => {
    // The operator asked whether created-time could serve as the fallback. Modelled here:
    // `recently-started` was CREATED later but is untouched; `long-running` was created
    // earlier and is actively edited. Creation time picks the former, modification time
    // picks the latter — and the latter is where the work is.
    //
    // ⚠️ NAMES ARE LOAD-BEARING. An earlier version used `long-running` vs
    // `recently-started`, where the mtime-newest file was ALSO alphabetically first — the
    // two orderings agreed, so the test passed with the mtime logic entirely deleted
    // (measured, mutation verified landed). A regression test whose fixture agrees with
    // the fallback proves nothing. `z-long-running` sorts LAST alphabetically, so only
    // mtime-recency can select it.
    const longRunning = doc(
      "workflow-system/state/wip/z-long-running.md",
      "wip",
      9000,
    );
    const recentlyStarted = doc(
      "workflow-system/state/wip/a-recently-started.md",
      "wip",
      2000,
    );
    expect(pickInitialDoc([longRunning, recentlyStarted])).toBe(
      "workflow-system/state/wip/z-long-running.md",
    );
  });

  it("falls back to alphabetical when mtimes TIE (incl. two stat failures)", () => {
    // `0` is the backend's stat-failure fallback. Two of them must not produce an
    // arbitrary input-order answer.
    const a = doc("workflow-system/state/wip/a-feature.md", "wip", 0);
    const b = doc("workflow-system/state/wip/b-feature.md", "wip", 0);
    expect(pickInitialDoc([b, a])).toBe(
      "workflow-system/state/wip/a-feature.md",
    );
    expect(pickInitialDoc([a, b])).toBe(
      "workflow-system/state/wip/a-feature.md",
    );
  });

  it("still prefers the session pointer over any wip, however recent", () => {
    // Recency breaks ties WITHIN a kind; it never promotes a kind past the ranking.
    const veryRecent = doc("workflow-system/state/wip/hot.md", "wip", 999999);
    expect(pickInitialDoc([veryRecent, SESSION])).toBe(
      "workflow-system/state/.session.md",
    );
  });

  it("applies recency to multi-file WBS docs too, not just wip", () => {
    // `wbs` is the other multi-file kind (`wbs.md` + `m11-wbs-parked.md`).
    const parked = doc("workflow-system/product/a-wbs-parked.md", "wbs", 1000);
    const live = doc("workflow-system/product/wbs.md", "wbs", 8000);
    expect(pickInitialDoc([parked, live])).toBe(
      "workflow-system/product/wbs.md",
    );
  });
});

describe("purity — WP4 calls this a second time, on fs-change", () => {
  it("does not mutate its input", () => {
    const entries = [VISION, SESSION, WIP];
    const snapshot = JSON.stringify(entries);
    pickInitialDoc(entries);
    expect(JSON.stringify(entries)).toBe(snapshot);
  });

  it("is idempotent — repeated calls agree", () => {
    const entries = [VISION, ROADMAP, WBS, WIP, SESSION];
    expect(pickInitialDoc(entries)).toBe(pickInitialDoc(entries));
  });

  // ⚠️ WP4 P1.3 — this pins SURFACE-2026-08-02-QUALITY-WP3-SELECTED-RECOMPUTED-FEEDS-EFFECT,
  // which the WP3 reviewer filed as "latent, becomes live at WP4".
  //
  // The chain: `DocsPanel` computes `selected = selectedDoc(chosen, docs)` on every render
  // and passes it as a dep of the content-fetch effect. WP4 refreshes the doc LIST on every
  // `fs-change`, and `docs_list` re-stats `mtime_ms` — so every write CC makes to a WIP file
  // produces a brand-new `DocEntry[]` with brand-new numbers. If the auto-selected value
  // churned along with those numbers, the content effect would re-fire on every keystroke:
  // a `docs_read` per debounce window, and a re-render that discards the reader's scroll.
  //
  // It does not churn, because `selected` is a STRING and an unchanged winner compares equal.
  // That holds only as long as `pickInitialDoc` answers by identity rather than by anything
  // derived from the timestamps, which is what this asserts.
  it("returns the IDENTICAL path when mtimes all advance but the winner is unchanged", () => {
    const before = [VISION, WBS, WIP, SESSION];
    // Every mtime moves — the realistic shape of a list refresh mid-turn.
    const after = before.map((e) => ({ ...e, mtime_ms: e.mtime_ms + 5_000 }));

    expect(pickInitialDoc(after)).toBe(pickInitialDoc(before));
    // Same string, so the `useEffect` dep comparison is equal and the fetch does not re-fire.
    expect(pickInitialDoc(after)).toBe("workflow-system/state/.session.md");
  });

  it("still moves the winner when the mtime churn CHANGES which wip is newest", () => {
    // The complement of the case above: stability must not be achieved by ignoring mtime,
    // which would break the multi-WIP tiebreak this function exists to provide.
    const wipA = doc("workflow-system/state/wip/feature-a.md", "wip", 1_000);
    const wipB = doc("workflow-system/state/wip/feature-b.md", "wip", 2_000);
    expect(pickInitialDoc([wipA, wipB])).toBe(wipB.rel_path);
    // Now A is the one being edited.
    expect(pickInitialDoc([{ ...wipA, mtime_ms: 9_000 }, wipB])).toBe(
      wipA.rel_path,
    );
  });
});

describe("falling through when the top-ranked doc DISAPPEARS (WP4 depends on this)", () => {
  // ⚠️ Not hypothetical: `/session-restore` DELETES `.session.md` at its step 7, every
  // restore. So "the top-ranked doc vanished while the panel was open" is a routine
  // sequence, not an edge case. WP4 wires the fs-change re-run; these tests pin that the
  // ranking it will call already produces the right answer, so WP4 only has to re-invoke
  // it. (Operator question at Phase 2 verify-human, 2026-08-02.)

  it("falls to the wip file when .session.md is removed from the set", () => {
    const full = [VISION, ROADMAP, WBS, WIP, SESSION];
    expect(pickInitialDoc(full)).toBe("workflow-system/state/.session.md");
    const afterDelete = full.filter((e) => e.kind !== "session");
    expect(pickInitialDoc(afterDelete)).toBe(
      "workflow-system/state/wip/feature-a.md",
    );
  });

  it("cascades down the whole ranking as each top doc is removed", () => {
    // Each successive deletion must land on the next-most-downstream doc, not jump to an
    // arbitrary one. Walks the full chain in one test so a gap anywhere is visible.
    let set = [VISION, ROADMAP, WBS, WIP, SESSION];
    const landings: string[] = [];
    for (let i = 0; i < 5; i++) {
      const chosen = pickInitialDoc(set);
      landings.push(chosen ?? "NULL");
      set = set.filter((e) => e.rel_path !== chosen);
    }
    expect(landings).toEqual([
      "workflow-system/state/.session.md",
      "workflow-system/state/wip/feature-a.md",
      "workflow-system/product/wbs.md",
      "workflow-system/product/roadmap.md",
      "workflow-system/product/vision.md",
    ]);
  });

  it("returns null once the LAST doc is removed, rather than a stale path", () => {
    // The end of the cascade. A caller that got a path here would try to read a file that
    // does not exist; null is what tells the panel to show its "no docs" view.
    expect(pickInitialDoc([])).toBeNull();
  });
});

describe("selectedDoc — an explicit pick BEATS auto-selection", () => {
  // Operator-verified live at Phase 2 verify-human (pick a doc → switch panels → return →
  // pick survives). Pinned here as a VALUE: the wiring test can only confirm the
  // expression's source text, not that precedence holds across inputs.

  const FULL = [VISION, ROADMAP, WBS, WIP, SESSION];

  it("returns the auto-selected landing doc when the user has not picked", () => {
    expect(selectedDoc(null, FULL)).toBe("workflow-system/state/.session.md");
  });

  it("⚠️ returns the user's pick even when auto-selection would choose otherwise", () => {
    // The case that matters. Auto-selection wants `.session.md`; the user deliberately
    // opened vision.md. A "correction" back to the ranked answer would yank the doc out
    // from under a reader — the exact behavior the derived-selection design prevents.
    expect(selectedDoc("workflow-system/product/vision.md", FULL)).toBe(
      "workflow-system/product/vision.md",
    );
  });

  it("keeps the pick even for a doc the ranking never returns", () => {
    // `arch.md` is in the reference tail — auto-selection reaches it only when nothing
    // ranked exists. An explicit pick must still hold.
    expect(selectedDoc("workflow-system/product/arch.md", FULL)).toBe(
      "workflow-system/product/arch.md",
    );
  });

  it("keeps the pick when the doc SET changes underneath it (WP4's constraint)", () => {
    // WP4 re-runs pickInitialDoc when a doc appears. This is the property that stops that
    // re-run from overriding a reader: the pick survives a list that has grown or shrunk.
    const chosen = "workflow-system/product/vision.md";
    const grown = [
      ...FULL,
      doc("workflow-system/state/wip/new-phase.md", "wip", 9999),
    ];
    expect(selectedDoc(chosen, grown)).toBe(chosen);
    expect(selectedDoc(chosen, [VISION, ROADMAP])).toBe(chosen);
  });

  it("returns null before the doc list has loaded", () => {
    // `docs === null` is "fetch in flight", distinct from "empty project". Neither may
    // produce a path for the content pane to try to read.
    expect(selectedDoc(null, null)).toBeNull();
    expect(selectedDoc(null, [])).toBeNull();
  });

  it("returns the pick even before the list loads", () => {
    // Ordering guard: the `chosen` branch must be checked BEFORE the null-docs branch, or
    // a pick made just as the list refreshes would blink away.
    expect(selectedDoc("workflow-system/product/wbs.md", null)).toBe(
      "workflow-system/product/wbs.md",
    );
  });
});

describe("selectedDoc — the `settled` latch pins an auto-selection (WP5 P3.2)", () => {
  // Fixes a defect REPRODUCED LIVE at WP5 P3.1
  // (SURFACE-2026-08-02-QUALITY-WP4-SIBLING-EDIT-MOVES-AUTOSELECTION): the bottom tier
  // recomputes `pickInitialDoc(docs)`, and the caller refreshes `docs` with fresh mtimes on
  // every `fs-change`, so editing a file the reader was NOT looking at moved the selection —
  // measured as reading `older-feature.md` at scrollTop 600, then landing at scrollTop 0 of
  // `newer-feature.md`. Operator decision: "pin once resolved" — only appear/disappear may
  // move an auto-selection.

  const OLDER = doc("workflow-system/state/wip/older-feature.md", "wip", 1000);
  const NEWER = doc("workflow-system/state/wip/newer-feature.md", "wip", 2000);

  it("⚠️ THE REGRESSION: a sibling's mtime overtaking the latched doc does NOT move the selection", () => {
    // Baseline — unlatched, the live compute picks the newest wip.
    expect(selectedDoc(null, [OLDER, NEWER])).toBe(NEWER.rel_path);

    // The reader is parked on NEWER (latched). Now the SIBLING becomes newest, which is
    // exactly the live sequence: `older-feature.md` gets touched.
    const siblingNowNewest = [{ ...OLDER, mtime_ms: 9999 }, NEWER];

    // Without the latch this returns OLDER (the defect). With it, the reader stays put.
    expect(selectedDoc(null, siblingNowNewest, null, NEWER.rel_path)).toBe(
      NEWER.rel_path,
    );
    // And the un-latched call still moves — proving the fixture actually reproduces the
    // defect, so the assertion above is not passing vacuously.
    expect(selectedDoc(null, siblingNowNewest)).toBe(OLDER.rel_path);
  });

  it("ranks BELOW an explicit pick and below a jump", () => {
    // The latch is the weakest non-default tier: it must never outrank the user or a jump.
    expect(
      selectedDoc(WBS.rel_path, [OLDER, NEWER], null, NEWER.rel_path),
    ).toBe(WBS.rel_path);
    expect(
      selectedDoc(null, [OLDER, NEWER], WBS.rel_path, NEWER.rel_path),
    ).toBe(WBS.rel_path);
  });

  it("ranks ABOVE the live default — that is the whole point", () => {
    // If this inverted, the latch would be inert and the defect would return.
    expect(selectedDoc(null, [OLDER, NEWER], null, OLDER.rel_path)).toBe(
      OLDER.rel_path,
    );
  });

  it("a cleared latch falls back to the live compute (appear/disappear path)", () => {
    // The jump and refallback arms clear it, which is where re-ranking IS the intent.
    expect(selectedDoc(null, [OLDER, NEWER], null, null)).toBe(NEWER.rel_path);
  });

  it("is inert while the list is still loading", () => {
    // A latch must not manufacture a path before docs exist… but once set it is a plain
    // string, so it legitimately survives a refresh that momentarily nulls the list.
    expect(selectedDoc(null, null, null, null)).toBeNull();
    expect(selectedDoc(null, null, null, NEWER.rel_path)).toBe(NEWER.rel_path);
  });

  it("defaults to null, so three-argument callers are unaffected", () => {
    // Back-compat guard: WP4's call sites pass three args and must keep exact behavior.
    expect(selectedDoc(null, [OLDER, NEWER], null)).toBe(NEWER.rel_path);
  });

  it("⚠️ THE FIFTH PATH (documents the sequence; the WIRING guard is what pins it)", () => {
    // ⚠️ READ THIS BEFORE TRUSTING THIS TEST AS THE PIN. It drives the real `decideReload` and
    // asserts on `decision.selected`, i.e. it models the CORRECT caller — so it structurally
    // cannot catch a caller that ignores that value. Measured: reverting the fix (refallback
    // clearing instead of re-latching) leaves this file 35/35 GREEN; only
    // `docsPanelWiring.test.ts`'s site guard fails. This test is executable documentation of
    // the sequence; the wiring guard prevents the regression. Naming it otherwise would be the
    // same category error this milestone spent two phases un-learning.
    // Found at WP5 P3 verify-self, in SHIPPED code, by an adversarial audit. The first fix
    // released the latch in the `refallback` arm (`setSettled(null)`) by analogy with
    // `jumpedTo`. But the two arms are NOT symmetric: `"jump"` releases and immediately
    // writes `jumpedTo`, so a tier above still pins the selection — whereas `"refallback"`
    // writes NOTHING (chosen=null, jumpedTo=null), so a null latch drops the panel onto the
    // live-compute tier and leaves it there PERMANENTLY. The next sibling edit then moved the
    // selection again — the exact defect the tier exists to prevent.
    //
    // ⚠️ And the trigger is the most routine event in this workflow: `/session-restore`
    // deletes `.session.md` on EVERY restore (`docsReloadDecision.ts` calls it "the routine
    // case, not an edge case"), so this was not a corner.
    //
    // Modelled as the caller's sequence, because no single call to a pure function can
    // express it — the bug lives in the STATE THE ARM LEAVES BEHIND, which is precisely the
    // blind spot `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]` and the
    // "extracting a machine proves the MACHINE, not its CALLER" rule both warn about.
    const SESSION_DOC = doc(
      "workflow-system/state/.session.md",
      "session",
      3000,
    );
    const withSession = [OLDER, NEWER, SESSION_DOC];

    // 1. Panel opens: the session pointer is top-ranked and gets latched.
    const latchedAtOpen = selectedDoc(null, withSession, null, null);
    expect(latchedAtOpen).toBe(SESSION_DOC.rel_path);

    // 2. `/session-restore` deletes it → the refallback arm resolves the new answer.
    const afterDelete = [OLDER, NEWER];
    const decision = decideReload({
      prev: withSession,
      next: afterDelete,
      selected: latchedAtOpen,
    });
    // Narrow FIRST, then read the arm's fields — `chosen`/`selected` exist only on this
    // variant, and reading them before narrowing does not type-check.
    if (decision.kind !== "refallback") {
      throw new Error(`expected refallback, got ${decision.kind}`);
    }
    expect(decision.chosen).toBeNull();
    // The arm RE-LATCHES onto this rather than clearing to null. That is the fix.
    const relatched = decision.selected;
    expect(relatched).toBe(NEWER.rel_path);

    // 3. CC touches the SIBLING, making it newest. `decideReload` says "none" — no arm runs —
    //    but the caller still calls setDocs(next), refreshing every mtime.
    const siblingNowNewest = [{ ...OLDER, mtime_ms: 9999 }, NEWER];
    expect(
      decideReload({
        prev: afterDelete,
        next: siblingNowNewest,
        selected: relatched,
      }).kind,
    ).toBe("none");

    // THE ASSERTION: the selection must HOLD.
    expect(selectedDoc(null, siblingNowNewest, null, relatched)).toBe(
      NEWER.rel_path,
    );
    // Non-vacuity: with the latch cleared (the shipped bug), the very same inputs MOVE it.
    expect(selectedDoc(null, siblingNowNewest, null, null)).toBe(
      OLDER.rel_path,
    );
  });
});
