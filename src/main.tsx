import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// WP4 probe harness: when the URL carries ?probe, mount the isolated probe app
// instead of the real shell. Lazy import so xterm.js is never pulled into the
// normal app bundle. THROWAWAY probe path.
const isProbe = new URLSearchParams(window.location.search).has("probe");

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

if (isProbe) {
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
