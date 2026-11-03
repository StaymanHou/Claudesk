// The header's `clear` button — CC's built-in `/clear` as one click (operator request, 2026-11-03).
//
// ⚠️ NOT a `SKILL_BUTTONS` member, and NOT gated — deliberately. The skill row is gated
// WHOLESALE, which the OFF-invariant guard licenses only while every member is a
// companion-workflow skill (arm 5, "licensing the wholesale gate"). `/clear` is a stock Claude
// Code command every user has, so gating it would take it from users entitled to it. It is
// split out the way arm 4 splits an ungated arm from a gated one.
//
// Placement: with the row present it renders INSIDE it, immediately before `restore`, because
// `/clear` then `/session-restore` inside an open session is the flow `skillButtons.ts`'s
// `/session-restore` note measured (`/clear` = 333 typed). With the row absent (gate OFF, or a
// non-default profile) it renders alone where the row would be.
//
// No confirm: typed `/clear` is instant, and the cleared conversation stays reachable through
// CC's `/resume`.

export const CLEAR_COMMAND = "/clear";
export const CLEAR_LABEL = "clear";
export const CLEAR_TITLE =
  "Run /clear — start a fresh conversation in this session (usually followed by restore)";
export const CLEAR_TESTID = "workspace-clear-btn";

/**
 * Whether the `clear` button should exist for this workspace.
 *
 * ⚠️ Takes NO gate input, and that is the point: this is the ungated arm. The only condition is
 * the dead-click guard every injecting button shares — a null session id means the spawn has
 * not resolved, and firing into it would be the WP6 picker MAJOR.
 */
export function showClearButton(inputs: {
  ccSessionId: string | null;
}): boolean {
  return inputs.ccSessionId !== null;
}
