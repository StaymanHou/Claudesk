/// <reference types="vite/client" />

// WP6 Phase 2 — dev-only workspace seed seam. `window.__seedWorkspace` is
// registered ONLY under `import.meta.env.DEV` (see App.tsx) so verify-self /
// console harnesses can open a workspace without the Tauri folder dialog. It does
// not exist in a production build; the optional type reflects that.
declare global {
  interface Window {
    __seedWorkspace?: (path: string) => void;
  }
}

export {};
