// WP2/WP3a/WP3b — EditorPanel: a VIEW onto one shared document, mounted in a pane.
//
// Phase 2S (2026-06-21) — the buffer/load/save/override no longer live HERE. They live
// in the per-workspace shared document store (editorDocs.ts) owned by EditorSplit, so
// the SAME file open in two panes is ONE document (edit in pane 1 mirrors live in pane
// 2; dirty + save are document-level — operator P2.vh.9). This component is now a VIEW:
// it reads its document from the `entry` prop and writes edits via `onDocChange` / saves
// via `onSave` / syntax via `onSetOverride`. What stays PER-VIEW (one per EditorPanel
// instance): the CM6 EditorView itself, cursor + scroll, the WP7 open-at-match highlight,
// and the command palette. Two views of one path bind to the same `entry.doc` → live
// mirror (the known WP3c shared-doc cursor-reset applies to that case; the proper fix is
// a shared CM6 EditorState — a follow-up).
//
// Renders the WP3a/3b feature set (multi-cursor, find/replace, font-zoom, palette) +
// dark theme + language mode by extension. A read/write failure (from the store's load/
// save state) is rendered inline, never swallowed (the WP6/WP7 IPC-error lesson).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import type { HighlightTarget } from "../search/searchModel";
import type { DocEntry } from "./editorDocs";
import { buildEditorExtensions } from "./editorExtensions";
import {
  editorDarkTheme,
  lineWrapCompartment,
  lineWrapExtension,
} from "./theme";
import { loadFontSize, saveFontSize } from "./fontZoom";
import { loadWrap, saveWrap } from "./editorWrapToggle";
import { CommandPalette } from "./CommandPalette";
import { isPaletteChord, type PaletteCommand } from "./paletteCommands";
import { SYNTAX_MODES } from "./language";

interface EditorPanelProps {
  /** File to open, relative to projectPath (or absolute inside it). Null = no file. */
  openPath: string | null;
  /**
   * True when this workspace is the focused/visible tab AND this is the focused pane's
   * active tab — gates the Cmd+Shift+P palette chord so only the one live editor opens
   * the palette. REQUIRED (not optional-with-default).
   */
  active: boolean;
  /**
   * WP7 — when a file is opened from a project-search result, the match to scroll to +
   * highlight (1-based line + within-line char range). Null for a plain open. A new
   * non-null value re-runs the scroll+select once the document is loaded.
   */
  highlightTarget?: HighlightTarget | null;
  /**
   * Phase 2S — this view's shared document entry from the store (undefined briefly
   * before the open-doc dispatch lands). The buffer, dirty, load/save state, and the
   * language override all come from here. Omitted/undefined for the empty (no-file) view.
   */
  entry?: DocEntry;
  /** An edit → update the shared buffer for `openPath` (all views re-render). */
  onDocChange?: (path: string, doc: string) => void;
  /** Save `openPath` (⌘S). */
  onSave?: (path: string) => void;
  /** Set the palette syntax override for `openPath`. */
  onSetOverride?: (path: string, id: string | null) => void;
  /**
   * Phase 3 — called when this view becomes the FRONT view (active) AND its document is
   * loaded, so the owner can run the disk-change check (stat + reload/conflict). Fires on
   * the active→true transition and when a load completes while already active.
   */
  onActivated?: (path: string) => void;
}

export function EditorPanel({
  openPath,
  active,
  highlightTarget = null,
  entry,
  onDocChange,
  onSave,
  onSetOverride,
  onActivated,
}: EditorPanelProps) {
  // Font size seeded from the persisted global value (lazy init so localStorage is read
  // once on mount). Cmd+=/-/0 update it; onFontSizeChange mirrors the keybinding's live
  // compartment reconfigure into state + persistence. Stays per-view (a view preference).
  const [fontSize, setFontSize] = useState(() => loadFontSize());
  // M6 WP5 — line-wrap flag, seeded from the persisted global value (same lazy-init
  // shape as fontSize). ⌘\ and the status-bar toggle update it; onWrapChange mirrors
  // the live compartment reconfigure into state + persistence.
  const [lineWrap, setLineWrap] = useState(() => loadWrap());
  // WP3b — whether the Cmd+Shift+P command palette is open (per-view).
  const [paletteOpen, setPaletteOpen] = useState(false);
  // WP7 — the live EditorView, captured via @uiw's onCreateEditor, so a project-search
  // result can scroll-to + select its match. One view per EditorPanel.
  const viewRef = useRef<EditorView | null>(null);

  const onFontSizeChange = useCallback((px: number) => {
    setFontSize(px);
    saveFontSize(px);
  }, []);

  // M6 WP5 — mirror a wrap change (from the ⌘\ keybinding) into state + persistence.
  const onWrapChange = useCallback((on: boolean) => {
    setLineWrap(on);
    saveWrap(on);
  }, []);

  // M6 WP5 — the status-bar toggle: do the SAME live compartment reconfigure the ⌘\
  // chord does (no remount), via the captured view, then sync state + persist. Falls
  // back to state-only if the view isn't ready yet (the memo rebuild applies it on
  // the next render).
  const onToggleWrap = useCallback(() => {
    const next = !lineWrap;
    viewRef.current?.dispatch({
      effects: lineWrapCompartment.reconfigure(lineWrapExtension(next)),
    });
    onWrapChange(next);
  }, [lineWrap, onWrapChange]);

  // The shared document fields (from the store entry). Fall back to empty/idle while the
  // entry is briefly absent (between the tab render and the open-doc dispatch).
  const doc = entry?.doc ?? "";
  const load = entry?.load ?? { kind: "idle" as const };
  const save = entry?.save ?? { kind: "idle" as const };
  const dirty = entry != null && entry.doc !== entry.savedDoc;
  const languageOverrideId = entry?.languageOverrideId ?? null;

  const onChange = useCallback(
    (value: string) => {
      if (openPath != null) onDocChange?.(openPath, value);
    },
    [openPath, onDocChange],
  );

  // The save action — persists the shared document. No-op without a file.
  const doSave = useCallback(() => {
    if (openPath != null) onSave?.(openPath);
  }, [openPath, onSave]);

  // WP3b — the syntax-selection command set. Each "Set Syntax: …" sets the document's
  // override in the store (so it's consistent across views of the file).
  const setLanguageOverrideId = useCallback(
    (id: string) => {
      if (openPath != null) onSetOverride?.(openPath, id);
    },
    [openPath, onSetOverride],
  );
  const commands = useMemo<PaletteCommand[]>(
    () =>
      SYNTAX_MODES.map((mode) => ({
        id: `syntax.${mode.id}`,
        title: `Set Syntax: ${mode.label}`,
        run: () => setLanguageOverrideId(mode.id),
      })),
    [setLanguageOverrideId],
  );

  // WP3b — open the palette on Cmd+Shift+P. CAPTURE-phase document listener (WP1
  // pattern): fires before CM6's handler, so the chord works with focus inside the
  // editor. Gated on `active` so only the one live editor responds.
  const hasFile = openPath != null;
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isPaletteChord(e)) {
        e.preventDefault();
        if (!hasFile) return; // inert with no file
        setPaletteOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKeyDown, true); // capture phase
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [active, hasFile]);

  // The full extension set (core keymap incl. Mod-s save → doSave, multi-cursor,
  // find/replace, font-zoom). Rebuilt when doSave / fontSize / override / openPath /
  // lineWrap change; @uiw applies the new-identity array as a full CM6 reconfigure (see
  // the `languageOverrideId` doc in editorExtensions.ts for why this — not a compartment
  // — drives the language swap), so the keymap always calls the current closure.
  const extensions = useMemo(
    () =>
      buildEditorExtensions({
        openPath: openPath ?? "",
        onSave: doSave,
        fontSize,
        onFontSizeChange,
        languageOverrideId,
        lineWrap,
        onWrapChange,
      }),
    [
      openPath,
      doSave,
      fontSize,
      onFontSizeChange,
      languageOverrideId,
      lineWrap,
      onWrapChange,
    ],
  );

  // WP7 — scroll to + select a project-search match once the document is loaded.
  const loadedPath = load.kind === "loaded" ? load.path : null;

  // Phase 3 — fire onActivated when this view becomes the FRONT view (active) AND its
  // doc is loaded, so the owner runs the disk-change check. The `wasFrontLoaded` ref
  // (written only inside the effect) guards the (active && loaded) EDGE so we fire only
  // on a genuine transition into front+loaded — not on every render (onActivated is a
  // fresh closure each EditorSplit render). The owner's checkDisk is itself idempotent.
  const frontAndLoaded =
    active && loadedPath != null && loadedPath === openPath;
  const wasFrontLoaded = useRef(false);
  useEffect(() => {
    if (frontAndLoaded && !wasFrontLoaded.current && openPath != null) {
      onActivated?.(openPath);
    }
    wasFrontLoaded.current = frontAndLoaded;
  }, [frontAndLoaded, openPath, onActivated]);
  useEffect(() => {
    if (highlightTarget == null) return;
    if (loadedPath == null || loadedPath !== openPath) return;
    const view = viewRef.current;
    if (!view) return;
    const { doc: cmDoc } = view.state;
    if (highlightTarget.line < 1 || highlightTarget.line > cmDoc.lines) return;
    const lineInfo = cmDoc.line(highlightTarget.line);
    const from =
      lineInfo.from + Math.min(highlightTarget.startCol, lineInfo.length);
    const to =
      lineInfo.from + Math.min(highlightTarget.endCol, lineInfo.length);
    view.dispatch({
      selection: EditorSelection.range(from, to),
      effects: EditorView.scrollIntoView(EditorSelection.range(from, to), {
        y: "center",
      }),
    });
    view.focus();
  }, [highlightTarget, loadedPath, openPath]);

  // No file open is derived from the prop.
  if (openPath == null) {
    return (
      <div className="editor-empty" data-testid="editor-empty">
        <p className="placeholder-coming">No file open</p>
        <p className="placeholder-detail">Open a file to start editing.</p>
      </div>
    );
  }

  if (load.kind === "error") {
    return (
      <div className="editor-error" data-testid="editor-error">
        <p className="editor-error-title">Could not open {load.path}</p>
        <p className="editor-error-detail">{load.message}</p>
      </div>
    );
  }

  return (
    <div className="editor-panel" data-testid="editor-panel">
      <div className="editor-statusbar" data-testid="editor-statusbar">
        <span className="editor-status-path">{openPath}</span>
        <span className="editor-statusbar-right">
          <span className="editor-status-state">
            {save.kind === "saving"
              ? "saving…"
              : save.kind === "error"
                ? "save failed"
                : dirty
                  ? "● unsaved"
                  : save.kind === "saved"
                    ? "saved"
                    : ""}
          </span>
          {/* M6 WP5 — soft-wrap toggle (⌘\). Reflects the current state; clicking
              flips it via the live compartment reconfigure (same as the chord). */}
          <button
            type="button"
            className="editor-wrap-toggle"
            data-testid="editor-wrap-toggle"
            aria-pressed={lineWrap}
            title="Toggle soft-wrap (⌘\\)"
            onClick={onToggleWrap}
          >
            {lineWrap ? "wrap" : "no wrap"}
          </button>
        </span>
      </div>
      {save.kind === "error" && (
        <div className="editor-save-error" data-testid="editor-save-error">
          Could not save {save.path}: {save.message}
        </div>
      )}
      <div className="editor-panes" data-testid="editor-panes">
        <div className="editor-pane" data-testid="editor-pane">
          <CodeMirror
            value={doc}
            onChange={onChange}
            theme={editorDarkTheme}
            extensions={extensions}
            basicSetup={{ lineNumbers: true, foldGutter: false }}
            // WP7 — capture the view so a search result can scroll to + select its match.
            onCreateEditor={(view) => {
              viewRef.current = view;
            }}
          />
        </div>
      </div>
      {paletteOpen && (
        <CommandPalette
          commands={commands}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
}
