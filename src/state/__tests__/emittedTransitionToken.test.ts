// M16.5 WP3 3.1 — a token QUOTED in prose must not fire.
//
// Drives the real `extractEmittedTransitionId` (and, through `readTurn`, the real reader) over
// the shapes the corpus replay (`tooling/adjudicator-probe/tokenSplit.probe.ts`) found. The
// must-not-fire cases are real quotes from the corpus, paraphrased where the source turn was not
// this project's; the must-fire cases are real emitted forms.

import { describe, expect, it } from "vitest";
import {
  extractEmittedTransitionId,
  extractTransitionId,
} from "../workflowMachine/transitionToken";
import { readTurn, type TranscriptLine } from "../supervisor/transcript";

const assistant = (text: string): TranscriptLine => ({
  type: "assistant",
  message: { role: "assistant", content: [{ type: "text", text }] },
});

describe("extractEmittedTransitionId — EMITTED forms fire", () => {
  const emitted: ReadonlyArray<[string, string]> = [
    ["TRANSITION: F8", "F8"],
    ["Done.\n\nTRANSITION: F7", "F7"],
    ["**TRANSITION:** F8", "F8"],
    ["**TRANSITION: F13**", "F13"],
    ["- TRANSITION: T2", "T2"],
    ["> TRANSITION: F7", "F7"],
    ["1. TRANSITION: F5", "F5"],
    ["`TRANSITION: F10b`", "F10b"],
    ["`TRANSITION: F8` — build→verify-auto is **AUTO** in autopilot.", "F8"],
    ["Approved. **TRANSITION: F13**", "F13"],
    ["Phase 2 is codified. **TRANSITION: F15**, on to Phase 3.", "F15"],
    [
      "Human approved. `TRANSITION: F13` (verify-human → verify-codify).",
      "F13",
    ],
    ["`drive_mode: autopilot` → `TRANSITION: F38` → review-quality.", "F38"],
    ["Plan complete, `TRANSITION: F7`. Chaining.", "F7"],
    ["Planning is finished (TRANSITION: P10).", "P10"],
    [
      "(Holding here — verify-human pauses.) **TRANSITION: F13** pending.",
      "F13",
    ],
    ["Phase 1 build is done. TRANSITION: F8. Moving on.", "F8"],
    ["Triage recorded. `TRANSITION: I3 → investigate`.", "I3"],
    ["Approved → **TRANSITION: F13**", "F13"],
    // A fenced block is NOT a quote span: older sessions emitted the verdict alone in a fence.
    ["Done.\n\n```\nTRANSITION: F8\n```", "F8"],
  ];
  for (const [text, id] of emitted) {
    it(`reads ${id} from ${JSON.stringify(text)}`, () => {
      expect(extractEmittedTransitionId(text)).toBe(id);
    });
  }
});

describe("extractEmittedTransitionId — QUOTED forms do not fire", () => {
  const quoted: readonly string[] = [
    // The live 2026-09-28 wrong fire.
    'I didn\'t run any checks. The "Built / TRANSITION: F8" reply was the literal text you asked for.',
    // R214's shape: a token named in analysis prose (WP2 label AWAITING).
    "The sessions grew more complex over the same window, and `TRANSITION: F10b` prose sits further from the turn's end.",
    // WP4 verify-human checklists quoting tokens.
    '    - tokens quoted inside checklists, e.g. "I\'m still not emitting `TRANSITION: F13`".',
    '- [ ] **P3.verify-human.5:** a turn quoted `"Built / TRANSITION: F8"` mid-sentence.',
    "I'm still not emitting `TRANSITION: F13`. It would chain to `/feature-verify-codify`.",
    "I stalled: I emitted `TRANSITION: F8` (build → verify-auto), which is AUTO.",
    'To answer your "so?" — I\'d stopped on `TRANSITION: F8` again.',
    "Mode 3 has zero leaves, so the agent emits `TRANSITION: F11` without a prompt.",
    "> `Reply with exactly this one line and nothing else: TRANSITION: T2`",
    '   `Reply with only these two lines: "All done." then "TRANSITION: F5"`',
    // Only the double-quote rule catches these: the quote's own text ends in a boundary.
    'Your instruction was "Reply with: TRANSITION: F8" and I did exactly that.',
    "The prompt said \u201CDone. TRANSITION: F8\u201D, nothing else.",
  ];
  for (const text of quoted) {
    it(`withholds ${JSON.stringify(text.slice(0, 60))}…`, () => {
      expect(extractEmittedTransitionId(text)).toBeNull();
    });
  }
});

describe("extractEmittedTransitionId — which token wins", () => {
  it("takes the LAST emitted token, so a narrated table yields the turn's own verdict", () => {
    expect(
      extractEmittedTransitionId(
        "F7 goes plan → build.\nTRANSITION: F7\n\nAll done.\n\nTRANSITION: F8",
      ),
    ).toBe("F8");
  });

  it("skips a quote AFTER the verdict and keeps the verdict", () => {
    expect(
      extractEmittedTransitionId(
        "Built.\n\nTRANSITION: F8\n\n(Earlier I'd stopped on `TRANSITION: F10` by mistake.)",
      ),
    ).toBe("F8");
  });

  it("still admits every shape the Phase 3d contract pins (it parses through `extractTransitionId`)", () => {
    // Same parser underneath: an id shape the contract admits is admitted here too.
    for (const id of ["F10b", "T5a", "F-CHGLOG-1", "DEBUG-BISECT-START"]) {
      expect(extractTransitionId(`TRANSITION: ${id}`)).toBe(id);
      expect(extractEmittedTransitionId(`Done. TRANSITION: ${id}`)).toBe(id);
    }
  });
});

describe("readTurn — a quoted token is not this turn's verdict", () => {
  it("returns no edge for a turn whose only token is quoted", () => {
    const r = readTurn([
      { type: "user", message: { role: "user", content: "check it" } },
      assistant(
        'The "Built / TRANSITION: F8" reply was the literal text you asked for.',
      ),
    ]);
    expect(r.edgeId).toBeNull();
  });

  it("reads the emitted edge when the same turn also quotes one", () => {
    const r = readTurn([
      { type: "user", message: { role: "user", content: "go" } },
      assistant(
        "I'd stopped on `TRANSITION: F10` earlier.\n\nBuilt. **TRANSITION: F8**",
      ),
    ]);
    expect(r.edgeId).toBe("F8");
  });
});
