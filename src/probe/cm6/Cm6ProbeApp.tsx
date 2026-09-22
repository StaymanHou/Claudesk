// CM6 probe entry — routes to the hotkey, n-mount or dictation harness.
// (`hotkey`/`nmount` are M2 WP1; `dictation` is F-a WP1 — two different WP1s.)
// THROWAWAY probe code. Mounted via ?cm6probe&mode=<hotkey|nmount|dictation>.
import { useEffect } from "react";
import { startFrameCollector } from "../frameStats";
import DictationProbe from "./DictationProbe";
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
        CM6 probe — mode={mode}
      </h3>
      {mode === "hotkey" ? (
        <HotkeyProbe />
      ) : mode === "nmount" ? (
        <NMountProbe />
      ) : mode === "dictation" ? (
        <DictationProbe />
      ) : (
        <p style={{ padding: 16 }}>
          unknown mode &quot;{mode}&quot; — use mode=hotkey, mode=nmount or
          mode=dictation
        </p>
      )}
    </div>
  );
}
