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
    // M10.9 WP3 Phase 4 — dev-only invite reset seam. Registered ONLY under
    // `import.meta.env.DEV` (see App.tsx) so verify-self can re-drive the first-run
    // invite path without hand-editing settings.json. Resolves once the write lands
    // and local state is re-seeded, so an awaiting caller can assert immediately.
    // Absent in production builds; the optional type reflects that.
    __workflowInviteReset?: () => Promise<void>;
    __editorSynthetic?: {
      add: (id: string, label: string) => void;
      setContent: (id: string, content: string) => void;
      /** Reads the 1-based line numbers that have been clicked (for verify-self assertions). */
      clickedLines: number[];
    };
  }
}

export {};
