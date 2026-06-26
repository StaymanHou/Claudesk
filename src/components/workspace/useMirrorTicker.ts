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
//   - document.hidden AND the PiP doesn't need a mirror → skip the tick (the filmstrip is
//     inside the main window, so if that's off-screen nobody sees it). When the PiP DOES
//     need a mirror we keep ticking even while the main window is hidden — the PiP is a
//     separate always-on-top panel and showing live thumbnails while Claudesk is
//     backgrounded is its whole purpose (WP4 Phase 5 fix).
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
import {
  coercePipLayout,
  DEFAULT_PIP_LAYOUT,
  layoutNeedsMirror,
  PIP_LAYOUT_EVENT,
} from "../../pip/pipLayout";

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
 *   - ALL ids when the PiP is shown AND its active layout renders a mirror (WP4:
 *     compact + minimal render NO mirror, so they add NO serialize cost even while the
 *     PiP is visible — same gate discipline as filmstrip-collapse).
 * Collapsed + (PiP hidden OR a non-mirror PiP layout) → empty set (no serialize cost).
 *
 * `pipNeedsMirror` already folds the layout decision (visible AND a mirror layout) so
 * this function stays a pure set-union with no layout vocabulary leaking in.
 */
export function computeMirrorSet(
  allIds: readonly string[],
  focusedId: string | null,
  collapsed: boolean,
  pipNeedsMirror: boolean,
): Set<string> {
  const needed = new Set<string>();
  if (!collapsed) {
    for (const id of allIds) if (id !== focusedId) needed.add(id);
  }
  if (pipNeedsMirror) {
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

  // WP4 — the PiP's active layout, from the backend `pip-layout` broadcast (same
  // single-source-of-truth posture as visibility). Compact + minimal render no mirror,
  // so a visible-but-non-mirror PiP must pay NO serialize cost; this is what gates that.
  const [pipLayout, setPipLayout] = useState(DEFAULT_PIP_LAYOUT);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<string>(PIP_LAYOUT_EVENT, (event) => {
      setPipLayout(coercePipLayout(event.payload));
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

  // The PiP needs the live mirror only when it's shown AND its layout renders one.
  const pipNeedsMirror = pipShown && layoutNeedsMirror(pipLayout);

  // Latest inputs in a ref so the single interval reads current values without
  // restarting on every roster/focus/collapse/visibility/layout change (restarting
  // would drop a frame and churn the interval). Updated in an effect (not during
  // render — react-hooks/refs).
  const inputRef = useRef({ allIds, focusedId, collapsed, pipNeedsMirror });
  useEffect(() => {
    inputRef.current = { allIds, focusedId, collapsed, pipNeedsMirror };
  }, [allIds, focusedId, collapsed, pipNeedsMirror]);

  useEffect(() => {
    const tick = () => {
      const { allIds, focusedId, collapsed, pipNeedsMirror } = inputRef.current;
      // Cost gate: when the MAIN window is off-screen/backgrounded, the filmstrip (which
      // lives INSIDE the main window) is unseen, so skip the serialize churn — UNLESS the
      // PiP needs a mirror. The PiP is a SEPARATE always-on-top panel that stays visible
      // when Claudesk is backgrounded — and that's its whole purpose (the out-of-focus
      // status surface). Gating its mirror on the main window's visibility froze the PiP
      // thumbnails exactly when the operator looks at them (WP4 Phase 5 fix; previously
      // mis-filed as a transient NON-ISSUE). So: skip ONLY when hidden AND the PiP doesn't
      // need a mirror. (When pipNeedsMirror, the PiP requires ALL ids anyway — see
      // computeMirrorSet — so ticking while hidden adds no cost beyond what the PiP needs.)
      if (document.hidden && !pipNeedsMirror) return;

      // Compute the needed set (a Set so a workspace shared by both surfaces is
      // serialized once). Pure decision — see computeMirrorSet (vitest-pinned). The
      // PiP contributes ids only when its layout actually renders a mirror.
      const needed = computeMirrorSet(allIds, focusedId, collapsed, pipNeedsMirror);

      // Serialize each needed workspace ONCE into the shared frame.
      const next = new Map<string, string>();
      for (const id of needed) {
        const html = serializeTerminal(id);
        if (html !== null) next.set(id, html); // null → terminal not registered yet
      }
      setMirrorFrame(next);

      // Push the snapshot to the PiP only while it's shown AND rendering a mirror
      // (a compact/minimal PiP has no mirror nodes to write into — the cost gate).
      if (pipNeedsMirror) {
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
