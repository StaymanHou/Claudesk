// WP2 — EditorPanel: the lite editor mounted in a workspace's right half.
//
// Mounts a CodeMirror 6 view (via @uiw/react-codemirror) and drives the file
// lifecycle: open (read_file via IPC) → edit (local buffer) → save (Cmd+S →
// write_file via IPC). Dark-only theme + language mode by extension. A read OR
// write failure is rendered inline, never swallowed (the WP6/WP7 IPC-error-
// surfacing lesson).
//
// Per WP5 this becomes one panel the RightPanelHost swaps; for WP2 it sits
// directly in the right half. Background workspaces stay mounted (display:none),
// and WP1's probe confirmed N mounted CM6 editors stay within the perf envelope,
// so there is no unmount-on-blur here.

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { invoke } from "@tauri-apps/api/core";
import { buildEditorExtensions } from "./editorExtensions";
import { editorDarkTheme } from "./theme";
import { loadFontSize, saveFontSize } from "./fontZoom";
import { initialLoadState, loadReducer } from "./editorLoad";
import { initialSaveState, saveReducer } from "./editorSave";

interface EditorPanelProps {
  /** Workspace project dir — the root the backend confines file IO to. */
  projectPath: string;
  /** File to open, relative to projectPath (or absolute inside it). Null = no file. */
  openPath: string | null;
}

export function EditorPanel({ projectPath, openPath }: EditorPanelProps) {
  const [doc, setDoc] = useState("");
  // The last-persisted snapshot of the buffer — `dirty` is derived from it.
  const [savedDoc, setSavedDoc] = useState("");
  // `load`/`save` track the open and write lifecycles via useReducer so the
  // IPC dispatches are stable functions (mirrors XtermPane/cc bridge; keeps
  // setState out of raw effect bodies). "no file open" is derived from openPath.
  const [load, dispatch] = useReducer(loadReducer, initialLoadState);
  const [save, dispatchSave] = useReducer(saveReducer, initialSaveState);
  // Font size seeded from the persisted global value (lazy init so localStorage
  // is read once on mount, not every render). Cmd+=/-/0 update it; onFontSizeChange
  // mirrors the keybinding's live compartment reconfigure into state + persistence.
  const [fontSize, setFontSize] = useState(() => loadFontSize());

  const onFontSizeChange = useCallback((px: number) => {
    setFontSize(px);
    saveFontSize(px);
  }, []);

  // Load the file whenever openPath changes. read_file errors (missing file,
  // binary content, path outside the workspace) surface into `load`. The effect
  // only runs the async read; the null case is handled by the render guard.
  useEffect(() => {
    if (openPath == null) return;
    let cancelled = false;
    dispatch({ type: "load-start", path: openPath });
    dispatchSave({ type: "reset" }); // clear any stale save status from the prior file
    invoke<string>("read_file", { root: projectPath, path: openPath })
      .then((contents) => {
        if (cancelled) return;
        setDoc(contents);
        setSavedDoc(contents);
        dispatch({ type: "load-ok", path: openPath });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        dispatch({ type: "load-fail", path: openPath, message: String(e) });
        setDoc("");
        setSavedDoc("");
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath, openPath]);

  const onChange = useCallback((value: string) => setDoc(value), []);

  const dirty = doc !== savedDoc;

  // The save action — a stable-identity callback over the live values. No-op when
  // no file is open or nothing changed.
  const doSave = useCallback(() => {
    if (openPath == null) return;
    if (!dirty && save.kind !== "error") return; // nothing to persist
    const path = openPath;
    const contents = doc;
    dispatchSave({ type: "save-start", path });
    invoke<void>("write_file", { root: projectPath, path, contents })
      .then(() => {
        setSavedDoc(contents);
        dispatchSave({ type: "save-ok", path });
      })
      .catch((e: unknown) => {
        dispatchSave({ type: "save-fail", path, message: String(e) });
      });
  }, [openPath, dirty, save.kind, doc, projectPath]);

  // The full extension set is built by the pure editorExtensions builder: the
  // core keymap (Mod-s save, Mod-d select-next, search keymap — all at
  // Prec.highest so they beat CM6 + the browser/OS default; the WP1 lesson for
  // editor-focused chords), multi-cursor / rectangular (alt-drag) selection, and
  // the in-file find/replace panel. The save chord closes over the live `doSave`,
  // so the array is rebuilt when doSave's deps change; @uiw/react-codemirror
  // reconfigures the view when the extensions array identity changes, so the
  // binding always calls the current closure — no ref-in-render needed.
  const extensions = useMemo(
    () =>
      buildEditorExtensions({
        openPath: openPath ?? "",
        onSave: doSave,
        fontSize,
        onFontSizeChange,
      }),
    [openPath, doSave, fontSize, onFontSizeChange],
  );

  // No file open is derived from the prop — not stored in `load`.
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
      </div>
      {save.kind === "error" && (
        <div className="editor-save-error" data-testid="editor-save-error">
          Could not save {save.path}: {save.message}
        </div>
      )}
      <CodeMirror
        value={doc}
        onChange={onChange}
        theme={editorDarkTheme}
        extensions={extensions}
        basicSetup={{ lineNumbers: true, foldGutter: false }}
      />
    </div>
  );
}
