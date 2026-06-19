// WP1 probe entry — routes to the hotkey or n-mount harness.
// THROWAWAY probe code. Mounted via ?cm6probe&mode=<hotkey|nmount>.
import { useEffect } from "react";
import { startFrameCollector } from "../frameStats";
import HotkeyProbe from "./HotkeyProbe";
import NMountProbe from "./NMountProbe";

export default function Cm6ProbeApp() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") ?? "hotkey";

  // Reuse WP4's in-page frame collector so window.__probeStats() works here too
  // (lets the n-mount run cross-check frame health, same as the terminal probe).
  useEffect(() => {
    const collector = startFrameCollector();
    return () => collector.stop();
  }, []);

  return (
    <div style={{ background: "#111", color: "#eee", minHeight: "100vh" }}>
      <h3
        style={{ margin: 0, padding: "8px 12px", font: "600 14px system-ui" }}
      >
        WP1 CM6 probe — mode={mode}
      </h3>
      {mode === "hotkey" ? (
        <HotkeyProbe />
      ) : mode === "nmount" ? (
        <NMountProbe />
      ) : (
        <p style={{ padding: 16 }}>
          unknown mode &quot;{mode}&quot; — use mode=hotkey or mode=nmount
        </p>
      )}
    </div>
  );
}
