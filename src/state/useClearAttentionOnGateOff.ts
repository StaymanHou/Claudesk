// M16.5 WP4 — when the M10.9 workflow gate turns OFF, clear every live verify-human overlay at
// once, so "gate OFF = byte-identical" holds immediately rather than at each workspace's next
// hook event. The backend re-emits each cleared workspace on `workspace-status`.
//
// ⚠️ Only the ON→OFF EDGE fires. Booting with the gate OFF, or turning it ON, sends nothing:
// with the gate OFF no overlay can exist (only the gated turn-end handler promotes).

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useClearAttentionOnGateOff(gateEnabled: boolean): void {
  const wasEnabled = useRef(gateEnabled);
  useEffect(() => {
    if (wasEnabled.current && !gateEnabled) {
      invoke<number>("workspace_status_clear_attention").catch((err) => {
        console.error("workspace_status_clear_attention failed:", err);
      });
    }
    wasEnabled.current = gateEnabled;
  }, [gateEnabled]);
}
