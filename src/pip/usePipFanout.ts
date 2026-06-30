// M5 WP3 Phase 2 — the main-webview → PiP roster fan-out (the runtime glue).
//
// The PiP NSPanel webview can't read the main app's React state, so the main webview
// pushes the ordered roster to it. This hook owns that push:
//   1. On every roster change, `emitTo("pip", "pip-frame", frame)`. The PiP `listen`s
//      and re-renders. (If the PiP isn't open, emitTo is a harmless no-op — no target.)
//   2. The PiP, when it mounts after a toggle-on, has missed all prior emits; it fires
//      `pip-ready`. We listen for that ONCE (app lifetime) and reply with the current
//      frame so a freshly-shown panel populates immediately (the P2.4 handshake).
//
// Pure derivation is `derivePipFrame` (pipFrame.ts, vitest-pinned); this hook is the
// listen/emit wiring (NOT unit-tested — runtime-bound, same posture as
// useWorkspaceStatus's subscribe). STATUS is NOT fanned out here — the backend already
// broadcasts `workspace-status` to all webviews incl. the PiP.

import { useEffect, useRef } from "react";
import { emitTo } from "@tauri-apps/api/event";
import { useTauriListen } from "../useTauriListen";
import {
  derivePipFrame,
  PIP_FRAME_EVENT,
  PIP_READY_EVENT,
  PIP_WINDOW_LABEL,
  type PipFrame,
} from "./pipFrame";

/** The minimal roster shape this hook needs from each tile (App's `tiles` satisfy it). */
export interface PipRosterEntry {
  id: string;
  display_name: string;
}

export function usePipFanout(roster: readonly PipRosterEntry[]): void {
  // Keep the latest frame in a ref so the `pip-ready` reply (registered once) always
  // answers with the CURRENT roster, not the roster captured at listener-registration.
  const frameRef = useRef<PipFrame>(derivePipFrame(roster));

  // 1. Push the frame to the PiP whenever the roster changes. emitTo to a label with
  //    no live window is a no-op, so this is safe whether or not the PiP is open.
  useEffect(() => {
    const frame = derivePipFrame(roster);
    frameRef.current = frame;
    void emitTo(PIP_WINDOW_LABEL, PIP_FRAME_EVENT, frame).catch((err) => {
      // Surfaced, never swallowed — a missing fan-out silently blanks the PiP.
      console.error("[claudesk] pip-frame emit failed:", err);
    });
  }, [roster]);

  // 2. Reply to the PiP's mount-time ping with the current frame (initial-state
  //    handshake). Registered once for the app lifetime; the async-listen + teardown-
  //    before-resolve guard lives in useTauriListen now.
  useTauriListen(PIP_READY_EVENT, () => {
    void emitTo(PIP_WINDOW_LABEL, PIP_FRAME_EVENT, frameRef.current).catch(
      (err) => {
        console.error("[claudesk] pip-frame handshake reply failed:", err);
      },
    );
  });
}
