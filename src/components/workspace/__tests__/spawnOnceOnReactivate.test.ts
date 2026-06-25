import { describe, expect, it } from "vitest";
// Vite ?raw import: bundles the component source text at test time (repo posture — pure
// logic → vitest, live DOM/PTY → operator verify-human; same ?raw trick as
// autofocusCcOnPromote.test.ts / terminalSlotGuard.test.ts). The live "shell history
// survives a panel/center-stage switch" check is the QoL-WP4 verify-human observable
// outcome; these structural assertions pin the wiring so a future edit can't silently
// re-introduce the respawn-on-switch bug.
import xtermPaneSource from "../XtermPane.tsx?raw";

// QoL-WP4 — the WP9 terminal shell must spawn ONCE, never re-spawn on re-activation.
//
// The failure modes these tests exist to prevent:
//  1. `active` creeps back into the spawn effect's dependency array → the effect re-runs on
//     every panel/center-stage switch-back → a fresh term_spawn → a new shell PTY → the
//     operator's typed history is gone + empty prompts stack up. THE bug.
//  2. The deferred-first-spawn stops routing through `shouldSpawnOnActive` (e.g. someone
//     re-adds an `if (!active) return` spawn-at-mount), risking either a double spawn or a
//     non-deferred shell into a hidden zero-size xterm.
//  3. The spawn-once latch (`hasSpawnedRef`) is dropped, so re-activation spawns again.
// These are wiring invariants not observable in jsdom (xterm needs a real DOM + a native
// PTY), so they're pinned structurally rather than relying on a human noticing the regression.

describe("XtermPane spawns the shell once — no re-spawn on re-activation (QoL-WP4)", () => {
  it("does NOT list `active` in the spawn-effect dep tuple (spawnTriggerDeps args are nonce/path/command)", () => {
    // The spawn effect's deps come from spawnTriggerDeps({ ... }); `active` must NOT be one
    // of the inputs. Matching the call with `active` present is the regression signal.
    expect(xtermPaneSource).toMatch(
      /spawnTriggerDeps\(\{\s*spawnNonce,\s*projectPath,\s*spawnCommand\s*\}\)/,
    );
    expect(xtermPaneSource).not.toMatch(
      /spawnTriggerDeps\(\{[^}]*\bactive\b[^}]*\}\)/,
    );
  });

  it("routes the deferred first-spawn through shouldSpawnOnActive (the spawn-once predicate)", () => {
    expect(xtermPaneSource).toMatch(/import \{ shouldSpawnOnActive \}/);
    expect(xtermPaneSource).toMatch(
      /shouldSpawnOnActive\(\{\s*active,\s*hasSpawned:\s*hasSpawnedRef\.current\s*\}\)/,
    );
  });

  it("keeps a spawn-once latch ref and sets it on a committed spawn", () => {
    expect(xtermPaneSource).toMatch(/hasSpawnedRef\s*=\s*useRef\(false\)/);
    expect(xtermPaneSource).toMatch(/hasSpawnedRef\.current\s*=\s*true/);
  });

  it("clears the latch on relaunch so a deliberate fresh spawn is allowed", () => {
    expect(xtermPaneSource).toMatch(/hasSpawnedRef\.current\s*=\s*false/);
  });

  it("uses spawnNonce===0 as the pre-trigger sentinel (nothing spawns until the trigger bumps it)", () => {
    expect(xtermPaneSource).toMatch(/if\s*\(spawnNonce === 0\)\s*return;/);
  });
});
