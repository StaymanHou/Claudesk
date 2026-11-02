// WP12 — a read-only synthetic buffer view (the WP7 "Find Results" seam).
//
// A synthetic tab's content is supplied PROGRAMMATICALLY (in-memory), not read from
// disk: no read_file/write_file/stat_file, no dirty/save, no disk-change check. This
// component renders that content in a read-only CodeMirror view and reports a CLICK on
// a line back via `onLineClick(lineNumber)` (1-based) — so a consumer (WP7's Find
// Results) can map a clicked result line to an open-file-at-match action. Built GENERIC:
// WP7 is the first consumer, not a special case baked in here.
//
// Read-only = `EditorView.editable.of(false)` + `EditorState.readOnly.of(true)` (no
// typing, no edit keymap). Dark theme + the same line numbers AND the same persisted
// font size as the file editor (so the result page matches the editor's current zoom —
// WP7 verify-human 2026-06-21). Optional `highlights` mark spans in the buffer (the WP7
// matched-text hit, like Sublime's Find Results). Per-view (one CM6 instance per tab);
// content + highlights come from the owner (EditorSplit's synthetic-content map).

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { editorDarkTheme, fontSizeTheme } from "./theme";
import { loadFontSize } from "./fontZoom";
import { searchPanelNoTextAssist } from "./searchPanelTextAssist";

/** A 0-based char-offset span in the buffer to mark as a hit (e.g. a search match). */
export interface SyntheticHighlight {
  from: number;
  to: number;
}

/**
 * A button attached to one buffer line (M16.5 WP6 — Find Results' hover Replace). Rendered
 * as a CM6 widget, so it is NOT part of the buffer text: copying from the tab and the
 * consumer's line map are unaffected. Hidden until its line is hovered (App.css).
 */
export interface SyntheticLineAction {
  /** 1-based buffer line the button sits on (right end of the row). */
  line: number;
  label: string;
  /** Tooltip — say what the click will do. */
  title: string;
  testid: string;
  onClick: () => void;
}

interface SyntheticViewProps {
  /** The in-memory content to render (read-only). */
  content: string;
  /** Called with the 1-based line number when a line is clicked. */
  onLineClick?: (line: number) => void;
  /** Optional spans (0-based char offsets into `content`) to highlight as hits. */
  highlights?: SyntheticHighlight[];
  /** Optional per-line buttons. A click on one does NOT also fire `onLineClick`. */
  lineActions?: SyntheticLineAction[];
}

/** Mark class for a highlighted hit — styled in App.css (.cm-synthetic-hit). */
const hitMark = Decoration.mark({ class: "cm-synthetic-hit" });

/** Build a CM6 DecorationSet from the highlight spans, clamped to the doc length. */
function buildHighlightExtension(highlights: SyntheticHighlight[]) {
  return EditorView.decorations.compute(["doc"], (state) => {
    const len = state.doc.length;
    const builder = new RangeSetBuilder<Decoration>();
    // Spans arrive in document order (the formatter emits them top-to-bottom); skip any
    // empty or out-of-range span defensively so a stale offset can't throw.
    for (const h of highlights) {
      const from = Math.max(0, Math.min(h.from, len));
      const to = Math.max(from, Math.min(h.to, len));
      if (to > from) builder.add(from, to, hitMark);
    }
    return builder.finish() as DecorationSet;
  });
}

/** The widget for one {@link SyntheticLineAction}: a real `<button>`. */
class LineActionWidget extends WidgetType {
  constructor(readonly action: SyntheticLineAction) {
    super();
  }
  eq(other: LineActionWidget): boolean {
    return other.action === this.action;
  }
  toDOM(): HTMLElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cm-synthetic-line-action";
    b.textContent = this.action.label;
    b.title = this.action.title;
    b.setAttribute("aria-label", this.action.title);
    b.dataset.testid = this.action.testid;
    // mousedown is the event the view's line-click handler listens to. `ignoreEvent`
    // (below) already keeps CM6 from running that handler for events inside the widget;
    // preventDefault also stops the press from moving the selection or focus.
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.action.onClick();
    });
    return b;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

/** Line-decoration class so the hover rule can anchor the absolutely-placed button. */
const actionLine = Decoration.line({ class: "cm-synthetic-action-line" });

/** One widget per action, at its line's end. Out-of-range lines are skipped. */
function buildActionsExtension(actions: SyntheticLineAction[]) {
  return EditorView.decorations.compute(["doc"], (state) => {
    const builder = new RangeSetBuilder<Decoration>();
    const sorted = [...actions].sort((a, b) => a.line - b.line);
    for (const a of sorted) {
      if (a.line < 1 || a.line > state.doc.lines) continue;
      const line = state.doc.line(a.line);
      builder.add(line.from, line.from, actionLine);
      builder.add(
        line.to,
        line.to,
        Decoration.widget({ widget: new LineActionWidget(a), side: 1 }),
      );
    }
    return builder.finish() as DecorationSet;
  });
}

export function SyntheticView({
  content,
  onLineClick,
  highlights,
  lineActions,
}: SyntheticViewProps) {
  // Read-only + a mousedown handler that maps the click position to a 1-based line and
  // fires onLineClick + the persisted font size + the optional hit decorations. Memoized
  // so the extension array identity is stable per (onLineClick, highlights, lineActions).
  const extensions = useMemo(
    () => [
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      // Match the editor's CURRENT (persisted, global) zoom — a freshly opened file
      // editor seeds from the same loadFontSize(), so the result tab reads as part of
      // the editor at whatever zoom the operator set (WP7 verify-human).
      // BY DESIGN this is read ONCE here (at render of this memo), NOT live: unlike
      // EditorPanel — which live-reconfigures `fontSizeCompartment` on ⌘=/⌘-/⌘0 — a
      // synthetic tab picks up a zoom change only on its next (re)render (e.g. a
      // re-search rebuilds it). Zooming the file editor while this tab is the active
      // view won't update it until then. Acceptable for a read-only result buffer; a
      // live compartment here would be the "copy a Compartment by analogy" trap.
      fontSizeTheme(loadFontSize()),
      buildHighlightExtension(highlights ?? []),
      buildActionsExtension(lineActions ?? []),
      // basicSetup ships the find panel here too (⌘F in Find Results).
      searchPanelNoTextAssist,
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
    [onLineClick, highlights, lineActions],
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
