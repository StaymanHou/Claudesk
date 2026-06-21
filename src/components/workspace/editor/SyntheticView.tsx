// WP12 Phase 4 — a read-only synthetic buffer view (the WP7 "Find Results" seam).
//
// A synthetic tab's content is supplied PROGRAMMATICALLY (in-memory), not read from
// disk: no read_file/write_file/stat_file, no dirty/save, no disk-change check. This
// component renders that content in a read-only CodeMirror view and reports a CLICK on
// a line back via `onLineClick(lineNumber)` (1-based) — so a consumer (WP7's Find
// Results) can map a clicked result line to an open-file-at-match action. Built GENERIC:
// WP7 is the first consumer, not a special case baked in here.
//
// Read-only = `EditorView.editable.of(false)` + `EditorState.readOnly.of(true)` (no
// typing, no edit keymap). Dark theme + the same line numbers as the file editor so it
// reads as part of the editor. Per-view (one CM6 instance per synthetic tab view); the
// content comes from the owner (EditorSplit's synthetic-content map).

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorDarkTheme } from "./theme";

interface SyntheticViewProps {
  /** The in-memory content to render (read-only). */
  content: string;
  /** Called with the 1-based line number when a line is clicked. */
  onLineClick?: (line: number) => void;
}

export function SyntheticView({ content, onLineClick }: SyntheticViewProps) {
  // Read-only + a mousedown handler that maps the click position to a 1-based line and
  // fires onLineClick. Memoized so the extension array identity is stable per onLineClick.
  const extensions = useMemo(
    () => [
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      EditorView.domEventHandlers({
        mousedown: (event, view) => {
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos == null) return false;
          const line = view.state.doc.lineAt(pos).number; // 1-based
          onLineClick?.(line);
          return false; // don't preventDefault — selection/focus still behave
        },
      }),
    ],
    [onLineClick],
  );

  return (
    <div className="editor-panel" data-testid="synthetic-view">
      <div className="editor-panes" data-testid="editor-panes">
        <div className="editor-pane" data-testid="editor-pane">
          <CodeMirror
            value={content}
            theme={editorDarkTheme}
            extensions={extensions}
            editable={false}
            basicSetup={{ lineNumbers: true, foldGutter: false }}
          />
        </div>
      </div>
    </div>
  );
}
