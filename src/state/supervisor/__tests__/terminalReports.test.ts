// silent-supervisor Phase 2 — which `onData` bytes the terminal generated itself. The shapes are
// the ones captured live in the dev WKWebView (see `terminalReports.ts`).

import { describe, expect, it } from "vitest";
import { stripTerminalReports } from "../terminalReports";

describe("stripTerminalReports", () => {
  const reports: ReadonlyArray<readonly [string, string]> = [
    ["focus-in", "\x1b[I"],
    ["focus-out", "\x1b[O"],
    ["DA1 reply", "\x1b[?1;2c"],
    ["DA2 reply", "\x1b[>0;276;0c"],
    ["cursor-position report", "\x1b[24;80R"],
  ];

  for (const [name, report] of reports) {
    it(`removes a ${name}`, () => {
      expect(stripTerminalReports(report)).toBe("");
    });
  }

  it("removes several reports in one chunk and keeps the text around them", () => {
    expect(stripTerminalReports("a\x1b[I b\x1b[?1;2c c\x1b[O")).toBe("a b c");
  });

  // ⚠️ Keystroke escape sequences are operator input. Stripping them would let the supervisor
  // treat a pane the operator is navigating in as idle.
  for (const [name, key] of [
    ["up arrow", "\x1b[A"],
    ["left arrow", "\x1b[D"],
    ["Home", "\x1b[H"],
    ["Delete", "\x1b[3~"],
    ["Page Up", "\x1b[5~"],
    ["bare Esc", "\x1b"],
  ] as const) {
    it(`keeps ${name}`, () => {
      expect(stripTerminalReports(key)).toBe(key);
    });
  }

  it("leaves ordinary text and a submit untouched", () => {
    expect(stripTerminalReports("hello\r")).toBe("hello\r");
  });
});
