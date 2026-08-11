import { describe, it, expect } from "vitest";
import {
  DRIVE_MODES,
  DRIVE_MODE_LINE_PREFIX,
  DRIVE_MODE_UNSET_LABEL,
  DRIVE_MODE_UNSET_PLACEHOLDER,
  MODEL_LINE_PREFIX,
  cellLines,
  driveModeChanged,
  type DriveMode,
} from "../driveMode";
import { MODEL_UNSET_LABEL } from "../modelOverride";

// M12 WP4c Phase 3 — the pure core: vocabulary, resting labels, gate collapse.
//
// `cellLines` exists so the resting-label rule and the gate-off collapse are ONE asserted
// value rather than four JSX render paths a reader has to simulate in their head. These
// tests are therefore the actual specification of the cell's text — Phase 4's component is
// obliged to render what this returns, and `pickerDriveModeCell`'s own tests assert that it
// does rather than re-deriving the strings.

const LABEL = MODEL_UNSET_LABEL; // "Default"

describe("drive-mode vocabulary", () => {
  it("lists every mode once, most supervision to least", () => {
    expect([...DRIVE_MODES]).toEqual([
      "stepping",
      "orchestrated",
      "autopilot",
      "fsd",
    ]);
    expect(new Set(DRIVE_MODES).size).toBe(DRIVE_MODES.length);
  });

  it("derives the row label from the placeholder rather than hardcoding it", () => {
    // The same indirection `MODEL_UNSET_LABEL` uses, and for the same recorded reason: those
    // two were independent hardcoded strings until code review caught it. Asserting the
    // RELATIONSHIP (prefix + shorter + no paren) rather than re-implementing `.split(" (")`,
    // which would just restate the production line and pass even if it were wrong.
    expect(DRIVE_MODE_PLACEHOLDER_STARTS_WITH_LABEL()).toBe(true);
    expect(DRIVE_MODE_UNSET_LABEL.length).toBeLessThan(
      DRIVE_MODE_UNSET_PLACEHOLDER.length,
    );
    expect(DRIVE_MODE_UNSET_LABEL).not.toContain("(");
  });

  it("labels the unset state 'None', the word the picker row shows", () => {
    expect(DRIVE_MODE_UNSET_LABEL).toBe("None");
  });
});

function DRIVE_MODE_PLACEHOLDER_STARTS_WITH_LABEL(): boolean {
  return DRIVE_MODE_UNSET_PLACEHOLDER.startsWith(DRIVE_MODE_UNSET_LABEL);
}

describe("cellLines — the resting-label table, as one value", () => {
  // The four rows of WBS Verdict (f)'s table, asserted exactly. If a future change alters
  // any cell's text, exactly one of these fails and names which state broke.

  it("gate OFF → ONE line, unprefixed, byte-identical to the pre-M12 cell", () => {
    // The operator's decision (2026-08-10): with workflow features off, this cell must be
    // what it always was — not a reserved empty second line, not a disabled mode line.
    expect(cellLines(null, null, false, LABEL)).toEqual([
      { kind: "model", text: "Default", isUnset: true },
    ]);
    expect(cellLines("opus", null, false, LABEL)).toEqual([
      { kind: "model", text: "opus", isUnset: false },
    ]);
  });

  it("gate OFF drops the mode line even when a mode IS persisted", () => {
    // The value survives on disk (so re-enabling restores it) but must not be rendered —
    // the seam contract is "must not exist when off", not "must be empty when off".
    const lines = cellLines("opus", "autopilot", false, LABEL);
    expect(lines).toHaveLength(1);
    expect(lines.map((l) => l.kind)).not.toContain("driveMode");
    expect(JSON.stringify(lines)).not.toContain("autopilot");
  });

  it("gate ON, neither set → both lines LABELLED", () => {
    expect(cellLines(null, null, true, LABEL)).toEqual([
      { kind: "model", text: "Model: Default", isUnset: true },
      { kind: "driveMode", text: "Drive Mode: None", isUnset: true },
    ]);
  });

  it("gate ON, both set → both lines BARE", () => {
    // Once set, a value is self-describing and a prefix is noise.
    expect(cellLines("opus", "autopilot", true, LABEL)).toEqual([
      { kind: "model", text: "opus", isUnset: false },
      { kind: "driveMode", text: "autopilot", isUnset: false },
    ]);
  });

  it("gate ON, mixed → labels the unset line only (mixed rows are legitimate)", () => {
    expect(cellLines("opus", null, true, LABEL)).toEqual([
      { kind: "model", text: "opus", isUnset: false },
      { kind: "driveMode", text: "Drive Mode: None", isUnset: true },
    ]);
    expect(cellLines(null, "fsd", true, LABEL)).toEqual([
      { kind: "model", text: "Model: Default", isUnset: true },
      { kind: "driveMode", text: "fsd", isUnset: false },
    ]);
  });

  it("renders every mode as its bare wire string", () => {
    // Guards against a display-name mapping creeping in: the row shows the wire value, which
    // is also the word the operator types at the workflow prompt.
    for (const mode of DRIVE_MODES) {
      const [, modeLine] = cellLines("opus", mode, true, LABEL);
      expect(modeLine.text).toBe(mode);
      expect(modeLine.isUnset).toBe(false);
    }
  });

  it("keeps the model line first — the order Verdict (f) chose", () => {
    // Option 2 stacks model OVER drive mode inside the existing column. Order is asserted as
    // a value so a reorder is a deliberate edit here, not a silent UI change.
    expect(cellLines(null, null, true, LABEL).map((l) => l.kind)).toEqual([
      "model",
      "driveMode",
    ]);
  });

  it("uses the prefixes from ONE place, not inlined per render site", () => {
    // Ties the rendered text to the exported constants. If someone inlines "Model: " at a
    // render site and later edits the constant, this catches the divergence.
    const [modelLine, modeLine] = cellLines(null, null, true, LABEL);
    expect(modelLine.text.startsWith(MODEL_LINE_PREFIX)).toBe(true);
    expect(modeLine.text.startsWith(DRIVE_MODE_LINE_PREFIX)).toBe(true);
  });

  it("takes the model's unset label as a PARAMETER, not by importing it", () => {
    // Keeps the two features decoupled — this module must not import `modelOverride.ts` to
    // read one constant. Proven by passing a value the real constant never has.
    const [modelLine] = cellLines(null, null, true, "SENTINEL");
    expect(modelLine.text).toBe("Model: SENTINEL");
  });
});

describe("driveModeChanged — suppresses redundant whole-file writes", () => {
  it("is false when the value is unchanged, both set and unset", () => {
    // Every `projects.json` write is a whole-file read-modify-write
    // (`SURFACE-2026-08-03-PROJECTS-JSON-WRITERS-ARE-WHOLE-FILE-RMW`), so a no-op commit is
    // worth suppressing rather than shrugging at.
    expect(driveModeChanged("autopilot", "autopilot")).toBe(false);
    expect(driveModeChanged(null, null)).toBe(false);
  });

  it("is true across every real transition, including set→unset", () => {
    expect(driveModeChanged("autopilot", null)).toBe(true);
    expect(driveModeChanged(null, "autopilot")).toBe(true);
    expect(driveModeChanged("fsd", "autopilot")).toBe(true);
  });
});

// Compile-time: the runtime list cannot drift from the union.
const _exhaustive: readonly DriveMode[] = DRIVE_MODES;
void _exhaustive;
