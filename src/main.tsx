import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Probe harnesses: a probe flag in the URL mounts an isolated probe app instead
// of the real shell. Lazy import so probe deps (xterm.js, CodeMirror) are never
// pulled into the normal app bundle. THROWAWAY probe path. Distinct flags avoid
// the same-key collision URLSearchParams would have on ?probe&probe=cm6.
//   ?probe      → WP4 thumbnail probe
//   ?cm6probe   → WP1 CodeMirror 6 integration probe (&mode=hotkey|nmount)
const probeParams = new URLSearchParams(window.location.search);
const isProbe = probeParams.has("probe");
const isCm6Probe = probeParams.has("cm6probe");

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

if (isCm6Probe) {
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
