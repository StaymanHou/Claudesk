// M17 WP4 (AC-7) — the words of a remote pane's reconnecting strip.
//
// ⚠️ Keys typed while a remote pane reconnects are DROPPED, not buffered (WP3 Phase 5): replaying
// them later could submit a stale reply into a CC that has moved on. The strip is how the operator
// learns that, for as long as it lasts, instead of typing a reply into nothing.

/** The strip's text, with the host as a person would say it (`mini`). */
export function reconnectStripText(host: string): string {
  return `Not connected to ${host}. Keys you type are not sent; reconnecting…`;
}
