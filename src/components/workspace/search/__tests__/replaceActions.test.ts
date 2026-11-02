// M16.5 WP6 — the Find Results hover Replace buttons, as pure data.
import { describe, expect, it, vi } from "vitest";
import { formatFindResults } from "../findResultsBuffer";
import {
  replaceButtonTitle,
  replaceLineActions,
  scopeFor,
} from "../replaceActions";
import type { FileMatches } from "../searchModel";

const match = (
  line: number,
  line_text: string,
  start: number,
  end: number,
) => ({
  line,
  start,
  end,
  line_text,
});

const RESULTS: FileMatches[] = [
  {
    file: "src/a.ts",
    matches: [match(3, "foo foo", 0, 3), match(3, "foo foo", 4, 7)],
  },
  { file: "b.md", matches: [match(1, "a foo", 2, 5)] },
];

describe("scopeFor", () => {
  it("carries a match row back verbatim, in the backend's snake_case shape", () => {
    expect(
      scopeFor({
        kind: "match",
        file: "src/a.ts",
        match: match(3, "foo foo", 4, 7),
      }),
    ).toEqual({
      kind: "match",
      path: "src/a.ts",
      line: 3,
      start: 4,
      end: 7,
      line_text: "foo foo",
    });
  });

  it("names just the path for a file target", () => {
    expect(scopeFor({ kind: "file", file: "b.md" })).toEqual({
      kind: "file",
      path: "b.md",
    });
  });
});

describe("replaceButtonTitle", () => {
  const row = { kind: "match", file: "x", match: match(1, "q", 0, 1) } as const;
  const file = { kind: "file", file: "src/a.ts" } as const;

  it("names the replacement text", () => {
    expect(replaceButtonTitle(row, "bar")).toBe('Replace with "bar"');
    expect(replaceButtonTitle(file, "bar")).toBe(
      'Replace every match in src/a.ts with "bar"',
    );
  });

  it("says delete when the replacement is empty", () => {
    expect(replaceButtonTitle(row, "")).toBe("Delete match");
    expect(replaceButtonTitle(file, "")).toBe("Delete every match in src/a.ts");
  });
});

describe("replaceLineActions", () => {
  it("puts one action on each target's line, and each runs ITS OWN target", () => {
    const buf = formatFindResults(RESULTS, { pattern: "foo" });
    const run = vi.fn();
    const actions = replaceLineActions(buf.replaceTargets, "bar", run);

    // Lines: 3 = src/a.ts header, 4-5 its rows, 7 = b.md header, 8 its row.
    expect(actions.map((a) => [a.line, a.testid, a.label])).toEqual([
      [3, "find-replace-file", "Replace in file"],
      [4, "find-replace-match", "Replace"],
      [5, "find-replace-match", "Replace"],
      [7, "find-replace-file", "Replace in file"],
      [8, "find-replace-match", "Replace"],
    ]);

    // Identity: clicking line 5 runs the SECOND match on src/a.ts, not the first.
    actions[2].onClick();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenLastCalledWith(buf.replaceTargets[4]);
    expect(run.mock.calls[0][0]).toMatchObject({
      kind: "match",
      file: "src/a.ts",
      match: { start: 4, end: 7 },
    });
    actions[3].onClick();
    expect(run).toHaveBeenLastCalledWith({ kind: "file", file: "b.md" });
  });

  it("is empty for a no-match buffer", () => {
    const buf = formatFindResults([], { pattern: "foo" });
    expect(replaceLineActions(buf.replaceTargets, "bar", vi.fn())).toEqual([]);
  });
});
