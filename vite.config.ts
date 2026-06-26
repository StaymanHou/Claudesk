import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // M5 WP3 — multi-entry: the main shell (`index.html`) AND the PiP NSPanel
  // surface (`pip.html`). The PiP is a SEPARATE webview with its own JS heap, so
  // it gets its own HTML entry + React root (`src/pip/main.tsx`) rather than a
  // route inside the main app. Both emit into `dist/`; the Rust panel loads
  // `pip.html` via `WebviewUrl::App`.
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        pip: "pip.html",
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
