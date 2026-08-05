import { describe, expect, it } from "vitest";
import xtermPaneSource from "../XtermPane.tsx?raw";
import { shouldInject, shouldScheduleFire } from "../autoResumeFire";
import type { AutoResumeAction } from "../../../state/predictAction";

// M12 WP3 follow-up — the auto-resume injection must fire ONCE per pane, even across a Re-launch.
//
// THE DEFECT THIS PINS (shipped in WP3, caught at code review):
//   `handleRelaunch` clears `hasSpawnedRef` → the deferred-spawn trigger effect bumps
//   `spawnNonce` → the spawn effect re-runs → `pendingAction` is STILL SET (it is a prop; the
//   reducer never clears it) → a second `/session-restore` was typed 1500 ms later, against a
//   `.session.md` the first fire had already deleted.
//
// ⚠️ WHY THE GUARD IS CALLER-SIDE. This is the SIXTH instance of M12's
// "proven-module-unhonoring-caller" class (see
// SURFACE-2026-08-05-NO-FIRE-INTENT-DOES-NOT-CROSS-THE-IPC-BOUNDARY, which enumerates five).
// `shouldInject`/`injectionCommand` were already mutation-proven and CORRECT; the caller invoked
// them twice. So re-driving those with more inputs would prove nothing. The behavioral half below
// drives the real consume-once decision; the structural half pins that the call site actually
// passes the latch and sets it — the obligation a pure function cannot enforce on its own.

const injectAction: AutoResumeAction = {
  kind: "inject",
  command: "/session-restore",
};
const argvAction: AutoResumeAction = { kind: "argv", flag: "--continue" };

describe("shouldScheduleFire — the consume-once decision (behavioral)", () => {
  it("schedules the first fire when there is an inject action", () => {
    expect(shouldScheduleFire({ action: injectAction, hasFired: false })).toBe(
      true,
    );
  });

  it("REFUSES a second fire once the pane has fired — the relaunch case, THE defect", () => {
    // Same action (the prop is unchanged across a relaunch), latch now set.
    expect(shouldScheduleFire({ action: injectAction, hasFired: true })).toBe(
      false,
    );
  });

  it("schedules nothing when there is no action, latch either way", () => {
    expect(shouldScheduleFire({ action: null, hasFired: false })).toBe(false);
    expect(shouldScheduleFire({ action: null, hasFired: true })).toBe(false);
  });

  it("schedules nothing for the argv arm — that arm is Rust-side spawn argv, never injected", () => {
    expect(shouldScheduleFire({ action: argvAction, hasFired: false })).toBe(
      false,
    );
  });
});

describe("shouldScheduleFire vs shouldInject — two DIFFERENT questions", () => {
  // ⚠️ The distinction is the fix. Collapsing these re-opens the defect, so it is asserted
  // rather than only documented: on a relaunch run `cancelled` is false (a fresh per-run closure
  // var), so `shouldInject` says "yes, inject" — correctly, for its own question. Only the latch
  // can express "this pane already fired".
  it("shouldInject STILL approves on a relaunch run — proving it cannot carry consume-once", () => {
    expect(shouldInject({ action: injectAction, cancelled: false })).toBe(true);
  });

  it("…while shouldScheduleFire is the one that stops it", () => {
    expect(shouldScheduleFire({ action: injectAction, hasFired: true })).toBe(
      false,
    );
  });
});

describe("XtermPane honors the consume-once contract (caller-side wiring)", () => {
  // Comments are stripped first: this file's own prose names every identifier asserted below, and
  // a guard satisfied by the module's own comments passes exactly when the code is deleted
  // (`[[raw-guard-identifier-satisfied-by-own-comments]]`).
  const code = xtermPaneSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("keeps an inject-once latch ref, separate from the spawn-once latch", () => {
    expect(code).toMatch(/hasFiredRef\s*=\s*useRef\(false\)/);
    // Both latches must exist — this fix must not have replaced the spawn-once one.
    expect(code).toMatch(/hasSpawnedRef\s*=\s*useRef\(false\)/);
  });

  it("gates the fire on shouldScheduleFire, passing the latch as the hasFired term", () => {
    // Anchored AND terminated per the guard-anchoring lesson in
    // SURFACE-...-NO-FIRE-INTENT: asserting the bare identifier `hasFiredRef` would match a
    // mutant like `hasFired: hasFiredRef ? false : false`. Pin the property ACCESS as the value.
    expect(code).toMatch(
      /shouldScheduleFire\(\{\s*action:\s*pendingAction,\s*hasFired:\s*hasFiredRef\.current,?\s*\}\)/,
    );
  });

  it("sets the latch when it schedules, INSIDE the gated branch", () => {
    // The set must follow the gate and precede the timer, so two runs racing to schedule cannot
    // both win. Anchor the ordering rather than asserting a bare assignment anywhere in the file.
    expect(code).toMatch(
      /shouldScheduleFire\([^)]*\)\s*\)\s*\{\s*hasFiredRef\.current\s*=\s*true;\s*fireTimer\s*=\s*setTimeout\(/,
    );
  });

  it("does NOT clear the inject latch on relaunch (a relaunch re-spawns but must not re-type)", () => {
    // The asymmetry with `hasSpawnedRef` IS the fix: relaunch clears that one and not this one.
    expect(code).toMatch(/hasSpawnedRef\.current\s*=\s*false/);
    expect(code).not.toMatch(/hasFiredRef\.current\s*=\s*false/);
  });

  it("still routes the write through injectCommand (arch.md: all injection via slash_command_bytes)", () => {
    expect(code).toMatch(/void injectCommand\(sessionId,\s*command\)/);
  });

  // Meta-guard: a broken ?raw loader yields "" and every `not.toMatch` above passes vacuously.
  it("meta: the raw source actually loaded", () => {
    expect(xtermPaneSource.length).toBeGreaterThan(1000);
    expect(code).toContain("XtermPane");
  });
});
