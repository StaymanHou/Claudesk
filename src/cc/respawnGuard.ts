// QoL-WP4 (2026-06-25) — the spawn-once guard for the deferred-spawn terminal panel.
//
// THE BUG IT FIXES: XtermPane's spawn effect listed `active` as an unconditional re-spawn
// trigger. For the WP9 second-terminal panel `active = visible && panel === "terminal"`, which
// flips true→false→true on every right-panel switch (Terminal↔Editor/Diff) AND every
// center-stage switch-back. Each false→true edge re-ran the spawn effect and fired a fresh
// `term_spawn` → a BRAND-NEW shell PTY, orphaning the prior shell. Symptom: typed history is
// gone after a switch (it's a different process) and empty prompts stack up (each new shell
// prints its prompt). See workflow/archive/qol-wp4-* and SURFACE-2026-06-24-TERMINAL-SPURIOUS-
// NEWLINE-ON-PANEL-SWITCH.
//
// THE FIX: spawn the shell EXACTLY ONCE — deferred until the pane is FIRST active, then never
// again on a subsequent active false→true edge. `active` is conflated no longer: "spawn on
// FIRST activation" is this predicate; "spawn on EVERY activation" was the bug. The spawn
// effect's actual triggers (spawnNonce / projectPath / spawnCommand) live in spawnTrigger.ts;
// `active` was removed from that set and its deferred-spawn intent moved HERE, consulted by a
// tiny `[active]`-keyed trigger effect in XtermPane that bumps `spawnNonce` once on first
// activation. Keeping `active` OUT of the spawn effect's deps is also what stops the effect's
// cleanup from tearing down the `cc-output`/`cc-exit` listeners on an active-toggle (which
// would otherwise leave a live-but-deaf/blank pane — the incident-terminal-blank-cursor class).

/** Inputs to the spawn-once decision: the current activation state + whether a session already exists. */
export interface ShouldSpawnInputs {
  /** The deferred-spawn gate: the pane is visible AND its panel is front. */
  active: boolean;
  /** True once a session has been spawned for this pane (a `hasSpawnedRef` in XtermPane). */
  hasSpawned: boolean;
}

/**
 * May the spawn effect spawn a session right now? True ONLY on the FIRST activation —
 * `active` is true and no session exists yet. A re-activation (active true again AFTER a
 * session exists) returns false: that is the switch-away-then-back edge that previously
 * lost the shell's history. Inactive (`active:false`) is always false (the deferral).
 */
export function shouldSpawnOnActive({
  active,
  hasSpawned,
}: ShouldSpawnInputs): boolean {
  return active && !hasSpawned;
}
