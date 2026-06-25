// WP12 — per-workspace SHARED document store, keyed by file path.
//
// The same file open in two panes must be ONE document (edit in pane 1 mirrors live
// in pane 2; dirty + save are document-level) — the VS Code "two views of one doc"
// model (operator decision 2026-06-21, Option 1). So the buffer (doc/savedDoc), the
// load + save lifecycles, the language override, and the disk marker all
// belong to the DOCUMENT, not to a pane/tab view. This reducer is that store: a map
// from path → DocEntry, ref-counted by how many views (tabs across all panes) hold
// the path open. EditorPanel becomes a VIEW that reads its entry from here and writes
// edits back; cursor/scroll stay per-view (in each CM6 instance), NOT here.
//
// Pure (no React, no IPC) → vitest-testable, the repo posture (mirrors editorLoad.ts /
// editorSave.ts / editorPanes.ts / openFiles.ts). EditorSplit drives it via useReducer
// and runs the read_file/write_file IPC, dispatching the load-*/save-* results here.
//
// REF-COUNTING: `open-doc` for an already-open path increments its refCount (a 2nd
// view); `close-doc` decrements and DROPS the entry only at 0. So closing one of two
// views keeps the buffer (the other view still shows it); closing the last view frees
// it. This is what makes "same file in 2 panes shares one buffer, survives one close".

import { type LoadState, initialLoadState, loadReducer } from "./editorLoad";
import { type SaveState, initialSaveState, saveReducer } from "./editorSave";

/** One open document — shared across every view (tab/pane) of its path. */
export interface DocEntry {
  /** Current buffer text (the shared edited content). */
  doc: string;
  /** Last-persisted snapshot — `dirty` is `doc !== savedDoc`. */
  savedDoc: string;
  /** Open + read lifecycle (read_file). Reused LoadState machine. */
  load: LoadState;
  /** Save + write lifecycle (write_file). Reused SaveState machine. */
  save: SaveState;
  /**
   * Palette syntax override id (null = derive from extension). Document-level so the
   * override is consistent across views of the same file.
   */
  languageOverrideId: string | null;
  /**
   * The on-disk marker (mtime+size) last seen for this document, for the
   * disk-change check. Undefined until first loaded/stat'd.
   */
  marker?: { mtime_ms: number; size: number };
  /** How many views (tabs across all panes) currently hold this path open. */
  refCount: number;
}

/** The store: path → DocEntry. A plain object keyed by path. */
export interface DocsState {
  byPath: Record<string, DocEntry>;
}

export type DocsEvent =
  // A view opened this path: create the entry (refCount 1) or bump refCount (a 2nd
  // view of an already-open doc — they now SHARE it). Idempotent per view via the
  // caller (PaneTabs opens once per tab).
  | { type: "open-doc"; path: string }
  // A view closed this path: refCount--; drop the entry at 0 (last view gone).
  | { type: "close-doc"; path: string }
  // An edit in any view: update the shared buffer (all views re-render).
  | { type: "set-doc"; path: string; doc: string }
  // Load lifecycle (the load-once-per-path read_file), delegated to loadReducer. On
  // load-ok the caller passes the loaded contents to seed doc + savedDoc.
  | { type: "load-start"; path: string }
  | { type: "load-ok"; path: string; contents: string }
  | { type: "load-fail"; path: string; message: string }
  // Save lifecycle (write_file), delegated to saveReducer. On save-ok the savedDoc
  // snapshot advances to the just-written contents (clears dirty in every view).
  | { type: "save-start"; path: string }
  | { type: "save-ok"; path: string; contents: string }
  | { type: "save-fail"; path: string; message: string }
  // Palette syntax override for a document.
  | { type: "set-override"; path: string; id: string | null }
  // Record/refresh the disk marker for a document.
  | {
      type: "set-marker";
      path: string;
      marker: { mtime_ms: number; size: number };
    };

export const initialDocsState: DocsState = { byPath: {} };

/** A fresh, unloaded entry for a newly-opened path (refCount starts at 1). */
function freshEntry(): DocEntry {
  return {
    doc: "",
    savedDoc: "",
    load: initialLoadState,
    save: initialSaveState,
    languageOverrideId: null,
    refCount: 1,
  };
}

/** Replace one path's entry (immutably), or no-op if the path isn't open. */
function updateEntry(
  state: DocsState,
  path: string,
  fn: (e: DocEntry) => DocEntry,
): DocsState {
  const entry = state.byPath[path];
  if (!entry) return state; // event for a closed/unknown path → ignore
  const next = fn(entry);
  if (next === entry) return state; // fn signalled no change → preserve state identity
  return { byPath: { ...state.byPath, [path]: next } };
}

export function docsReducer(state: DocsState, event: DocsEvent): DocsState {
  switch (event.type) {
    case "open-doc": {
      const existing = state.byPath[event.path];
      if (existing) {
        // A 2nd (3rd, …) view of an already-open doc → share it, bump the ref count.
        return updateEntry(state, event.path, (e) => ({
          ...e,
          refCount: e.refCount + 1,
        }));
      }
      return { byPath: { ...state.byPath, [event.path]: freshEntry() } };
    }
    case "close-doc": {
      const entry = state.byPath[event.path];
      if (!entry) return state;
      if (entry.refCount <= 1) {
        // Last view closed → drop the entry (frees the buffer).
        const next = { ...state.byPath };
        delete next[event.path];
        return { byPath: next };
      }
      return updateEntry(state, event.path, (e) => ({
        ...e,
        refCount: e.refCount - 1,
      }));
    }
    case "set-doc":
      return updateEntry(state, event.path, (e) =>
        e.doc === event.doc ? e : { ...e, doc: event.doc },
      );
    case "load-start":
      return updateEntry(state, event.path, (e) => ({
        ...e,
        load: loadReducer(e.load, { type: "load-start", path: event.path }),
        save: saveReducer(e.save, { type: "reset" }), // clear stale save status on (re)load
      }));
    case "load-ok":
      return updateEntry(state, event.path, (e) => ({
        ...e,
        doc: event.contents,
        savedDoc: event.contents,
        load: loadReducer(e.load, { type: "load-ok", path: event.path }),
      }));
    case "load-fail":
      return updateEntry(state, event.path, (e) => ({
        ...e,
        doc: "",
        savedDoc: "",
        load: loadReducer(e.load, {
          type: "load-fail",
          path: event.path,
          message: event.message,
        }),
      }));
    case "save-start":
      return updateEntry(state, event.path, (e) => ({
        ...e,
        save: saveReducer(e.save, { type: "save-start", path: event.path }),
      }));
    case "save-ok":
      return updateEntry(state, event.path, (e) => ({
        ...e,
        // Advance the saved snapshot to what was actually written → dirty clears in
        // every view of this path.
        savedDoc: event.contents,
        save: saveReducer(e.save, { type: "save-ok", path: event.path }),
      }));
    case "save-fail":
      return updateEntry(state, event.path, (e) => ({
        ...e,
        save: saveReducer(e.save, {
          type: "save-fail",
          path: event.path,
          message: event.message,
        }),
      }));
    case "set-override":
      return updateEntry(state, event.path, (e) =>
        e.languageOverrideId === event.id
          ? e
          : { ...e, languageOverrideId: event.id },
      );
    case "set-marker":
      return updateEntry(state, event.path, (e) => ({
        ...e,
        marker: event.marker,
      }));
    default:
      return state;
  }
}

/** Whether a doc entry has unsaved edits. Pure derivation — the ● dirty indicator. */
export function isDirty(entry: DocEntry | undefined): boolean {
  return entry != null && entry.doc !== entry.savedDoc;
}

/**
 * How many open documents have unsaved edits (QoL-WP1 — the workspace-close dirty
 * guard). A fold over the store via `isDirty`; 0 when every open doc is clean (or none
 * are open). Pure → vitest-testable. The close handler reads this (via the
 * EditorSplit handle's `dirtyDocCount`) to decide whether to prompt before tearing down
 * a workspace.
 */
export function dirtyDocCount(state: DocsState): number {
  return Object.values(state.byPath).filter((e) => isDirty(e)).length;
}
