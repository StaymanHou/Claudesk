// M9 WP6a Phase 4 — the "No file open" placeholder, extracted from EditorPanel so it
// carries NO CodeMirror import. PaneTabs renders THIS for an empty pane instead of
// `<EditorPanel openPath={null}>`, so a fresh workspace (one empty pane, no file yet)
// does NOT pull the CM6 chunk at workspace-open. The real CM6-bearing EditorPanel is
// lazy-loaded (React.lazy) and only mounts when an actual file tab renders — folding in
// SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD. Pure DOM, zero deps.
//
// Kept byte-identical to EditorPanel's former `openPath == null` branch (same classes +
// testid) so no CSS or verify-self selector changes.
export function EditorEmpty() {
  return (
    <div className="editor-empty" data-testid="editor-empty">
      <p className="placeholder-coming">No file open</p>
      <p className="placeholder-detail">Open a file to start editing.</p>
    </div>
  );
}
