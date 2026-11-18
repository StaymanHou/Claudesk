import { describe, expect, it } from "vitest";
import {
  relaunchIntent,
  spawnCommandFor,
  takeSpawnArgs,
  type SpawnIntentRef,
} from "../spawnArgs";
import xtermPaneSource from "../../components/workspace/XtermPane.tsx?raw";

// P4.6: the open INTENT must reach `cc_spawn`. Every other check on the `⏵` no-fire door was
// green while the door was broken, because the spawn sent `{ projectPath }` alone and the backend
// resolved the `--continue` argv arm from the unclean flag. The shape that kept the prop read but
// sent the wrong value (`intent: openIntent ? "fire" : "fire"`) passed `tsc` and every test until
// a guard pinned it; these value tests are that guard now, one door at a time.
describe("takeSpawnArgs", () => {
  for (const door of ["fire", "no-fire", "turn-respawn"] as const) {
    it(`cc_spawn sends the pane's door as the WHOLE intent: ${door}`, () => {
      expect(takeSpawnArgs("cc_spawn", "/p", door, undefined).intent).toBe(
        door,
      );
    });
  }

  it("cc_spawn with no override sends the pane's own openIntent", () => {
    expect(takeSpawnArgs("cc_spawn", "/p", "fire", undefined)).toEqual({
      projectPath: "/p",
      intent: "fire",
    });
    const empty: SpawnIntentRef = { current: null };
    expect(takeSpawnArgs("cc_spawn", "/p", "no-fire", empty)).toEqual({
      projectPath: "/p",
      intent: "no-fire",
    });
  });

  it("a pending override wins over openIntent, ONCE: the spawn that takes it clears it", () => {
    const ref: SpawnIntentRef = { current: "turn-respawn" };
    expect(takeSpawnArgs("cc_spawn", "/p", "fire", ref)).toEqual({
      projectPath: "/p",
      intent: "turn-respawn",
    });
    expect(ref.current).toBeNull();
    // The NEXT spawn (a Retry, the relaunch button, a Recycle) is back on the original door.
    expect(takeSpawnArgs("cc_spawn", "/p", "fire", ref).intent).toBe("fire");
  });

  it("term_spawn carries no intent and leaves a pending override for the CC spawn", () => {
    const ref: SpawnIntentRef = { current: "turn-respawn" };
    expect(takeSpawnArgs("term_spawn", "/p", "fire", ref)).toEqual({
      projectPath: "/p",
    });
    expect(ref.current).toBe("turn-respawn");
  });
});

// M18 WP1 — a relaunch never re-sends the Reconnect door (`SURFACE-2026-11-17-REMOTE-RECYCLE-NEVER-RESPAWNS-CC`).
describe("relaunchIntent / takeSpawnArgs on a relaunch", () => {
  it("maps reconnect to fire and leaves every other door alone", () => {
    expect(relaunchIntent("reconnect")).toBe("fire");
    for (const door of ["fire", "no-fire", "turn-respawn"] as const) {
      expect(relaunchIntent(door)).toBe(door);
    }
  });

  for (const door of [
    "fire",
    "no-fire",
    "turn-respawn",
    "reconnect",
  ] as const) {
    it(`door ${door}: the FIRST spawn sends the door itself`, () => {
      expect(
        takeSpawnArgs("cc_spawn", "/p", door, undefined, false).intent,
      ).toBe(door);
      expect(takeSpawnArgs("cc_spawn", "/p", door, undefined).intent).toBe(
        door,
      );
    });
    it(`door ${door}: a relaunch sends relaunchIntent(door)`, () => {
      expect(
        takeSpawnArgs("cc_spawn", "/p", door, undefined, true).intent,
      ).toBe(door === "reconnect" ? "fire" : door);
    });
    it(`door ${door}: a pending override still wins on a relaunch, once`, () => {
      const ref: SpawnIntentRef = { current: "turn-respawn" };
      expect(takeSpawnArgs("cc_spawn", "/p", door, ref, true).intent).toBe(
        "turn-respawn",
      );
      expect(ref.current).toBeNull();
    });
  }

  it("term_spawn ignores the relaunch flag (no intent at all)", () => {
    expect(
      takeSpawnArgs("term_spawn", "/p", "reconnect", undefined, true),
    ).toEqual({
      projectPath: "/p",
    });
  });
});

describe("XtermPane routes its spawn through takeSpawnArgs", () => {
  // The function above is only the machine; this pins its caller. Comment-stripped, and the CALL
  // shape, so the module's own prose cannot satisfy it
  // (`[[raw-guard-identifier-satisfied-by-own-comments]]`).
  const code = xtermPaneSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("the spawn invoke's arguments come from takeSpawnArgs with the pane's override ref", () => {
    expect(code).toMatch(
      /invoke<string>\(\s*spawnCommandFor\(spawnCommand, projectPath\),\s*takeSpawnArgs\(\s*spawnCommand,\s*projectPath,\s*openIntent,\s*spawnIntentRef,\s*doorUsedRef\.current,?\s*\),?\s*\)/,
    );
  });
});

// M17 WP3 — a remote CC pane spawns through `cc_spawn_remote`; nothing else changes command.
describe("spawnCommandFor", () => {
  it("routes a CC pane on a remote key to cc_spawn_remote, and nothing else", () => {
    expect(spawnCommandFor("cc_spawn", "ssh://me@mini/Users/me/p")).toBe(
      "cc_spawn_remote",
    );
    expect(spawnCommandFor("cc_spawn", "/Users/me/p")).toBe("cc_spawn");
    // A local folder whose NAME starts with ssh: is still local (keys are absolute paths).
    expect(spawnCommandFor("cc_spawn", "/Users/me/ssh://x")).toBe("cc_spawn");
    // The right-panel shell is never rerouted (its remote absence is WP6's).
    expect(spawnCommandFor("term_spawn", "ssh://me@mini/p")).toBe("term_spawn");
  });
});
