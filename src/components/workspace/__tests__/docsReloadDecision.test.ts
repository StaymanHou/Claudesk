import { describe, expect, it } from "vitest";
import {
  decideReload,
  shouldJump,
  type ReloadDecision,
} from "../docs/docsReloadDecision";
import type { DocEntry } from "../docsOrder";

// M11 WP4 P1.2 — the reload decision, asserted as VALUES by driving the real module.
//
// ⚠️ Method note, and it is the reason this file exists in this shape. WP3 shipped two
// source-text guards for a behavioral property, and BOTH passed while the property was
// broken — the second while the full 1645-test suite was green. The lesson recorded from it
// (`extract-for-import-when-a-raw-guard-cant-express-the-property`) is that a better
// predicate does not help: a source-text guard can only encode the shapes you thought of.
// So every assertion below imports `decideReload` and feeds it real doc sets. There is no
// re-implementation of the diff here — a behavioral test that re-implements the code under
// test shares its blind spot instead of covering it.

const doc = (rel_path: string, kind: string, mtime_ms = 1_000): DocEntry => ({
  rel_path,
  kind,
  file_name: rel_path.slice(rel_path.lastIndexOf("/") + 1),
  mtime_ms,
});

const VISION = doc("workflow-system/product/vision.md", "vision");
const WBS = doc("workflow-system/product/wbs.md", "wbs");
const ARCH = doc("workflow-system/product/arch.md", "arch");
const WIP_A = doc("workflow-system/state/wip/feature-a.md", "wip");
const WIP_B = doc("workflow-system/state/wip/feature-b.md", "wip", 2_000);
const SESSION = doc("workflow-system/state/.session.md", "session");

/** Same entry, later mtime — a content edit with no identity change. */
const touched = (e: DocEntry, mtime_ms: number): DocEntry => ({
  ...e,
  mtime_ms,
});

describe("the four outcomes", () => {
  it("identical sets → none (no re-read, no re-render)", () => {
    const set = [VISION, WBS, WIP_A];
    expect(
      decideReload({ prev: set, next: [...set], selected: WIP_A.rel_path }),
    ).toEqual<ReloadDecision>({ kind: "none" });
  });

  it("the selected doc's mtime moved → content, selection untouched", () => {
    const decision = decideReload({
      prev: [VISION, WBS, WIP_A],
      next: [VISION, WBS, touched(WIP_A, 9_999)],
      selected: WIP_A.rel_path,
    });
    // `content` carries no `selected`/`chosen` field precisely so a caller cannot
    // accidentally reassign the selection on a mere re-render.
    expect(decision).toEqual<ReloadDecision>({ kind: "content" });
  });

  it("a doc appeared → jump, carrying pickInitialDoc's answer for the NEW set", () => {
    // Panel is on wbs.md; a wip file appears. `wip` outranks `wbs` in the ranking, so the
    // jump target is the new file — which is the whole point of the arm (a new phase
    // started, and landing on it is the re-orientation).
    const decision = decideReload({
      prev: [VISION, WBS],
      next: [VISION, WBS, WIP_A],
      selected: WBS.rel_path,
    });
    expect(decision).toEqual<ReloadDecision>({
      kind: "jump",
      selected: WIP_A.rel_path,
    });
  });

  it("the selected doc disappeared → refallback with the sentinel CLEARED", () => {
    // The routine `/session-restore` step-7 sequence: the panel lands on `.session.md`
    // (top-ranked), the restore deletes it at step 7, and the panel must not keep rendering
    // text from a file that no longer exists.
    const decision = decideReload({
      prev: [VISION, WBS, WIP_A, SESSION],
      next: [VISION, WBS, WIP_A],
      selected: SESSION.rel_path,
    });
    expect(decision).toEqual<ReloadDecision>({
      kind: "refallback",
      chosen: null,
      selected: WIP_A.rel_path,
    });
  });
});

describe("⚠️ the two easy-to-miss rules from wbs.md task 4.3", () => {
  // Rule (a), part 1: an explicit pick survives a jump. Asserted through `shouldJump`,
  // which is the policy the caller applies — the decision itself still reports the jump
  // because that is a true fact about the doc set.
  it("an explicit pick is NEVER overridden by a jump", () => {
    const decision = decideReload({
      prev: [VISION, WBS],
      next: [VISION, WBS, WIP_A],
      selected: ARCH.rel_path, // the user deliberately opened arch.md
    });
    expect(decision.kind).toBe("jump");
    expect(shouldJump(ARCH.rel_path)).toBe(false);
    // …and with no explicit pick, the same jump IS applied.
    expect(shouldJump(null)).toBe(true);
  });

  // Rule (a), part 2 — the asymmetry that makes `refallback` different from every other
  // arm, and the reason it is checked FIRST in the function.
  it("an explicit pick IS overridden when the picked doc itself is deleted", () => {
    const decision = decideReload({
      prev: [VISION, WBS, ARCH, WIP_A],
      next: [VISION, WBS, WIP_A], // arch.md — the user's pick — is gone
      selected: ARCH.rel_path,
    });
    expect(decision).toEqual<ReloadDecision>({
      kind: "refallback",
      chosen: null,
      selected: WIP_A.rel_path,
    });
  });

  it("⚠️ clearing the sentinel is NOT the same as re-pointing it", () => {
    // The failure this pins: re-pointing `chosen` at the fall-back answer would look
    // identical on screen, and would then read as "the user chose this" — permanently
    // suppressing the next legitimate jump-on-appear because of an unrelated deletion.
    const decision = decideReload({
      prev: [VISION, WIP_A, SESSION],
      next: [VISION, WIP_A],
      selected: SESSION.rel_path,
    });
    if (decision.kind !== "refallback") throw new Error("expected refallback");
    expect(decision.chosen).toBeNull();
    expect(decision.chosen).not.toBe(decision.selected);
    // And the consequence that makes it matter: with the sentinel cleared, a subsequent
    // appear still jumps.
    expect(shouldJump(decision.chosen)).toBe(true);
  });

  // Rule (b): the delete+create sequence the watcher may or may not coalesce. The diff is
  // correct either way, which is why the coalescing question needed no empirical answer.
  it("a doc that disappears AND reappears in one diff step is a jump, not a content change", () => {
    // `.session.md` deleted by a restore and re-written by a handoff, both inside one
    // 200ms debounce window. The path is present in both snapshots' *identity* terms only
    // if it never left; here `prev` lacks it, so it reads as an appear.
    const decision = decideReload({
      prev: [VISION, WIP_A], // no session pointer
      next: [VISION, WIP_A, SESSION], // handoff wrote a fresh one
      selected: WIP_A.rel_path,
    });
    expect(decision).toEqual<ReloadDecision>({
      kind: "jump",
      selected: SESSION.rel_path,
    });
  });

  it("a delete+recreate of the SELECTED doc reads as refallback, not jump", () => {
    // The ordering guarantee inside the function: arm 1 (disappeared) is checked before
    // arm 2 (appeared), so a batch in which the selection vanished cannot be shadowed by
    // some other file showing up in the same window.
    const decision = decideReload({
      prev: [VISION, WIP_A, SESSION],
      next: [VISION, WIP_A, WIP_B], // SESSION gone, WIP_B new — both in one batch
      selected: SESSION.rel_path,
    });
    expect(decision.kind).toBe("refallback");
  });
});

describe("precedence and scope", () => {
  it("appear outranks content when one batch carries both", () => {
    // CC writes the WIP file it is working in AND creates a new one. The appear is the
    // more informative half, and the jump subsumes the re-render (the caller reads the
    // newly-selected doc anyway).
    const decision = decideReload({
      prev: [VISION, WIP_A],
      next: [VISION, touched(WIP_A, 9_999), WIP_B],
      selected: WIP_A.rel_path,
    });
    expect(decision.kind).toBe("jump");
  });

  it("a NON-selected doc changing its bytes is none — the panel renders one doc", () => {
    const decision = decideReload({
      prev: [VISION, WBS, WIP_A],
      next: [VISION, touched(WBS, 9_999), WIP_A],
      selected: WIP_A.rel_path,
    });
    expect(decision).toEqual<ReloadDecision>({ kind: "none" });
  });

  // ── Codified at verify-codify (P1.verify-codify) ──────────────────────────────
  // `"content"` had exactly one assertion before this, and it is the arm that fires most
  // often in real use (CC rewriting the WIP file many times per turn). These two close the
  // gap between "the arm works on a minimal fixture" and "the arm works on the shape the
  // panel actually sees".
  it("content fires on the REALISTIC mid-turn shape — many docs, only the selected one edited", () => {
    // The panel's normal state: a full doc set, unchanged siblings, and the one WIP file CC
    // is writing. The single-pair fixture above cannot distinguish "compares the selected
    // entry" from "compares the first entry" or "compares the whole array".
    const decision = decideReload({
      prev: [VISION, WBS, ARCH, WIP_A, SESSION],
      next: [VISION, WBS, ARCH, touched(WIP_A, 9_999), SESSION],
      selected: WIP_A.rel_path,
    });
    expect(decision).toEqual<ReloadDecision>({ kind: "content" });
  });

  it("content fires on ANY mtime inequality, including a clock that moved backward", () => {
    // The comparison is `!==`, not `>`, and that is deliberate rather than incidental: a
    // restored file, a `git checkout`, or a clock adjustment can lower an mtime, and the
    // rendered bytes changed either way. A `>` comparison would silently keep rendering
    // stale text in exactly those cases.
    const decision = decideReload({
      prev: [VISION, touched(WIP_A, 9_999)],
      next: [VISION, touched(WIP_A, 1_000)],
      selected: WIP_A.rel_path,
    });
    expect(decision).toEqual<ReloadDecision>({ kind: "content" });
  });

  it("a doc disappearing that is NOT the selection does not disturb the selection", () => {
    // Only `refallback` and an applied `jump` may move the selection. A sibling vanishing
    // is a list change the caller applies without touching what is rendered.
    const decision = decideReload({
      prev: [VISION, WBS, WIP_A],
      next: [VISION, WIP_A],
      selected: WIP_A.rel_path,
    });
    expect(decision).toEqual<ReloadDecision>({ kind: "none" });
  });
});

describe("total on degenerate input", () => {
  it("prev === null (first ever list) → none", () => {
    // WP3's render path already derives the landing doc, so reporting a jump here would be
    // redundant — and if a caller applied it as an explicit pick it would suppress the
    // first real jump.
    expect(
      decideReload({ prev: null, next: [VISION, WIP_A], selected: null }),
    ).toEqual<ReloadDecision>({ kind: "none" });
  });

  it("empty → non-empty is a jump", () => {
    expect(
      decideReload({ prev: [], next: [VISION], selected: null }),
    ).toEqual<ReloadDecision>({
      kind: "jump",
      selected: VISION.rel_path,
    });
  });

  it("non-empty → empty with a selection is refallback to null", () => {
    // Every doc gone (a `workflow-system/` directory removed). The panel has nothing to
    // fall back to, and `null` is the honest answer — WP3's `docsView` renders it as the
    // "no docs" view rather than an error.
    expect(
      decideReload({ prev: [VISION], next: [], selected: VISION.rel_path }),
    ).toEqual<ReloadDecision>({
      kind: "refallback",
      chosen: null,
      selected: null,
    });
  });

  it("both empty → none", () => {
    expect(
      decideReload({ prev: [], next: [], selected: null }),
    ).toEqual<ReloadDecision>({ kind: "none" });
  });

  it("a selection present in neither snapshot does not throw or fall back", () => {
    // Defensive: `selected` should always be in the set, but a stale value must not
    // produce a spurious refallback (it never disappeared — it was never there).
    expect(
      decideReload({
        prev: [VISION],
        next: [VISION],
        selected: "workflow-system/product/nonexistent.md",
      }),
    ).toEqual<ReloadDecision>({ kind: "none" });
  });

  it("duplicate paths in a snapshot do not break the diff", () => {
    expect(
      decideReload({
        prev: [VISION, VISION],
        next: [VISION],
        selected: VISION.rel_path,
      }),
    ).toEqual<ReloadDecision>({ kind: "none" });
  });
});
