import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { sumByKind, type SegKind } from "../kinds";

// ── FE/BE minute-rounding PARITY ────────────────────────────────────────────────────────────
//
// `ms_to_minutes_round` (Rust, `time_store/query.rs`) and `msToMinutesRound` (TS, `kinds.ts`)
// are an intentional, documented mirror: sum durations at ms precision, convert the TOTAL once,
// so sub-minute segments accrue real time instead of each flooring to zero.
//
// ⚠️ Both were pinned INDEPENDENTLY and nothing asserted they AGREE. Each test could pass while
// the two implementations diverged — most plausibly at the 30_000ms half-up boundary or the
// negative/zero clamp, which are exactly the points a "simplification" touches.
// (`SURFACE-2026-07-13-QUALITY-MINQUANT-HELPER-PARITY-UNPINNED`.)
//
// The vector table below is the shared contract. The Rust side asserts the SAME table (see
// `ms_to_minutes_round_matches_the_frontend_parity_vectors` in `time_store/query/tests.rs`), so
// a change to either implementation that is not made to both fails on one side.
//
// Kept as literal `[input, expected]` pairs rather than a formula: a formula duplicated on both
// sides would drift in lockstep with the bug, which is the failure this test exists to prevent.

/** `[durationMs, expectedMinutes]` — the cross-language contract. Mirrored in Rust. */
export const MINUTE_ROUNDING_VECTORS: ReadonlyArray<readonly [number, number]> =
  [
    [-1, 0], // negative clamps to zero
    [0, 0],
    [1, 0],
    [29_999, 0], // just below the half-up point
    [30_000, 1], // the half-up point itself — rounds UP
    [30_001, 1],
    [59_999, 1],
    [60_000, 1],
    [89_999, 1], // just below the next half-up point
    [90_000, 2],
    [90_001, 2],
  ];

const AI_KIND: SegKind = "ai-doing";

/** Drive the real TS helper through its only exported consumer. */
function tsMinutes(durMs: number): number {
  const seg = {
    kind: AI_KIND,
    start: 0,
    end: durMs,
    dur_ms: durMs,
  };
  return sumByKind([seg], AI_KIND);
}

describe("minute rounding agrees across the FE/BE mirror", () => {
  it.each(MINUTE_ROUNDING_VECTORS)(
    "%i ms → %i min (TS side)",
    (durMs, expected) => {
      expect(tsMinutes(durMs)).toBe(expected);
    },
  );

  it("the Rust side asserts the SAME vectors", () => {
    // The parity claim is only real if both sides are pinned to one table. Rather than
    // duplicating the numbers into Rust prose and hoping, assert that the Rust test exists and
    // carries each vector — so deleting or weakening it fails HERE too.
    //
    // ⚠️ Whitespace-flattened: rustfmt wraps these differently than the source is written, and
    // matching across its line breaks is how a sibling guard in this repo silently stopped
    // checking (see `docs/lessons/source-text-guards.md` §3).
    const rustTests = readFileSync(
      join(
        fileURLToPath(new URL("../../../../../", import.meta.url)),
        "src-tauri/src/time_store/query/tests.rs",
      ),
      "utf8",
    );
    const flat = rustTests.replace(/\s+/g, " ");
    expect(
      flat,
      "the Rust parity test is missing — the FE vectors above then prove only that TS agrees with itself",
    ).toContain("ms_to_minutes_round_matches_the_frontend_parity_vectors");
    for (const [durMs, expected] of MINUTE_ROUNDING_VECTORS) {
      expect(
        flat,
        `the Rust parity table is missing the vector (${durMs} → ${expected})`,
      ).toContain(`(${durMs.toString().replace(/_/g, "")}, ${expected})`);
    }
  });
});
