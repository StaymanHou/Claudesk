import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  FIRE_DELAY_MS,
  injectionCommand,
  shouldInject,
  slashCommandPayload,
} from "../autoResumeFire";
import type { AutoResumeAction } from "../../../state/predictAction";

// M12 WP3 Phase 4 — the auto-resume fire. The app's FIRST feature-initiated PTY write.

const INJECT: AutoResumeAction = {
  kind: "inject",
  command: "/session-restore",
};
const ARGV: AutoResumeAction = { kind: "argv", flag: "--continue" };

describe("shouldInject — the decision is re-checked AT FIRE TIME", () => {
  it("injects for the inject arm when the run is live", () => {
    expect(shouldInject({ action: INJECT, cancelled: false })).toBe(true);
  });

  it("does NOT inject for the argv arm — that arm is spawn flags, never typed", () => {
    // The load-bearing asymmetry from Phase 1's Verdict 2: `--continue` is present at
    // execvp time and needs no injection. Typing `/resume` instead would open an
    // interactive session picker, which is worse than firing nothing.
    expect(shouldInject({ action: ARGV, cancelled: false })).toBe(false);
  });

  it("does NOT inject when there is no action", () => {
    expect(shouldInject({ action: null, cancelled: false })).toBe(false);
  });

  it("does NOT inject when the run was cancelled — for EITHER arm", () => {
    // ⚠️ THE REASON THIS IS A FUNCTION AND NOT AN `if` AROUND setTimeout. 1500 ms is long
    // enough to close the workspace, switch away, or relaunch. A write into a torn-down or
    // replaced session would type a slash command into someone else's live conversation.
    expect(shouldInject({ action: INJECT, cancelled: true })).toBe(false);
    expect(shouldInject({ action: ARGV, cancelled: true })).toBe(false);
  });

  it("cancellation dominates — no input combination injects while cancelled", () => {
    // Asserted across every action rather than case-by-case: the defect being guarded is
    // "someone adds an arm and forgets the cancel check".
    for (const action of [INJECT, ARGV, null] as AutoResumeAction[]) {
      expect(
        shouldInject({ action, cancelled: true }),
        `cancelled run injected for ${JSON.stringify(action)}`,
      ).toBe(false);
    }
  });
});

describe("injectionCommand — reads the KIND, never a label", () => {
  it("returns the command for the inject arm", () => {
    expect(injectionCommand(INJECT)).toBe("/session-restore");
  });

  it("returns null for the argv arm and for no action", () => {
    expect(injectionCommand(ARGV)).toBeNull();
    expect(injectionCommand(null)).toBeNull();
  });

  it("never returns `/session-resume` — that command does not exist", () => {
    // Renamed at WP5/M9 specifically to avoid colliding with the built-in `/resume` this
    // feature also had to reason about. A stale test asserting it was fixed in WP2.
    expect(injectionCommand(INJECT)).not.toBe("/session-resume");
  });
});

describe("the byte payload mirrors Rust's slash_command_bytes", () => {
  /** Decode base64 back to bytes so the assertion is about BYTES, not about a string. */
  const bytes = (b64: string): number[] => [
    ...new Uint8Array(
      atob(b64)
        .split("")
        .map((c) => c.charCodeAt(0)),
    ),
  ];

  it("appends exactly one CR (0x0d), never LF", () => {
    // ⚠️ `\r` not `\n`: CC's TUI is raw-mode, where `\n` only triggers autocomplete
    // typeahead and does NOT submit (`[[raw-mode-cr-is-enter]]`). This is the single byte
    // the whole fire depends on.
    const out = bytes(slashCommandPayload("/session-restore"));
    expect(out.at(-1)).toBe(0x0d);
    expect(out.filter((b) => b === 0x0d)).toHaveLength(1);
    expect(out).not.toContain(0x0a);
  });

  it("does not double-terminate a command that already ends in CR/LF", () => {
    // Same normalization the Rust helper does, asserted for all four spellings it tests.
    const expected = bytes(slashCommandPayload("/session-restore"));
    for (const variant of [
      "/session-restore\n",
      "/session-restore\r",
      "/session-restore\r\n",
    ]) {
      expect(bytes(slashCommandPayload(variant)), variant).toEqual(expected);
    }
  });

  it("encodes UTF-8, not truncated char codes", () => {
    // ⚠️ M10.5 WP4 shipped input mojibake because the old path truncated each char to
    // `& 0xff`. A multi-byte char must survive as its UTF-8 bytes.
    const out = bytes(slashCommandPayload("/x é"));
    // é = U+00E9 → 0xC3 0xA9 in UTF-8. A `& 0xff` truncation would emit a single 0xE9.
    expect(out).toContain(0xc3);
    expect(out).toContain(0xa9);
    expect(out).not.toContain(0xe9);
  });

  it("the payload for /session-restore is exactly the Rust helper's bytes", () => {
    // Pinned as a literal so the two sides cannot drift silently. Rust:
    // `slash_command_bytes("/session-restore") == b"/session-restore\r"`.
    const expected = [...new TextEncoder().encode("/session-restore\r")];
    expect(bytes(slashCommandPayload("/session-restore"))).toEqual(expected);
  });
});

describe("the fire delay is the MEASURED value, not a round number", () => {
  it("is 1500 ms", () => {
    expect(FIRE_DELAY_MS).toBe(1500);
  });

  it("keeps a large margin over the measured 350 ms flake point", () => {
    // Phase 1 measured 350 ms at 1/5 then 0/5 across two independent samples — the
    // "works warm, fails cold" mode, sitting 50 ms below a delay that reads as perfectly
    // reliable. ⚠️ If this assertion is failing because someone lowered the delay to
    // "optimize startup", the honest fix is to RE-RUN
    // `tooling/autofire-timing/probe.sh` on the target machine, not to relax the bound.
    expect(FIRE_DELAY_MS).toBeGreaterThanOrEqual(350 * 3);
  });
});

describe("the wiring in XtermPane (source guard — STRUCTURE, not runtime)", () => {
  // ⚠️ `?raw`-class guard. This repo has been bitten repeatedly, including twice in THIS
  // work package (a Prettier reflow broke one; a CSS comment satisfied another). Mitigations
  // applied here: comments stripped before matching, assertions on call shapes rather than
  // formatted expressions, whitespace squeezed so a reflow cannot break the match, and a
  // non-vacuity floor. The runtime proof is the live MCP-bridge run + the operator's check.
  const raw = readFileSync(
    fileURLToPath(new URL("../XtermPane.tsx", import.meta.url)),
    "utf8",
  );
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const squeezed = code.replace(/\s+/g, "");

  it("the source loaded and comments were stripped (non-vacuity)", () => {
    expect(raw.length).toBeGreaterThan(2000);
    expect(squeezed.length).toBeGreaterThan(2000);
    expect(code).not.toContain("/*");
  });

  it("the fire goes through shouldInject — the decision is not re-implemented inline", () => {
    expect(squeezed).toContain("shouldInject({");
    expect(squeezed).toContain("injectCommand(");
  });

  it("the timer is CLEARED in the effect cleanup", () => {
    // ⚠️ Without this, StrictMode's mount→unmount→remount leaves the discarded first run's
    // timer live to wake 1500 ms later. `cancelled` alone stops the write, but a pending
    // timer is the loose end that becomes a leak the moment the callback gains state.
    expect(squeezed).toContain("clearTimeout(fireTimer)");
  });

  it("the delay comes from the shared constant, not a literal", () => {
    // A second `1500` in the codebase is a second source of truth for a measured value.
    expect(squeezed).toContain("},FIRE_DELAY_MS)");
    expect(squeezed).not.toContain("},1500)");
  });

  it("an injection failure does NOT dispatch spawn-failed", () => {
    // ⚠️ A miss must not replace a WORKING terminal with an error overlay over a command
    // the user can simply type. `injectCommand` warns; the pane passes no toast handler.
    //
    // ⚠️ THE WINDOW IS BOUNDED STRUCTURALLY, and the first version of this test was wrong
    // in a way worth recording: it read a fixed 400 characters after `shouldInject({`,
    // which over-reached past the fire block into the surrounding `catch (err)` — a block
    // that LEGITIMATELY dispatches `spawn-failed` for a real spawn failure. The test failed
    // while the code was correct. A fixed-length window is a guess about formatting; the
    // honest boundary is the end of the timer callback, which is the `FIRE_DELAY_MS`
    // argument that closes it.
    const start = squeezed.indexOf("shouldInject({");
    const end = squeezed.indexOf("FIRE_DELAY_MS)", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fireBlock = squeezed.slice(start, end);
    expect(fireBlock).not.toContain('type:"spawn-failed"');
    // Non-vacuity: the window must actually contain the fire, or "no dispatch" is trivial.
    expect(fireBlock).toContain("injectCommand(");
  });
});
