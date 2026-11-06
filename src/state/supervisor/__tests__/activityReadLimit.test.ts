// Paydown 2026-11-04 WP8 (D3): the activity-record read limit has ONE frontend home, and it must
// equal the backend's cap. Every reader asks for `ACTIVITY_READ_LINE_LIMIT` lines; Rust clamps
// a read to `MAX_READ_LINES`. If the two drift, a larger TS value is silently truncated and a
// smaller one under-reads, and neither fails anywhere else.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ACTIVITY_READ_LINE_LIMIT } from "../activityRecorder";

const RUST = resolve(
  __dirname,
  "../../../../src-tauri/src/supervisor_activity/commands.rs",
);

describe("the activity read limit", () => {
  it("equals the backend's MAX_READ_LINES", () => {
    const src = readFileSync(RUST, "utf8");
    // Anchored on the whole declaration, which occurs exactly once.
    const decls = [...src.matchAll(/^const MAX_READ_LINES: usize = (\d+);$/gm)];
    expect(decls).toHaveLength(1);
    expect(Number(decls[0][1])).toBe(ACTIVITY_READ_LINE_LIMIT);
  });
});
