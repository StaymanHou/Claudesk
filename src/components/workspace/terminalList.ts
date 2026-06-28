// M6 WP11 — pure core for the right-panel terminal LIST (N terminals per workspace).
//
// The right-panel Terminal slot held exactly one login shell (a single TerminalPane,
// session id `${workspaceId}-term`). WP11 makes it a LIST: open / switch / close N
// terminals, each its own backend PTY session. The PTY backend (term_spawn + the
// session-id-keyed input/resize/kill commands + the cc-output-<sid>/cc-exit-<sid>
// streams) is already N-session-ready, so this is a frontend-shape change.
//
// This module holds the pieces that need no React/DOM so they are vitest-testable
// (repo posture: pure logic → vitest, live DOM → MCP-bridge/Playwright — same split as
// panelHost.ts / fontZoom.ts / tabSwitchChord.ts):
//   - the TerminalEntry shape + the TerminalListState (entries + activeId + counter),
//   - the pure reducer ops: open / close / switch,
//   - the session-id scheme (`${workspaceId}-term-<n>`, n monotonic per workspace).
//
// DESIGN DECISIONS (plan-time, 2026-06-28 — see the WIP file):
//   - Session ids renumber to `${workspaceId}-term-<n>` (n from a monotonic counter,
//     starting at 0). Stable per entry, unique, collision-free with the CC session id
//     (`${workspaceId}`, no `-term-` suffix). No persisted state keys off the old id.
//   - Closing the LAST terminal is DISALLOWED (a no-op): the Terminal panel always has
//     ≥1 shell, so there is never an empty-panel state.
//   - Soft cap MAX_TERMINALS (8): openTerminal is a no-op at the cap (the ＋ disables in
//     the UI). Bounds resource use + keeps the tab row readable.
//   - Ephemeral: a fresh workspace seeds with exactly one terminal (`-term-0`); nothing
//     is persisted across app restart (terminals are ephemeral like the CC session).

/** A soft cap on simultaneously-open terminals per workspace (UI disables ＋ at this). */
export const MAX_TERMINALS = 8;

/** One terminal in the list. `id` is the stable React key + tab handle; `sessionId` is
 *  the backend PTY session key (XtermPane's `workspaceId` prop). For v1 `id === sessionId`
 *  — kept as distinct fields so a future rename/label can diverge the display id. */
export interface TerminalEntry {
  id: string;
  sessionId: string;
}

/** The per-workspace terminal-list state: the open entries, which one is front/active,
 *  and a monotonic counter that only ever increases (so a closed-then-reopened slot never
 *  reuses a session id — a stale backend stream can't bind to a new terminal). */
export interface TerminalListState {
  entries: TerminalEntry[];
  activeId: string;
  /** Next suffix to assign. Monotonic; never decremented on close. */
  counter: number;
}

/** The session id for the n-th terminal of a workspace: `${workspaceId}-term-<n>`. */
export function terminalSessionId(workspaceId: string, n: number): string {
  return `${workspaceId}-term-${n}`;
}

/** Seed a workspace's terminal list with exactly one terminal (`-term-0`), active.
 *  Called once per workspace on mount (ephemeral — no restore from persistence). */
export function initialTerminalList(workspaceId: string): TerminalListState {
  const sid = terminalSessionId(workspaceId, 0);
  return { entries: [{ id: sid, sessionId: sid }], activeId: sid, counter: 1 };
}

/**
 * Open a new terminal: append a `${workspaceId}-term-<counter>` entry, make it active,
 * and bump the counter. A NO-OP (returns the same state reference) when already at
 * MAX_TERMINALS — the caller (UI) disables ＋ at the cap, this is the model-side guard.
 */
export function openTerminal(
  state: TerminalListState,
  workspaceId: string,
): TerminalListState {
  if (state.entries.length >= MAX_TERMINALS) return state;
  const sid = terminalSessionId(workspaceId, state.counter);
  return {
    entries: [...state.entries, { id: sid, sessionId: sid }],
    activeId: sid,
    counter: state.counter + 1,
  };
}

/**
 * Close the terminal with `id`: remove its entry. DISALLOWED when it is the last
 * terminal (returns the same state — the Terminal panel always keeps ≥1 shell). When the
 * CLOSED terminal was active, the new active is its left neighbour (or the new first
 * entry if it was the first) — so focus/front lands on an adjacent surviving terminal.
 * Closing a NON-active terminal leaves `activeId` unchanged. Unknown `id` is a no-op.
 */
export function closeTerminal(
  state: TerminalListState,
  id: string,
): TerminalListState {
  if (state.entries.length <= 1) return state; // disallow closing the last
  const idx = state.entries.findIndex((e) => e.id === id);
  if (idx === -1) return state; // unknown id — no-op
  const entries = state.entries.filter((e) => e.id !== id);
  // If the closed one was active, reactivate the left neighbour (clamp to the new first).
  const activeId =
    state.activeId === id
      ? entries[Math.max(0, idx - 1)].id
      : state.activeId;
  return { ...state, entries, activeId };
}

/** Make `id` the active/front terminal. No-op for an unknown id (the active stays). */
export function switchTerminal(
  state: TerminalListState,
  id: string,
): TerminalListState {
  if (!state.entries.some((e) => e.id === id)) return state;
  return { ...state, activeId: id };
}

/** Whether `id` is the only terminal (→ its tab must NOT render a ✕; disallow-last). */
export function isLastTerminal(state: TerminalListState): boolean {
  return state.entries.length <= 1;
}

/** Whether a new terminal can be opened (below the soft cap → the ＋ is enabled). */
export function canOpenTerminal(state: TerminalListState): boolean {
  return state.entries.length < MAX_TERMINALS;
}
