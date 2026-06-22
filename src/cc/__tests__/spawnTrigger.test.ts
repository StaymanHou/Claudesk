// Regression coverage for incident-terminal-blank-cursor (2026-06-22).
//
// The bug: XtermPane's spawn effect listed `bridge.phase` as a dependency, so the
// `spawning→live` dispatch re-ran the effect, and its cleanup tore down the `cc-output`
// listener before the fire-and-forget `cc_ready` flush of the WP9 shell's one-shot prompt
// arrived — leaving the right-panel Terminal permanently blank (10/10). CC was unaffected
// because it emits continuously; the shell emits its prompt exactly once.
//
// The fix keys the spawn effect on `spawnNonce` (+ active/projectPath/spawnCommand), NOT
// on the bridge phase, so the listener survives the phase transition. This test locks the
// contract in `spawnTrigger.ts`: the session-lifecycle phase must NEVER be a re-spawn
// trigger. Re-introducing `bridge.phase` (or any phase value) as a trigger fails here.
//
// Per the project test posture (pure logic unit-tested; live DOM/PTY Playwright-verified —
// but Playwright is blind to the native PTY, which is why the live recovery is also a
// documented manual-regression step in the incident archive). This pure test guards the
// structural invariant; the manual step guards the live render.

import { describe, it, expect } from "vitest";
import {
  spawnTriggerDeps,
  isSpawnTrigger,
  type SpawnTriggerInputs,
} from "../spawnTrigger";

describe("spawnTrigger — incident-terminal-blank-cursor regression contract", () => {
  it("does NOT treat the bridge phase as a re-spawn trigger", () => {
    // The load-bearing assertion: the spawning→live phase flip must not re-trigger the
    // spawn effect (that teardown is the blank-pane bug). Any phase value is excluded.
    expect(isSpawnTrigger("bridge.phase")).toBe(false);
    expect(isSpawnTrigger("phase")).toBe(false);
    expect(isSpawnTrigger("spawning")).toBe(false);
    expect(isSpawnTrigger("live")).toBe(false);
  });

  it("treats exactly the legitimate re-spawn signals as triggers", () => {
    expect(isSpawnTrigger("spawnNonce")).toBe(true);
    expect(isSpawnTrigger("active")).toBe(true);
    expect(isSpawnTrigger("projectPath")).toBe(true);
    expect(isSpawnTrigger("spawnCommand")).toBe(true);
  });

  it("builds the effect dep list from only the trigger inputs, phase-free, in order", () => {
    const inputs: SpawnTriggerInputs = {
      spawnNonce: 2,
      active: true,
      projectPath: "/Users/x/proj",
      spawnCommand: "term_spawn",
    };
    expect(spawnTriggerDeps(inputs)).toEqual([
      2,
      true,
      "/Users/x/proj",
      "term_spawn",
    ]);
    // No phase smuggled in: the dep tuple is exactly the four trigger inputs.
    expect(spawnTriggerDeps(inputs)).toHaveLength(4);
  });

  it("the dep list changes only when a real trigger changes (a phase flip would not)", () => {
    const base: SpawnTriggerInputs = {
      spawnNonce: 0,
      active: true,
      projectPath: "/p",
      spawnCommand: "term_spawn",
    };
    // Relaunch (nonce bump) IS a new dep tuple → effect re-runs → fresh spawn + listener.
    expect(spawnTriggerDeps({ ...base, spawnNonce: 1 })).not.toEqual(
      spawnTriggerDeps(base),
    );
    // Two identical-trigger states yield an identical tuple — i.e. a spawning→live
    // transition (which changes only the phase, not any of these) cannot re-run the effect.
    expect(spawnTriggerDeps(base)).toEqual(spawnTriggerDeps({ ...base }));
  });
});
