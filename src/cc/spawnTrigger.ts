// incident-terminal-blank-cursor (2026-06-22) — the spawn-effect dependency contract,
// extracted to a pure, testable seam.
//
// WHY THIS EXISTS: XtermPane's spawn effect must re-run (and re-attach its `cc-output`
// listener) ONLY on a genuine re-spawn signal — never on the internal `spawning→live`
// phase flip. When `bridge.phase` was a dependency, `dispatch({ spawned })` re-ran the
// effect, and its cleanup tore down the `cc-output` listener before the fire-and-forget
// `cc_ready` flush of the shell's one-shot prompt arrived → permanently blank terminal
// pane. (CC survived only because it emits continuously; the shell emits its prompt once.)
//
// QoL-WP4 (2026-06-25): `active` was REMOVED from this trigger set. It used to be here as
// the deferred-spawn gate, but as an unconditional spawn-effect dependency it made the
// effect re-run on EVERY active false→true edge (panel/center-stage switch-back) → a fresh
// `term_spawn` → a new shell PTY → lost history + stacked prompts. Worse, since the effect's
// cleanup unlistens, an active-toggle also tore the listeners down (the same blank-pane
// failure mode as the phase bug). The deferred-spawn intent ("spawn on FIRST activation
// only") now lives in `respawnGuard.shouldSpawnOnActive`, consulted by a small `[active]`-
// keyed trigger effect that bumps `spawnNonce` exactly once. Keeping `active` OUT of the
// spawn effect's deps is what makes a re-activation inert. See respawnGuard.ts.
//
// This module is the single source of truth for that contract: XtermPane builds its
// effect dependency array from `spawnTriggerDeps(...)`, and the unit test asserts the
// invariant directly — most importantly that `bridge.phase` (or any phase value) is NOT
// a trigger, and (WP4) that `active` is NOT a trigger. Re-introducing either bug (adding
// the phase, or re-adding `active`, to the deps) fails the test.

/** The inputs that, when changed, legitimately warrant a fresh spawn + listener attach. */
export interface SpawnTriggerInputs {
  /**
   * Bumped by Re-launch/Retry AND by the deferred first-spawn trigger effect (WP4). The
   * sole numeric re-spawn signal: the spawn effect re-runs iff this changes (or the
   * path/command does). Deferred-spawn fires it once on first activation via respawnGuard.
   */
  spawnNonce: number;
  /** A different project dir = a different session. */
  projectPath: string;
  /** `cc_spawn` vs `term_spawn` = a different session kind. */
  spawnCommand: string;
}

/**
 * The ordered dependency list for XtermPane's spawn effect. Deliberately excludes BOTH:
 *  - the bridge phase — the spawn effect must NOT re-run on `spawning→live`
 *    (incident-terminal-blank-cursor), and
 *  - `active` (WP4) — a re-activation must NOT re-run the effect (it would re-spawn a new
 *    shell + tear down the listeners). Deferred first-spawn is handled separately via
 *    `respawnGuard.shouldSpawnOnActive` → a `spawnNonce` bump.
 * Keep this the sole place the trigger set is defined so the effect and its regression
 * test agree.
 */
export function spawnTriggerDeps(
  inputs: SpawnTriggerInputs,
): [number, string, string] {
  return [inputs.spawnNonce, inputs.projectPath, inputs.spawnCommand];
}

/**
 * Predicate form of the same contract, for assertion clarity: is `signal` a value the
 * spawn effect is allowed to depend on? `"bridge.phase"` (any session-lifecycle phase)
 * AND `"active"` (WP4) must return false — those are the two invariants the bugs violated.
 */
export function isSpawnTrigger(signal: string): boolean {
  const TRIGGERS = new Set(["spawnNonce", "projectPath", "spawnCommand"]);
  return TRIGGERS.has(signal);
}
