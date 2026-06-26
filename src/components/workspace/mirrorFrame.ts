// M5 WP3 Phase 3 — the SHARED serialized-mirror frame.
//
// Both the Filmstrip background tiles AND the PiP NSPanel tiles render a live
// ~1 fps `serializeAsHTML()` mirror of each workspace's terminal. Before WP3 the
// Filmstrip ran its own ticker that called `serializeTerminal(id)` directly. Running
// a SECOND ticker for the PiP would serialize the same buffers twice per tick — and
// the M4 WP4 active-CPU p95 caveat (≈30%-on-bursts) says a second independent loop
// is the wrong call. So WP3 lifts the serialize step to ONE App-level ticker
// (`useMirrorTicker`) that serializes each needed workspace ONCE per tick into this
// module-level map; both surfaces READ from here:
//   - the Filmstrip writes its background tiles' innerHTML from `readMirrorFrame(id)`,
//   - App emits the same HTML to the PiP inside the `pip-frame` payload.
//
// "Needed" = the union of (filmstrip background ids) ∪ (all ids, when the PiP is
// shown — the PiP mirrors the center-staged workspace too, the one extra the
// filmstrip skips). The ticker owner computes that set; this module just stores the
// latest snapshot. A tiny module-level map, no React — unit-testable like
// terminalMirror.ts (which it reads through).

const frame = new Map<string, string>();

/** Replace the current mirror snapshot. Called once per tick by `useMirrorTicker`. */
export function setMirrorFrame(next: Map<string, string>): void {
  frame.clear();
  for (const [id, html] of next) frame.set(id, html);
}

/** Read one workspace's latest serialized HTML, or null if not serialized this tick. */
export function readMirrorFrame(workspaceId: string): string | null {
  return frame.get(workspaceId) ?? null;
}

/** Snapshot the whole current frame as a plain object (for the PiP emit payload). */
export function mirrorFrameSnapshot(): Record<string, string> {
  return Object.fromEntries(frame);
}

/** Test-only: clear the shared frame between tests. */
export function __resetMirrorFrame(): void {
  frame.clear();
}
