// M5 WP3 Phase 3 — the SINGLE App-level serialize ticker (shared by Filmstrip + PiP).
//
// Before WP3 the Filmstrip ran its own ~1 fps ticker calling `serializeTerminal(id)`
// for background tiles. WP3 lifts that ONE loop here so the PiP can reuse the SAME
// serialize output instead of running a second loop over the same buffers (the M4
// active-CPU p95 caveat: a second independent loop is the wrong call). Each tick this
// hook serializes the "needed" workspace set ONCE into the shared `mirrorFrame` map;
// the Filmstrip reads that map for its tiles, and (when the PiP is shown) we emit the
// same snapshot to the PiP as a `pip-mirror` event.
//
// "Needed" set:
//   - filmstrip background ids — every open workspace EXCEPT the center-staged one,
//     and only when the filmstrip is EXPANDED (collapsed shows pills, no thumbnails).
//   - PLUS, when the PiP is shown, the center-staged workspace too — the PiP mirrors
//     ALL N incl. the center-staged one (the divergence). That's the single extra
//     serialize the filmstrip never needed; it's only paid while the PiP is visible.
//
// Cost gates (mirroring the filmstrip-collapse discipline):
//   - document.hidden → skip the tick entirely (the whole app is off-screen).
//   - filmstrip collapsed AND PiP hidden → nothing to serialize → the interval still
//     ticks but the needed set is empty, so no serialize cost. (We keep the interval
//     alive rather than tearing down/rebuilding on every collapse/PiP toggle.)
//   - PiP hidden → no `pip-mirror` emit (the PiP pays nothing while hidden).
//
// pipShown is tracked from the backend `pip-visibility` broadcast (pip_toggle emits it)
// — the single source of truth for panel visibility, not a frontend guess.

import { useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { serializeTerminal } from "./terminalMirror";
import { setMirrorFrame, mirrorFrameSnapshot } from "./mirrorFrame";
import {
  PIP_MIRROR_EVENT,
  PIP_WINDOW_LABEL,
  type PipMirrorFrame,
} from "../../pip/pipFrame";

/** ~1 fps — the WP4-probe-validated background mirror rate (shared with the filmstrip). */
const MIRROR_INTERVAL_MS = 1000;

/** Backend visibility broadcast (mirrors `pip::commands::PIP_VISIBILITY_EVENT`). */
const PIP_VISIBILITY_EVENT = "pip-visibility";

export interface MirrorTickerInput {
  /** All open workspace ids, in roster order. */
  allIds: readonly string[];
  /** The center-staged workspace id (excluded from the filmstrip background set). */
  focusedId: string | null;
  /** Filmstrip collapsed → no thumbnails to mirror INTO for the filmstrip. */
  collapsed: boolean;
}

/**
 * Compute the set of workspace ids that need serializing this tick — pure so the
 * "serialize exactly the union, once" contract is vitest-pinnable without the hook's
 * refs/effects/interval. The union of:
 *   - filmstrip background ids (all except the center-staged one) when EXPANDED, and
 *   - ALL ids when the PiP is shown (the PiP mirrors the center-staged one too).
 * Collapsed + PiP-hidden → empty set (no serialize cost — the gate).
 */
export function computeMirrorSet(
  allIds: readonly string[],
  focusedId: string | null,
  collapsed: boolean,
  pipShown: boolean,
): Set<string> {
  const needed = new Set<string>();
  if (!collapsed) {
    for (const id of allIds) if (id !== focusedId) needed.add(id);
  }
  if (pipShown) {
    for (const id of allIds) needed.add(id);
  }
  return needed;
}

export function useMirrorTicker({
  allIds,
  focusedId,
  collapsed,
}: MirrorTickerInput): void {
  // PiP visibility, from the backend broadcast. Drives both the extra center-stage
  // serialize and the pip-mirror emit.
  const [pipShown, setPipShown] = useState(false);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<boolean>(PIP_VISIBILITY_EVENT, (event) => {
      setPipShown(event.payload);
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Latest inputs in a ref so the single interval reads current values without
  // restarting on every roster/focus/collapse/visibility change (restarting would
  // drop a frame and churn the interval). Updated in an effect (not during render —
  // react-hooks/refs).
  const inputRef = useRef({ allIds, focusedId, collapsed, pipShown });
  useEffect(() => {
    inputRef.current = { allIds, focusedId, collapsed, pipShown };
  }, [allIds, focusedId, collapsed, pipShown]);

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return; // whole app off-screen → no serialize churn
      const { allIds, focusedId, collapsed, pipShown } = inputRef.current;

      // Compute the needed set (a Set so a workspace shared by both surfaces is
      // serialized once). Pure decision — see computeMirrorSet (vitest-pinned).
      const needed = computeMirrorSet(allIds, focusedId, collapsed, pipShown);

      // Serialize each needed workspace ONCE into the shared frame.
      const next = new Map<string, string>();
      for (const id of needed) {
        const html = serializeTerminal(id);
        if (html !== null) next.set(id, html); // null → terminal not registered yet
      }
      setMirrorFrame(next);

      // Push the snapshot to the PiP (only while shown — the cost gate).
      if (pipShown) {
        const snapshot: PipMirrorFrame = mirrorFrameSnapshot();
        void emitTo(PIP_WINDOW_LABEL, PIP_MIRROR_EVENT, snapshot).catch(() => {
          // Best-effort; the next tick retries.
        });
      }
    };

    tick(); // immediate first frame
    const timer = setInterval(tick, MIRROR_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
}
