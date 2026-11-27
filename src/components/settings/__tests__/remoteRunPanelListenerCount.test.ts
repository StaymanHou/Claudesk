// paydown-2026-11-27 WP5 — `RemoteRunPanel` queries the run state only once every listener is
// attached (`subscribed >= RUN_LISTENERS`). The count is hand-kept beside the listen calls, so this
// pins the two together: a fourth `useTauriListen` without a bump would let the query fire after
// only three subscribed, reopening the race M18 WP8 P1.2 closed.
//
// A source question (how many calls the component makes), so a source read: `node:fs`, comments
// stripped so a call named in a comment does not count.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "../RemoteRunPanel.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

describe("RemoteRunPanel's listener count", () => {
  it("RUN_LISTENERS equals the number of useTauriListen calls, and gates the query", () => {
    const declared = /const RUN_LISTENERS = (\d+);/.exec(src);
    expect(declared, "RUN_LISTENERS must be a literal count").not.toBeNull();
    const calls = src.match(/\buseTauriListen\s*</g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBe(Number(declared![1]));
    expect(src).toMatch(/subscribed >= RUN_LISTENERS/);
  });
});
