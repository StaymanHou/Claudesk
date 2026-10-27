// M16.5 WP3 3.2 — the transcript-format pin, against a LIVE capture.
//
// `isTurnComplete` keys on three undocumented CC transcript properties: the assistant line's
// terminal `stop_reason`, and the `system` subtypes `stop_hook_summary` / `turn_duration`. If a
// CC release renames them, every turn waits out the budget and withholds `transcript-incomplete`:
// a silent supervisor. The runtime alarm (`failureAlarm.ts`) makes that loud in the app; this file
// makes it fail a test as soon as the fixture is refreshed from the new CC
// (`tooling/adjudicator-probe/transcriptFixture.probe.ts`).
//
// ⚠️ What a rename breaks, per signal (mutation-proven at WP3 build): renaming the KEY
// `stop_reason`, or either close-line SUBTYPE, fails a test below. Renaming the VALUE `end_turn`
// does NOT, by design: any `stop_reason` other than `tool_use` counts as terminal, so that rename
// would not silence the supervisor either.
//
// ⚠️ ONE TEST PER SIGNAL, each with the other two removed. `isTurnComplete` accepts ANY of the
// three, so a single "the fixture is complete" test stays green when one signal is renamed while
// the others still complete the turn. Each test below isolates exactly one.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isTurnComplete,
  parseTranscript,
  readTurn,
  type TranscriptLine,
} from "../transcript";

const live = (): TranscriptLine[] =>
  parseTranscript(
    readFileSync(resolve(__dirname, "fixtures/live-turn-close.jsonl"), "utf8")
      .split("\n")
      .filter((l) => l.trim()),
  );

const isClose = (l: TranscriptLine, subtype: string): boolean =>
  l.type === "system" && (l as { subtype?: string }).subtype === subtype;

/** The fixture with the assistant line's stop_reason blanked (not terminal). */
const withoutStopReason = (lines: TranscriptLine[]): TranscriptLine[] =>
  lines.map((l) =>
    l.type === "assistant"
      ? { ...l, message: { ...l.message, stop_reason: undefined } }
      : l,
  );

describe("the live CC turn-close fixture", () => {
  it("is a real capture: a user line, an assistant line, both close lines, and a CC version", () => {
    const lines = live();
    expect(lines.map((l) => l.type)).toEqual([
      "user",
      "assistant",
      "system",
      "system",
    ]);
    const versions = new Set(
      lines.map((l) => (l as { version?: string }).version),
    );
    expect(versions.size).toBe(1);
    expect([...versions][0]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("is complete as captured, and the reader finds its verdict", () => {
    expect(isTurnComplete(live())).toBe(true);
    expect(readTurn(live()).edgeId).toBe("F8");
  });

  it("⚠️ the assistant's `stop_reason` ALONE completes the turn", () => {
    const lines = live().filter(
      (l) => !isClose(l, "stop_hook_summary") && !isClose(l, "turn_duration"),
    );
    expect(lines).toHaveLength(2);
    expect(isTurnComplete(lines)).toBe(true);
  });

  it("⚠️ `stop_hook_summary` ALONE completes the turn", () => {
    const lines = withoutStopReason(live()).filter(
      (l) => !isClose(l, "turn_duration"),
    );
    expect(lines.some((l) => isClose(l, "stop_hook_summary"))).toBe(true);
    expect(isTurnComplete(lines)).toBe(true);
  });

  it("⚠️ `turn_duration` ALONE completes the turn", () => {
    const lines = withoutStopReason(live()).filter(
      (l) => !isClose(l, "stop_hook_summary"),
    );
    expect(lines.some((l) => isClose(l, "turn_duration"))).toBe(true);
    expect(isTurnComplete(lines)).toBe(true);
  });

  it("anti-vacuity: with all three signals removed, the turn is NOT complete", () => {
    const lines = withoutStopReason(live()).filter((l) => l.type !== "system");
    expect(isTurnComplete(lines)).toBe(false);
  });
});
