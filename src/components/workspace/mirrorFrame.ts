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

// M5 WP5 P2.5 — frame subscribers (fixes SURFACE-2026-06-26-QUALITY-WP3-UNSYNCED-FILMSTRIP-INTERVAL).
// Before WP5 the Filmstrip ran its OWN setInterval(1000) to READ this frame into tile DOM,
// unsynchronized with useMirrorTicker's serialize loop (also 1000ms) — the two drifted in
// phase, so the filmstrip could paint an up-to-1s-stale frame. Now there is ONE loop: the
// ticker calls setMirrorFrame, which synchronously notifies subscribers, so the filmstrip's
// DOM write happens on the SAME tick the frame was produced — never stale, never a 2nd timer.
type FrameSubscriber = () => void;
const subscribers = new Set<FrameSubscriber>();

/**
 * Subscribe to be notified immediately after each `setMirrorFrame`. Returns an unsubscribe
 * fn. The Filmstrip uses this to write its tile DOM in lockstep with the ticker (replacing
 * its old independent interval). Notification is synchronous within `setMirrorFrame`.
 */
export function subscribeMirrorFrame(fn: FrameSubscriber): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/** Replace the current mirror snapshot. Called once per tick by `useMirrorTicker`. */
export function setMirrorFrame(next: Map<string, string>): void {
  frame.clear();
  for (const [id, html] of next) frame.set(id, html);
  // Notify in lockstep — the single source of "a new frame exists". A throwing subscriber
  // must not block the others or the ticker.
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      // best-effort; a bad subscriber never breaks the serialize loop
    }
  }
}

/** Read one workspace's latest serialized HTML, or null if not serialized this tick. */
export function readMirrorFrame(workspaceId: string): string | null {
  return frame.get(workspaceId) ?? null;
}

/** Snapshot the whole current frame as a plain object (for the PiP emit payload). */
export function mirrorFrameSnapshot(): Record<string, string> {
  return Object.fromEntries(frame);
}

/** Test-only: clear the shared frame + subscribers between tests. */
export function __resetMirrorFrame(): void {
  frame.clear();
  subscribers.clear();
}
