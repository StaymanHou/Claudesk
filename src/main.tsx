import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Probe harnesses: a probe flag in the URL mounts an isolated probe app instead
// of the real shell. Lazy import so probe deps (xterm.js, CodeMirror) are never
// pulled into the normal app bundle. THROWAWAY probe path. Distinct flags avoid
// the same-key collision URLSearchParams would have on ?probe&probe=cm6.
//   ?probe      → WP4 thumbnail probe
//   ?cm6probe   → WP1 CodeMirror 6 integration probe (&mode=hotkey|nmount)
//   ?nwsprobe   → M4 WP1 N-workspace mount-cost probe (&n=8&visible=1&term=cc|shell)
const probeParams = new URLSearchParams(window.location.search);
const isProbe = probeParams.has("probe");
const isCm6Probe = probeParams.has("cm6probe");
const isNwsProbe = probeParams.has("nwsprobe");

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

if (isNwsProbe) {
  import("./probe/nworkspaces/NWorkspacesProbe").then(
    ({ default: NWorkspacesProbe }) => {
      root.render(
        // NOTE: NOT wrapped in StrictMode — at N≈8 the StrictMode
        // mount→cleanup→remount would spawn (then kill) 2× the PTY sessions,
        // confounding the cost measurement. The real app uses StrictMode, but
        // for a steady-state RAM/CPU probe we want exactly N live sessions.
        <NWorkspacesProbe />,
      );
    },
  );
} else if (isCm6Probe) {
  import("./probe/cm6/Cm6ProbeApp").then(({ default: Cm6ProbeApp }) => {
    root.render(
      <React.StrictMode>
        <Cm6ProbeApp />
      </React.StrictMode>,
    );
  });
} else if (isProbe) {
  import("./probe/ProbeApp").then(({ default: ProbeApp }) => {
    root.render(
      <React.StrictMode>
        <ProbeApp />
      </React.StrictMode>,
    );
  });
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
