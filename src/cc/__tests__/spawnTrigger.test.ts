// Regression coverage for TWO bugs that share the same seam:
//
// (1) incident-terminal-blank-cursor (2026-06-22). XtermPane's spawn effect listed
//     `bridge.phase` as a dependency, so the `spawning→live` dispatch re-ran the effect,
//     and its cleanup tore down the `cc-output` listener before the fire-and-forget
//     `cc_ready` flush of the WP9 shell's one-shot prompt arrived — leaving the right-panel
//     Terminal permanently blank. CC was unaffected (it emits continuously; the shell emits
//     its prompt exactly once). FIX: the spawn effect must NOT depend on the bridge phase.
//
// (2) QoL-WP4 terminal-respawn-on-switch (2026-06-25). `active` used to be a spawn-effect
//     dependency (the deferred-spawn gate). But `active = visible && panel === "terminal"`
//     flips true→false→true on every panel/center-stage switch, so the effect re-ran on
//     each switch-back → a fresh `term_spawn` → a new shell PTY → lost history + stacked
//     empty prompts (and the cleanup also tore the listeners down — the same blank-pane
//     failure mode). FIX: `active` is no longer a spawn trigger; deferred FIRST-spawn moved
//     to `respawnGuard.shouldSpawnOnActive` + a `[active]`-keyed trigger effect that bumps
//     `spawnNonce` exactly once. See respawnGuard.test.ts for that predicate's contract.
//
// This test locks the trigger contract in `spawnTrigger.ts`: NEITHER the session-lifecycle
// phase NOR `active` may be a re-spawn trigger. Re-introducing either fails here.
//
// Per the project test posture (pure logic unit-tested; live DOM/PTY operator-verified —
// Playwright is blind to the native PTY, so the live recovery is also a documented manual
// step). This pure test guards the structural invariant; the manual step guards the live render.

import { describe, it, expect } from "vitest";
import {
  spawnTriggerDeps,
  isSpawnTrigger,
  type SpawnTriggerInputs,
} from "../spawnTrigger";

describe("spawnTrigger — blank-cursor + WP4-respawn regression contract", () => {
  it("does NOT treat the bridge phase as a re-spawn trigger (blank-cursor invariant)", () => {
    // The load-bearing assertion: the spawning→live phase flip must not re-trigger the
    // spawn effect (that teardown is the blank-pane bug). Any phase value is excluded.
    expect(isSpawnTrigger("bridge.phase")).toBe(false);
    expect(isSpawnTrigger("phase")).toBe(false);
    expect(isSpawnTrigger("spawning")).toBe(false);
    expect(isSpawnTrigger("live")).toBe(false);
  });

  it("does NOT treat `active` as a re-spawn trigger (WP4 respawn-on-switch invariant)", () => {
    // A re-activation (panel/center-stage switch-back) must not re-run the spawn effect —
    // that re-spawned a fresh shell and lost the operator's history. Deferred first-spawn
    // lives in respawnGuard, not as a bare dep.
    expect(isSpawnTrigger("active")).toBe(false);
  });

  it("treats exactly the legitimate re-spawn signals as triggers", () => {
    expect(isSpawnTrigger("spawnNonce")).toBe(true);
    expect(isSpawnTrigger("projectPath")).toBe(true);
    expect(isSpawnTrigger("spawnCommand")).toBe(true);
  });

  it("builds the effect dep list from only the trigger inputs, phase- and active-free, in order", () => {
    const inputs: SpawnTriggerInputs = {
      spawnNonce: 2,
      projectPath: "/Users/x/proj",
      spawnCommand: "term_spawn",
    };
    expect(spawnTriggerDeps(inputs)).toEqual([
      2,
      "/Users/x/proj",
      "term_spawn",
    ]);
    // No phase and no `active` smuggled in: the dep tuple is exactly the three triggers.
    expect(spawnTriggerDeps(inputs)).toHaveLength(3);
  });

  it("the dep list changes only when a real trigger changes (a phase OR active flip would not)", () => {
    const base: SpawnTriggerInputs = {
      spawnNonce: 0,
      projectPath: "/p",
      spawnCommand: "term_spawn",
    };
    // Relaunch / first-spawn (nonce bump) IS a new dep tuple → effect re-runs → fresh spawn.
    expect(spawnTriggerDeps({ ...base, spawnNonce: 1 })).not.toEqual(
      spawnTriggerDeps(base),
    );
    // Two identical-trigger states yield an identical tuple — i.e. a spawning→live phase
    // transition OR an active true→false→true toggle (neither is in the tuple) cannot
    // re-run the effect. This is the structural guarantee both fixes rest on.
    expect(spawnTriggerDeps(base)).toEqual(spawnTriggerDeps({ ...base }));
  });
});
