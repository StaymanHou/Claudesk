import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyCommittedDriveMode } from "../applyCommittedModel";
import type { RecentProject } from "../ProjectPicker";

// M12 WP4c Phase 4 — structural guards for the two-line picker cell.
//
// ## ⚠️ Read this before adding to this file
// This repo has **no component-render harness** (`SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`),
// so a rendered-DOM assertion is not available in vitest. That makes source-text guards the
// only automated option here — and this repo has been burned by them **four** separate times
// (rotted by a Prettier reflow; satisfied by the module's own comments; passing while the
// behavior was broken; a predicate matching the wrong window). So every guard below obeys the
// hard-won rules:
//
//   1. **Strip comments first.** This file's subject documents its own defences at length, so
//      an unstripped search would be satisfied by the prose explaining the rule
//      (`[[raw-guard-identifier-satisfied-by-own-comments]]`).
//   2. **Assert CALL SHAPES and single identifiers, never formatted multi-line expressions**
//      — a reflow must not be able to break a green test into red or vice versa.
//   3. **Be honest about the boundary.** These prove STRUCTURE, never runtime. The click
//      disambiguation and the hit-testing were verified LIVE via the MCP bridge
//      (`elementFromPoint` resolving each line to itself); that is the real evidence, recorded
//      in the WIP. These guards only stop a silent regression of the structure that made it work.

function cellSource(): string {
  return readFileSync(
    join(process.cwd(), "src", "components", "picker", "ProjectModelCell.tsx"),
    "utf8",
  );
}

/** Strip block + line comments so prose cannot satisfy a guard. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("the cell renders cellLines() output rather than re-deriving strings", () => {
  it("calls cellLines and does not inline the label prefixes", () => {
    const code = codeOnly(cellSource());

    // The whole reason `cellLines` was extracted: this milestone's most-repeated defect is a
    // proven pure module sitting behind a caller that ignores it (4 instances). Asserting the
    // CALL, not the identifier — a bare `cellLines` mention would also match an import line
    // that nothing uses.
    expect(code).toMatch(/cellLines\(/);

    // …and the prefixes must NOT be re-typed here. They live in `cc/driveMode.ts` in ONE
    // place; inlining a copy is how the two independent hardcoded strings that
    // MODEL_UNSET_LABEL's derivation exists to prevent came about in the first place.
    expect(code).not.toContain('"Model: "');
    expect(code).not.toContain('"Drive Mode: "');
    expect(code).not.toContain("Drive Mode:");
  });

  it("does not reimplement the gate collapse with its own conditional", () => {
    const code = codeOnly(cellSource());
    // `cellLines` already omits the mode line when the gate is off, so the component must
    // follow the DATA (`modeLine &&`) rather than branching on the gate a second time. A
    // second decision site is a second thing to keep in sync — and the one that would drift.
    expect(code).not.toMatch(/gateEnabled\s*&&/);
    expect(code).not.toMatch(/if\s*\(\s*!?gateEnabled\s*\)/);
    expect(code).toMatch(/modeLine\s*&&/);
  });
});

describe("each line owns its own hit region (the WP's structural risk)", () => {
  it("stops propagation on BOTH pointerdown and click", () => {
    // Copied verbatim from WP3's `⊘` door. Click alone is not enough: an ancestor listening on
    // pointerdown would still fire, which is the silent "the control does the wrong thing"
    // failure.
    //
    // ⚠️ Asserted as a COUNTED PAIR, not three independent existence checks. The previous form
    // matched `onPointerDown=…`, `onClick=`, and `stopPropagation` separately, so it degenerated
    // in two ways: a bare `onClick=` anywhere satisfied the second, and ANY `stopPropagation` in
    // the file satisfied the third — including the pointerdown handler's own. Deleting the
    // click-side `stopPropagation` (the exact regression the test names in its first line) left
    // all three green. (`SURFACE-2026-08-10-QUALITY-WP4C-POINTERDOWN-GUARD-DEGENERATES`.)
    //
    // Whitespace is flattened first so the pair survives a Prettier reflow — matching across a
    // line break is what broke a sibling guard in this repo (see
    // `docs/lessons/source-text-guards.md` §3).
    const flat = codeOnly(cellSource()).replace(/\s+/g, " ");

    const pointerStops = (
      flat.match(/onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}/g) ?? []
    ).length;
    const clickStops = (
      flat.match(/onClick=\{\(e\) => \{? ?e\.stopPropagation\(\)/g) ?? []
    ).length;

    expect(
      pointerStops,
      "every interactive line must stop propagation on pointerdown",
    ).toBeGreaterThanOrEqual(1);
    expect(
      clickStops,
      "the click side must stop propagation TOO — a pointerdown-only guard leaves the " +
        "ancestor row handler firing on click, which is the regression this test is named for",
    ).toBeGreaterThanOrEqual(1);
    // ...and they must be PAIRED: one control stopping only pointerdown while another stops
    // only click would satisfy both counts above independently.
    expect(
      pointerStops,
      "pointerdown and click stops must come in pairs — an unequal count means one control " +
        "guards only half its activation path",
    ).toBe(clickStops);
  });

  it("mirrors activation onto Enter and Space", () => {
    // A `<span role="button">` has NO implicit keyboard activation, so without this the two
    // lines are mouse-only — an accessibility regression invisible to every visual check.
    const code = codeOnly(cellSource());
    expect(code).toMatch(/onKeyDown=/);
    expect(code).toContain('e.key === "Enter"');
    expect(code).toContain('e.key === " "');
  });

  it("makes both lines focusable", () => {
    expect(codeOnly(cellSource())).toMatch(/tabIndex=\{0\}/);
  });

  it("routes BOTH lines through the single writer (P4.4)", () => {
    const code = codeOnly(cellSource());
    // Two call sites of ONE function — not two hand-rolled optimistic-write sequences. If a
    // future edit inlines one of them, this count drops and the structural guarantee is gone.
    const calls = code.match(/commitCellValue</g) ?? [];
    expect(
      calls.length,
      "both the model and drive-mode commits must go through commitCellValue; " +
        "a hand-rolled second write path is the M11 WP4 defect this shape prevents",
    ).toBe(2);
  });

  it("carries an EXECUTABLE gate-seam reference, not a comment", () => {
    // Measured at M11: the OFF-invariant guard strips comments, so a comment-only mention does
    // NOT satisfy it. A type alias survives the strip AND breaks the build if the hook is
    // renamed — which is the coupling worth having.
    const code = codeOnly(cellSource());
    expect(code).toMatch(/ReturnType<typeof useWorkflowFeaturesEnabled>/);
    expect(code).toMatch(/useWorkflowFeaturesEnabled\(\)/);
  });

  it("does NOT put a cell-wide click handler back on the container", () => {
    // The regression this file exists to prevent: the pre-M12 cell WAS a single <button> with
    // one handler. Restoring that shape would make a click on the mode line open the model
    // editor — the exact ambiguity that has no unit-test signature.
    const code = codeOnly(cellSource());
    // The container's onClick may only stop propagation; it must not activate an editor.
    expect(code).not.toMatch(/onClick=\{\(\) => setEditingModel\(true\)\}/);
    expect(code).not.toMatch(
      /className="picker-recent-model[^"]*"\s*\n?\s*onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*setEditing/,
    );
  });
});

describe("applyCommittedDriveMode — the recents write-back twin", () => {
  const rows: RecentProject[] = [
    { project_path: "/a", default_model: "opus", default_drive_mode: null },
    { project_path: "/b", default_model: null, default_drive_mode: "fsd" },
  ];

  it("replaces the mode on the matching row only", () => {
    const next = applyCommittedDriveMode(rows, "/a", "autopilot");
    expect(next[0].default_drive_mode).toBe("autopilot");
    expect(next[1].default_drive_mode).toBe("fsd");
  });

  it("does not mutate the input array", () => {
    const next = applyCommittedDriveMode(rows, "/a", "autopilot");
    expect(rows[0].default_drive_mode).toBeNull();
    expect(next).not.toBe(rows);
  });

  it("treats null as a real value that clears a previous mode", () => {
    // Not a missing input to be ignored — it must overwrite `"fsd"`, or a cleared mode would
    // reappear after a filter round-trip re-seeded the cell.
    expect(
      applyCommittedDriveMode(rows, "/b", null)[1].default_drive_mode,
    ).toBeNull();
  });

  it("leaves the model field untouched", () => {
    // The two lines write independent fields; a shared-object bug would show up here.
    const next = applyCommittedDriveMode(rows, "/a", "autopilot");
    expect(next[0].default_model).toBe("opus");
  });

  it("is a no-op for an unknown path rather than resurrecting a removed row", () => {
    const next = applyCommittedDriveMode(rows, "/gone", "autopilot");
    expect(next).toHaveLength(2);
    expect(next.map((r) => r.project_path)).toEqual(["/a", "/b"]);
  });
});
