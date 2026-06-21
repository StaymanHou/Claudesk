/// <reference types="vite/client" />

// WP6 Phase 2 — dev-only workspace seed seam. `window.__seedWorkspace` is
// registered ONLY under `import.meta.env.DEV` (see App.tsx) so verify-self /
// console harnesses can open a workspace without the Tauri folder dialog. It does
// not exist in a production build; the optional type reflects that.
declare global {
  interface Window {
    __seedWorkspace?: (path: string) => void;
    // WP12 Phase 4 — dev-only synthetic-tab seam. Registered ONLY under
    // `import.meta.env.DEV` (see EditorSplit) so verify-self / console harnesses can
    // drive a synthetic read-only tab (the WP7 Find-Results seam) without a real
    // consumer. Absent in production builds.
    __editorSynthetic?: {
      add: (id: string, label: string) => void;
      setContent: (id: string, content: string) => void;
      /** Reads the 1-based line numbers that have been clicked (for verify-self assertions). */
      clickedLines: number[];
    };
  }
}

export {};
