// M4 WP3 P3 — the terminal-mirror registry.
//
// The filmstrip needs to read a current snapshot of any BACKGROUND workspace's
// terminal buffer (to render the live ~1 fps mirror tile), but each xterm Terminal
// lives privately inside its workspace's XtermPane and must stay there (the "XtermPane
// owns the terminal" boundary + the all-stay-mounted rule). Rather than prop-drill a
// ref of every terminal up through CenterStage → Workspace → App → Filmstrip, XtermPane
// REGISTERS a serializer thunk keyed by workspace id here, and the filmstrip ticker
// READS it. One tiny module-level map; no React, no xterm import → unit-testable.
//
// The serializer thunk closes over the pane's `@xterm/addon-serialize` SerializeAddon
// and returns `serializeAsHTML()` (the WP4-probe-validated arm-B mirror path: read the
// buffer of an off-viewport pane whose renderer xterm has paused). Returns null when no
// pane is registered for the id (e.g. before mount, after unmount) — the caller renders
// a placeholder, never throws.

/** A thunk that returns the current `serializeAsHTML()` snapshot of one terminal. */
export type TerminalSerializer = () => string;

const serializers = new Map<string, TerminalSerializer>();

/** Register a workspace's terminal serializer (called by XtermPane on mount). */
export function registerTerminalSerializer(
  workspaceId: string,
  serializer: TerminalSerializer,
): void {
  serializers.set(workspaceId, serializer);
}

/**
 * Unregister a workspace's serializer (called by XtermPane on unmount). Idempotent —
 * unregistering an unknown id is a harmless no-op.
 */
export function unregisterTerminalSerializer(workspaceId: string): void {
  serializers.delete(workspaceId);
}

/**
 * Read a workspace's current terminal snapshot as HTML, or null if no terminal is
 * registered for that id. Never throws — a serializer that itself throws is caught and
 * coerced to null so one bad pane can't break the whole filmstrip ticker.
 */
export function serializeTerminal(workspaceId: string): string | null {
  const fn = serializers.get(workspaceId);
  if (!fn) return null;
  try {
    return fn();
  } catch {
    return null;
  }
}

/** Test-only: clear the registry between tests. */
export function __resetTerminalMirrorRegistry(): void {
  serializers.clear();
}
