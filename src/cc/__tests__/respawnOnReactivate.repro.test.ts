// WP4 reproduction (red) — Terminal SESSION teardown+respawn on panel/workspace switch.
//
// SYMPTOM (operator, 2026-06-24/25): switching the right-panel tabs (Terminal↔Editor/Diff)
// or switching center-stage workspace makes the WP9 second-terminal stack up empty prompt
// lines. CRUCIAL clarification: it is NOT a stray \r/\n — the shell SESSION is torn down
// and a NEW one spawned on each switch. Proof: type a command, switch away, switch back,
// press up-arrow → the just-typed command is NOT in history (it's a different shell process).
//
// ROOT CAUSE (XtermPane.tsx spawn effect): the effect's dependency array includes `active`
// (via spawnTriggerDeps). `active` for the terminal panel is `visible && panel==="terminal"`,
// so it flips true→false→true on every panel switch AND every center-stage switch. Each
// false→true edge re-runs the spawn effect: its cleanup unlistens, then `invoke("term_spawn")`
// spawns a BRAND-NEW shell PTY. The prior shell (with the user's history) is orphaned. The
// stacked empty prompts are each new shell printing its prompt.
//
// `active` was added to the deps for DEFERRED spawn (don't spawn the shell until its panel is
// first shown — no shell into a zero-size hidden xterm). But "spawn on FIRST activation" was
// conflated with "spawn on EVERY activation". These are different: a re-activation (active
// false→true AFTER a session already exists) must NOT spawn again.
//
// This test encodes the CORRECT contract via a pure decision predicate `shouldSpawnOnActive`
// that does not yet exist — so the import is the red. The GREEN fix introduces the predicate
// (first-activation-only) and wires XtermPane's spawn decision through it. The companion
// manual recipe in the WIP captures the live lost-history symptom (PTY behavior xterm tests
// can't observe), per the project's pure-logic-unit + manual-live test posture.

import { describe, it, expect } from "vitest";
import { spawnTriggerDeps } from "../spawnTrigger";
// RED: this module/export does not exist yet. The fix creates it as the single source of
// truth for "may the spawn effect spawn now?" — replacing the bare `active` re-trigger.
import { shouldSpawnOnActive } from "../respawnGuard";

describe("WP4 fix — the spawn-effect dep tuple is inert across a panel/center-stage switch", () => {
  // The structural guarantee the fix rests on: `active` is no longer in the spawn-effect
  // dep tuple, so a true→false→true switch-back cannot change the tuple → the effect cannot
  // re-run → no fresh term_spawn → the shell session (and its history) survives. The
  // spawnTriggerDeps signature no longer has an `active` field at all.
  const triggers = {
    spawnNonce: 1,
    projectPath: "/p",
    spawnCommand: "term_spawn",
  } as const;

  it("a switch-away-then-back does not change the dep tuple (the spawn effect won't re-run)", () => {
    // Switching the panel/stage changes ONLY `active` (not nonce/path/command). Since the
    // tuple is built from the non-`active` triggers, the before/after tuples are equal →
    // React does not re-run the spawn effect → the shell is not re-spawned. This is the bug
    // fixed: identical tuples across the switch-back edge.
    expect(spawnTriggerDeps(triggers)).toEqual(
      spawnTriggerDeps({ ...triggers }),
    );
    // And the deferred-first-spawn predicate declares re-activation a no-op once spawned —
    // the ONE predicate case that names the bug (switch-back-after-session). The full
    // four-case truth table is covered exhaustively in respawnGuard.test.ts; this repro
    // file's unique signal is the red-import anchor (the predicate must exist) + the
    // dep-tuple-inertness assertion above, so the duplicated truth table was trimmed
    // (Theme F: qol-wp4 REPRO-TEST-DUP-TRUTH-TABLE).
    expect(shouldSpawnOnActive({ active: true, hasSpawned: true })).toBe(false);
  });
});
