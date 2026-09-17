// M14 WP0 Phase 1 — the unsent-input watermark's contract.
//
// ⚠️ **EACH CLEARING BYTE GETS ITS OWN CASE, DELIBERATELY.** A single
// "clears on a control byte" test would pass with three of the four unimplemented — the
// four bytes are an OR, so one working arm satisfies any test that does not name them
// individually. The plan's observable outcome says "four separate cases" for exactly this
// reason.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CLEARING_BYTES,
  foldInput,
  initialUnsentInputState,
  UnsentInputWatermark,
} from "../unsentInput";

describe("foldInput — setting the watermark", () => {
  it("starts clear", () => {
    expect(initialUnsentInputState.unsentInput).toBe(false);
  });

  it("sets on an ordinary keystroke", () => {
    expect(foldInput(initialUnsentInputState, "a").unsentInput).toBe(true);
  });

  it("stays set across several chunks", () => {
    let s = initialUnsentInputState;
    for (const c of ["h", "e", "l", "l", "o"]) s = foldInput(s, c);
    expect(s.unsentInput).toBe(true);
  });

  it("ignores an empty chunk rather than treating it as input", () => {
    expect(foldInput(initialUnsentInputState, "").unsentInput).toBe(false);
    expect(foldInput({ unsentInput: true }, "").unsentInput).toBe(true);
  });
});

// ⚠️ THE FOUR ARMS, INDIVIDUALLY. See the header.
describe("foldInput — each clearing byte clears, on its own", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["CR (Enter)", "\r"],
    ["ESC", "\x1b"],
    ["Ctrl+C", "\x03"],
    ["Ctrl+U", "\x15"],
  ];

  for (const [name, byte] of cases) {
    it(`clears on ${name}`, () => {
      const typed = foldInput(initialUnsentInputState, "abc");
      expect(typed.unsentInput).toBe(true);
      expect(foldInput(typed, byte).unsentInput).toBe(false);
    });
  }

  // ⚠️ The anti-vacuity half: if `CLEARING_BYTES` were widened to include ordinary printable
  // input, every test above would still pass while the watermark cleared on everything and
  // suppressed nothing. Pin the set itself.
  it("treats ordinary printable input as NOT clearing", () => {
    for (const ch of ["a", "Z", "0", " ", "/", "\t"]) {
      const typed = foldInput(initialUnsentInputState, "abc");
      expect(
        foldInput(typed, ch).unsentInput,
        `"${ch}" must not clear the watermark`,
      ).toBe(true);
    }
  });

  it("pins the clearing set to exactly the four ruled bytes", () => {
    expect([...CLEARING_BYTES].sort((a, b) => a - b)).toEqual([
      0x03, 0x0d, 0x15, 0x1b,
    ]);
  });

  // ⚠️ LF IS NOT A CLEARING BYTE, AND THAT IS NOT AN OVERSIGHT. Raw mode disables CR→NL
  // translation, so Enter delivers 0x0d. A watermark that cleared on `\n` would never clear on
  // a real submit — and `cc-tui-cr-not-lf` records that `\n` only triggers CC's autocomplete
  // typeahead rather than executing.
  it("does NOT clear on LF — Enter is CR in raw mode", () => {
    const typed = foldInput(initialUnsentInputState, "abc");
    expect(foldInput(typed, "\n").unsentInput).toBe(true);
  });
});

describe("foldInput — order within a chunk", () => {
  // ⚠️ THE CASE A `chunk.includes("\r")` IMPLEMENTATION GETS WRONG. Both chunks below contain
  // a CR; only one of them leaves the line empty. A containment test collapses them and would
  // let the supervisor fire over the trailing `abc`.
  it("clears when the chunk ENDS with a clearing byte", () => {
    expect(foldInput(initialUnsentInputState, "abc\r").unsentInput).toBe(false);
  });

  it("stays SET when input follows the clearing byte in the same chunk", () => {
    expect(foldInput(initialUnsentInputState, "\rabc").unsentInput).toBe(true);
  });

  it("takes the LAST clearing byte's outcome across several", () => {
    expect(foldInput(initialUnsentInputState, "a\rb\rc").unsentInput).toBe(
      true,
    );
    expect(foldInput(initialUnsentInputState, "a\rb\r").unsentInput).toBe(
      false,
    );
  });
});

describe("foldInput — multi-byte input", () => {
  // ⚠️ Every UTF-8 continuation byte is >= 0x80 and all four clearing bytes are < 0x20, so a
  // glyph can never be mistaken for a clearing key. Pinned because the fold walks BYTES, which
  // is where such a confusion would live.
  it("treats a multi-byte glyph as ordinary input", () => {
    for (const glyph of ["é", "→", "😀", "日"]) {
      expect(
        foldInput(initialUnsentInputState, glyph).unsentInput,
        `"${glyph}" must set the watermark`,
      ).toBe(true);
    }
  });

  it("still clears when a clearing byte follows a glyph", () => {
    expect(foldInput(initialUnsentInputState, "😀\r").unsentInput).toBe(false);
  });
});

describe("UnsentInputWatermark — the mutable holder", () => {
  it("accumulates across pushes and clears on a clearing byte", () => {
    const w = new UnsentInputWatermark();
    expect(w.unsentInput).toBe(false);
    w.push("hel");
    w.push("lo");
    expect(w.unsentInput).toBe(true);
    w.push("\r");
    expect(w.unsentInput).toBe(false);
  });

  it("clear() resets without pretending a submit happened", () => {
    const w = new UnsentInputWatermark();
    w.push("abc");
    w.clear();
    expect(w.unsentInput).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ NO-TIMER GUARD — the operator ruling, enforced against the source.
//
// The ruling is that the predicate is a STATE, never a recency race. A future edit that
// "improves" this module with a debounce would satisfy every behavioral test above (they all
// run synchronously) while reverting the decision the feature exists to implement. Source text
// is the only place that property is visible.
//
// ⚠️ Read via `node:fs`, not a `?raw` import: `vitest-raw-import-css-returns-processed-not-text`
// records Vite transforming raw imports, and fs is unambiguous.
describe("the watermark is a state, not a timer", () => {
  const src = readFileSync(
    resolve(__dirname, "../unsentInput.ts"),
    "utf8",
  ).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ""); // ⚠️ strip comments — the prose above
  //   discusses timers at length, and a guard satisfied by its own commentary passes exactly
  //   when the code it names is deleted (`raw-guard-identifier-satisfied-by-own-comments`).

  for (const banned of [
    "setTimeout",
    "setInterval",
    "Date.now",
    "performance.now",
    "requestAnimationFrame",
  ]) {
    it(`uses no ${banned} — a debounce would not satisfy the ruling`, () => {
      expect(src).not.toContain(banned);
    });
  }

  // ⚠️ Anti-vacuity: if the read or the comment-strip ever broke to empty, every assertion
  // above would pass having scanned nothing.
  it("actually read the module source", () => {
    expect(src.length).toBeGreaterThan(400);
    expect(src).toContain("export function foldInput");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// M14 WP0 Phase 3 — THE CHANGE NOTIFICATION FIRES ON TRANSITIONS ONLY.
//
// ⚠️ **THIS IS A PERFORMANCE CONTRACT, AND IT SHIPPED UNTESTED UNTIL MUTATION TESTING CAUGHT
// IT.** `push()` runs for EVERY character the operator types, and the consumer is a `setState`
// on a component hosting a live xterm. A callback fired unconditionally would re-render that
// component on every keystroke. Removing the `if (changed)` guard passed the entire 24-test
// suite before these cases existed — a silent, invisible regression.
describe("the change callback fires on TRANSITIONS only", () => {
  it("⚠️ does NOT fire for keystrokes 2..n of the same line", () => {
    const seen: boolean[] = [];
    const w = new UnsentInputWatermark((v) => seen.push(v));
    w.push("h");
    w.push("e");
    w.push("l");
    w.push("l");
    w.push("o");
    // ONE transition (false→true) across five keystrokes.
    expect(seen).toEqual([true]);
  });

  it("fires once on set and once on clear", () => {
    const seen: boolean[] = [];
    const w = new UnsentInputWatermark((v) => seen.push(v));
    w.push("abc");
    w.push("\r");
    expect(seen).toEqual([true, false]);
  });

  it("does NOT fire when a clearing byte arrives on an already-clear watermark", () => {
    const seen: boolean[] = [];
    const w = new UnsentInputWatermark((v) => seen.push(v));
    w.push("\r");
    w.push("\x1b");
    expect(seen).toEqual([]);
  });

  it("clear() notifies only when it actually changes the value", () => {
    const seen: boolean[] = [];
    const w = new UnsentInputWatermark((v) => seen.push(v));
    w.clear();
    expect(seen).toEqual([]);
    w.push("x");
    w.clear();
    expect(seen).toEqual([true, false]);
  });

  it("works with no callback supplied (the pre-Phase-3 construction)", () => {
    const w = new UnsentInputWatermark();
    expect(() => w.push("a")).not.toThrow();
    expect(w.unsentInput).toBe(true);
  });
});
