// M4 WP4 P2 — the mirror-ticker gating decision, extracted pure for a vitest pin.
//
// The Filmstrip runs a ~1 fps serializeAsHTML() ticker that mirrors each BACKGROUND
// workspace's terminal buffer into its tile. That loop should only run when there is
// something to mirror INTO and something worth the CPU:
//   - EXPANDED only — collapsed mode shows status pills, not thumbnails, so there are no
//     mirror nodes to write and the serialize cost should drop to zero (the WP4 win).
//   - At least one BACKGROUND tile — with 0 or 1 workspace open there's no background to
//     mirror (the active tile is a static placeholder, never mirrored).
//
// (The third gate — `document.hidden` — is a per-FRAME skip inside the tick, not a
// should-the-interval-exist decision, so it stays inline in the effect.)

/**
 * Should the background-mirror serialize ticker run? Pure decision so the loop-stop /
 * loop-start behavior is vitest-pinnable independent of React/DOM.
 *
 * @param collapsed       filmstrip collapse state (collapsed → no thumbnails → no loop)
 * @param backgroundCount number of background (non-active) tiles to mirror
 */
export function shouldRunMirror(collapsed: boolean, backgroundCount: number): boolean {
  return !collapsed && backgroundCount > 0;
}
