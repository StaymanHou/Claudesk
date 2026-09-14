// M15 WP4 Phase 1 — the context-pressure read's contract.
//
// ⚠️ The two failure modes this module exists to prevent are both SILENT:
//   1. SUMMING across lines multiplies the reading by the turn count and crosses any threshold
//      almost immediately — a recycle that fires constantly.
//   2. Returning 0 for an unreadable transcript reads as "maximum headroom" — a recycle that
//      never fires, or fires on a lie.
// Each has a test below that would FAIL on the naive implementation, not merely pass on the
// correct one. The anti-sum case in particular is built so that a summing implementation
// cannot produce the expected number by luck.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  isOverPressure,
  readContextTokens,
  RECYCLE_TOKEN_THRESHOLD,
} from "../contextPressure";
import { parseTranscript } from "../transcript";
import type { TranscriptLine, TranscriptUsage } from "../transcript";

/** An assistant line carrying a usage reading. */
const assistant = (usage: TranscriptUsage): TranscriptLine => ({
  type: "assistant",
  message: { role: "assistant", content: [{ type: "text", text: "x" }], usage },
});

/** An assistant line with NO usage — the walk must skip it, not stop. */
const assistantNoUsage = (): TranscriptLine => ({
  type: "assistant",
  message: { role: "assistant", content: [{ type: "text", text: "x" }] },
});

const user = (): TranscriptLine => ({
  type: "user",
  message: { role: "user", content: "hello" },
});

describe("readContextTokens", () => {
  it("sums the three context components of the last assistant line", () => {
    // ⚠️ The exact shape observed live in this project's own transcript at WP4 plan time.
    // 2 + 2053 + 132347 = 134402.
    const lines = [
      assistant({
        input_tokens: 2,
        cache_creation_input_tokens: 2053,
        cache_read_input_tokens: 132347,
      }),
    ];
    expect(readContextTokens(lines)).toBe(134_402);
  });

  it("excludes output_tokens — it is what the turn produced, not what it occupied", () => {
    const lines = [
      assistant({
        input_tokens: 100,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        // Extra field the type does not model; a reader that spread the object would pick it up.
        ...({ output_tokens: 9_999_999 } as object),
      }),
    ];
    expect(readContextTokens(lines)).toBe(100);
  });

  it("reads the LAST assistant line even when an EARLIER one is larger", () => {
    // ⚠️ Kills a `max()` implementation. The later reading is the smaller one, so anything
    // that takes the maximum returns 500_000 instead of 100.
    const lines = [
      assistant({ input_tokens: 500_000 }),
      user(),
      assistant({ input_tokens: 100 }),
    ];
    expect(readContextTokens(lines)).toBe(100);
  });

  it("does NOT sum across lines — three over-threshold turns with a small last turn read small", () => {
    // ⚠️ THE ANTI-SUM GUARD. Each earlier line is itself over the 400k threshold and the three
    // together total 750_100, but the LAST line reads 100_000. A summing implementation returns
    // 850_100 (over threshold); a last-line implementation returns 100_000 (under). The two
    // answers land on OPPOSITE sides of the threshold, so this test cannot pass by luck.
    const lines = [
      assistant({ input_tokens: 250_000 }),
      user(),
      assistant({ input_tokens: 250_000 }),
      user(),
      assistant({ input_tokens: 250_100 }),
      user(),
      assistant({ input_tokens: 100_000 }),
    ];
    expect(readContextTokens(lines)).toBe(100_000);
    expect(isOverPressure(readContextTokens(lines))).toBe(false);
  });

  it("skips an assistant line with no usage and keeps walking backward", () => {
    // ⚠️ Stopping at the first usage-less assistant line would return null here, and null
    // suppresses the recycle — a silent withhold for a transcript that IS readable.
    const lines = [assistant({ input_tokens: 4_242 }), assistantNoUsage()];
    expect(readContextTokens(lines)).toBe(4_242);
  });

  it("ignores user lines entirely", () => {
    const lines = [assistant({ input_tokens: 7 }), user(), user()];
    expect(readContextTokens(lines)).toBe(7);
  });

  it("treats a partial usage object as zero for the missing fields", () => {
    expect(
      readContextTokens([assistant({ cache_read_input_tokens: 55 })]),
    ).toBe(55);
  });

  it("returns a real 0 for an empty usage object — that is a reading, not an unknown", () => {
    expect(readContextTokens([assistant({})])).toBe(0);
  });

  it("returns null (unknown), never 0, when no assistant line carries usage", () => {
    // ⚠️ The distinction the whole module turns on: 0 would read as "maximum headroom".
    expect(readContextTokens([assistantNoUsage(), user()])).toBeNull();
    expect(readContextTokens([])).toBeNull();
    expect(readContextTokens([user()])).toBeNull();
  });

  it("contributes 0 rather than NaN for a non-numeric field", () => {
    const lines = [
      assistant({
        input_tokens: 10,
        cache_read_input_tokens: "nope" as unknown as number,
      }),
    ];
    // A NaN total would compare false against the threshold — withholding for the wrong reason.
    expect(readContextTokens(lines)).toBe(10);
  });
});

// ⚠️ THE REAL-FIXTURE TEST. Every other test in this file uses a usage object THIS FILE
// constructed, so they all share whatever assumptions the author held about the field's shape.
// A real captured `usage` is far richer, and two of its extra members are active traps:
//
//   • `cache_creation` — a NESTED OBJECT whose name is a prefix of `cache_creation_input_tokens`.
//     A reader matching on a prefix, or spreading/recursing, picks up the wrong member.
//   • `iterations` — a nested ARRAY that REPEATS `input_tokens` / `cache_read_input_tokens` /
//     `cache_creation_input_tokens` per entry. Any implementation that walks nested structures
//     rather than reading the three top-level fields DOUBLE-COUNTS the whole reading.
//
// Neither trap exists in a hand-written fixture, so neither is reachable by the tests above.
// This reads the same captured transcript `transcript.test.ts` and `fanOut.test.ts` already use.
describe("against a REAL captured transcript", () => {
  const lines = parseTranscript(
    readFileSync(
      new URL("./fixtures/real-chained-turn.jsonl", import.meta.url),
      "utf8",
    ).split("\n"),
  );

  it("reads the real last assistant line's three top-level fields only", () => {
    // 2 + 503 + 145232 = 145_737. ⚠️ This number is the trap detector: an implementation that
    // also summed `iterations[0]` would read 291_474 (exactly double), and one that reached into
    // the nested `cache_creation` object instead of `cache_creation_input_tokens` would differ
    // too. Only the correct three-field top-level read produces 145_737.
    expect(readContextTokens(lines)).toBe(145_737);
  });

  it("does not double-count the nested `iterations` array", () => {
    // Stated as its own assertion so the failure message names the actual defect rather than
    // just an unexpected total.
    expect(readContextTokens(lines)).not.toBe(145_737 * 2);
  });

  it("classifies the real reading as under the threshold", () => {
    // A real ~146k session is comfortably under 400k — the common case the supervisor must NOT
    // recycle on.
    expect(isOverPressure(readContextTokens(lines))).toBe(false);
  });
});

describe("RECYCLE_TOKEN_THRESHOLD", () => {
  it("is 400_000 — ruling R-7's tunable starting value", () => {
    // ⚠️ Pinned so a change is deliberate. The next rung down, if this proves too eager, is
    // 500_000 (21.7% of sessions) — a measured value, not an invented one.
    expect(RECYCLE_TOKEN_THRESHOLD).toBe(400_000);
  });
});

describe("isOverPressure", () => {
  it("is false for null — an unreadable transcript must never trigger a recycle", () => {
    expect(isOverPressure(null)).toBe(false);
  });

  it("is false at exactly the threshold, true one token above", () => {
    expect(isOverPressure(RECYCLE_TOKEN_THRESHOLD)).toBe(false);
    expect(isOverPressure(RECYCLE_TOKEN_THRESHOLD + 1)).toBe(true);
  });

  it("is false for a live-shaped reading well under the threshold", () => {
    // The 134_402 observed in this project's own session at plan time.
    expect(isOverPressure(134_402)).toBe(false);
  });

  it("honors an injected threshold so the value stays tunable without editing callers", () => {
    expect(isOverPressure(150_000, 100_000)).toBe(true);
    expect(isOverPressure(150_000, 200_000)).toBe(false);
  });
});
