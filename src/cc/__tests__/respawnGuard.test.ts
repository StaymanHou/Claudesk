// QoL-WP4 (2026-06-25) — contract for the spawn-once guard `shouldSpawnOnActive`.
//
// The terminal panel must spawn its shell EXACTLY ONCE (deferred until first active), then
// never again on a later active false→true edge (panel/center-stage switch-back). This pure
// predicate is that decision; the companion source-assertion test
// (components/workspace/__tests__/spawnOnceOnReactivate.test.ts) pins that XtermPane actually
// routes its deferred first-spawn through it and keeps `active` out of the spawn-effect deps.

import { describe, it, expect } from "vitest";
import { shouldSpawnOnActive } from "../respawnGuard";

describe("shouldSpawnOnActive — spawn on first activation only", () => {
  it("spawns on the FIRST activation (active, no session yet) — deferred-spawn fires", () => {
    expect(shouldSpawnOnActive({ active: true, hasSpawned: false })).toBe(true);
  });

  it("does NOT spawn while inactive (the deferral gate, no session yet)", () => {
    expect(shouldSpawnOnActive({ active: false, hasSpawned: false })).toBe(
      false,
    );
  });

  it("does NOT re-spawn on RE-activation — the switch-back edge that lost history", () => {
    expect(shouldSpawnOnActive({ active: true, hasSpawned: true })).toBe(false);
  });

  it("does NOT spawn while inactive once a session exists (deactivation is inert)", () => {
    expect(shouldSpawnOnActive({ active: false, hasSpawned: true })).toBe(false);
  });

  it("is a pure function of (active && !hasSpawned) — no other state", () => {
    // Exhaustive truth table — the predicate is exactly the conjunction.
    const cases: Array<[boolean, boolean, boolean]> = [
      [true, false, true],
      [true, true, false],
      [false, false, false],
      [false, true, false],
    ];
    for (const [active, hasSpawned, expected] of cases) {
      expect(shouldSpawnOnActive({ active, hasSpawned })).toBe(expected);
    }
  });
});
