import { describe, expect, it } from "vitest";
import { takeSpawnArgs, type SpawnIntentRef } from "../spawnArgs";
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

describe("XtermPane routes its spawn through takeSpawnArgs", () => {
  // The function above is only the machine; this pins its caller. Comment-stripped, and the CALL
  // shape, so the module's own prose cannot satisfy it
  // (`[[raw-guard-identifier-satisfied-by-own-comments]]`).
  const code = xtermPaneSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("the spawn invoke's arguments come from takeSpawnArgs with the pane's override ref", () => {
    expect(code).toMatch(
      /invoke<string>\(\s*spawnCommand,\s*takeSpawnArgs\(\s*spawnCommand,\s*projectPath,\s*openIntent,\s*spawnIntentRef,?\s*\),?\s*\)/,
    );
  });
});
