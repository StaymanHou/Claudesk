// M5 — PiP NSPanel React entry. Mounts the <Pip /> status surface into the
// separate panel webview (its own JS heap — it cannot read the main app's React
// state or module singletons; all data arrives via Tauri events). Loaded by
// pip.html, which the Rust `pip` panel opens via WebviewUrl::App.

import React from "react";
import ReactDOM from "react-dom/client";
import { Pip } from "./Pip";
import "./pip.css";

ReactDOM.createRoot(document.getElementById("pip-root") as HTMLElement).render(
  <React.StrictMode>
    <Pip />
  </React.StrictMode>,
);
