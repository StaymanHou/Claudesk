// M15 WP3 Phase 1 — the turn-end predicate's contract.
//
// ⚠️ This file tests the CALLER'S decision, not the backend's classification. The backend
// owns "is this event a `Stop`?" (`status_broadcaster::event_is_turn_end`, pinned by its own
// Rust tests across BOTH states `Stop` maps to). What is tested here is the thing that has
// actually gone wrong in this repo four times: a correct mechanism behind a caller that does
// not honor it.

import { describe, expect, it } from "vitest";
import { shouldHandleTurnEnd, type TurnEndSignal } from "../turnEnd";

const signal = (over: Partial<TurnEndSignal> = {}): TurnEndSignal => ({
  workspace_id: "ws-1",
  is_turn_end: true,
  ...over,
});

const decide = (over: Partial<TurnEndSignal> = {}, enabled = true): boolean =>
  shouldHandleTurnEnd({
    enabled,
    paneWorkspaceId: "ws-1",
    payload: signal(over),
  });

describe("shouldHandleTurnEnd", () => {
  it("fires on a turn-end event for this workspace", () => {
    expect(decide()).toBe(true);
  });

  it("does not fire for a different workspace", () => {
    // The supervisor fans out across ALL workspaces by running one tap per workspace, so a
    // tap that ignored this would act on every other workspace's turns too.
    expect(decide({ workspace_id: "ws-2" })).toBe(false);
  });

  it("does not fire when disabled", () => {
    expect(decide({}, false)).toBe(false);
  });

  it("treats an absent marker as 'not a turn end', never as a default", () => {
    // ⚠️ An older or degraded payload omits the field. It must lose the marker rather than
    // invent one — the same posture the backend takes with `skip_serializing_if`. A
    // truthiness check (`!!payload.is_turn_end`) would agree here; the point is that the
    // comparison is explicit so it keeps agreeing.
    expect(decide({ is_turn_end: undefined })).toBe(false);
    expect(decide({ is_turn_end: false })).toBe(false);
  });

  it("⚠️ does not read the state field — the two-Stop-states trap", () => {
    // THE REGRESSION THIS TEST EXISTS FOR. `event_to_state` maps `Stop` to `"idle"` AND to
    // `"background_work"`. A predicate written against `state` would match one and silently
    // never fire on the other ([[derived-state-is-not-a-proxy-for-its-event]] — the M13.5
    // WP2 shipped CRITICAL, whose failure mode is a hang, not an error).
    //
    // Both of these carry the marker and differ ONLY in the state that rode along, so a
    // future edit that starts consulting `state` fails here rather than in production on
    // whichever half it forgot.
    for (const state of ["idle", "background_work"]) {
      expect(
        shouldHandleTurnEnd({
          enabled: true,
          paneWorkspaceId: "ws-1",
          payload: { ...signal(), state } as TurnEndSignal,
        }),
      ).toBe(true);
    }

    // And the converse: a state that LOOKS like a finished turn but carries no marker must
    // not fire. This is the exact payload a `state`-reading predicate would wrongly accept.
    expect(
      shouldHandleTurnEnd({
        enabled: true,
        paneWorkspaceId: "ws-1",
        payload: {
          workspace_id: "ws-1",
          state: "idle",
        } as TurnEndSignal,
      }),
    ).toBe(false);
  });

  it("does not gate on session_id — a payload without one still ends a turn", () => {
    // `session_id` is the DISAMBIGUATOR for two sessions in one tree, not a precondition.
    // Requiring it would make the supervisor silently stop working against any hook payload
    // that omits it — a degradation with no signal.
    expect(decide({ session_id: undefined })).toBe(true);
    expect(decide({ session_id: "sess-abc" })).toBe(true);
  });
});
