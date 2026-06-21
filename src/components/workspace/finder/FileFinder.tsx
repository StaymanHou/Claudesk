// WP6 Phase 3 — FileFinder: the Cmd+P fuzzy file-finder overlay.
//
// APP-LAYER subsystem (not an editor feature — research.md correction): a React
// overlay over the backend file index. On open it loads the workspace's file list
// via the `fs_index` IPC command (lazy — re-walked each open so it reflects the
// current tree), fuzzy-matches the typed query (fuzzyMatch.ts), and on selection
// opens the file into the EditorPanel via the parent's onOpen seam.
//
// Mirrors CommandPalette (WP3b) for the overlay shell + keyboard nav; the chord
// that OPENS it (bare ⌘P) is registered in RightPanelHost via the WP1 capture-phase
// document listener so it fires while focus is inside CodeMirror. Dark-only,
// palette-aligned to App.css.
//
// IPC ERRORS ARE SURFACED, NEVER SWALLOWED (the WP6 picker IPC error-surfacing
// MAJORs, SURFACE-2026-06-18-QUALITY-*): a failed `fs_index` renders an inline
// error row, not a silently-empty list.

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { rankFiles } from "./fuzzyMatch";
import { FINDER_CHORD_LABEL } from "./finderChord";

interface FileFinderProps {
  /** The workspace project dir — the root fs_index walks. */
  projectPath: string;
  /** Open the chosen file (project-relative path) into the editor. */
  onOpen: (path: string) => void;
  /** Close the overlay (Esc, backdrop click, or after opening a file). */
  onClose: () => void;
}

/** Max rows rendered — a keyboard picker never needs more on screen at once. */
const VISIBLE_LIMIT = 100;

export function FileFinder({ projectPath, onOpen, onClose }: FileFinderProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [files, setFiles] = useState<string[] | null>(null); // null = loading
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the filter on open so the user types immediately (Sublime parity).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load the index on open (lazy — always fresh). The overlay is mounted fresh each
  // time it opens (RightPanelHost renders it conditionally), so the initial state
  // (files=null "loading", error=null) is already correct — no synchronous reset
  // needed; we only set state from the async resolution. An fs_index failure is
  // surfaced inline (the WP6 IPC error-surfacing lesson), NOT swallowed into an
  // empty list.
  useEffect(() => {
    let cancelled = false;
    invoke<string[]>("fs_index", { root: projectPath })
      .then((list) => {
        if (!cancelled) setFiles(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(String(e));
          setFiles([]); // distinct from "loading"; the error row is what's shown
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  const ranked = useMemo(
    () => (files === null ? [] : rankFiles(query, files, VISIBLE_LIMIT)),
    [files, query],
  );

  // Keep the active index in range as the ranked list shrinks/grows.
  const active =
    ranked.length === 0 ? -1 : Math.min(activeIndex, ranked.length - 1);

  const openActive = () => {
    const match = ranked[active];
    if (!match) return;
    onOpen(match.path);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (ranked.length > 0) setActiveIndex((i) => (i + 1) % ranked.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (ranked.length > 0)
          setActiveIndex((i) => (i - 1 + ranked.length) % ranked.length);
        break;
      case "Enter":
        e.preventDefault();
        openActive();
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
      default:
        break;
    }
  };

  return (
    <div
      className="command-palette-backdrop"
      data-testid="file-finder"
      // Click outside the panel closes (mousedown so it beats the input blur).
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="command-palette" role="dialog" aria-label="File finder">
        <input
          ref={inputRef}
          type="text"
          className="command-palette-input"
          data-testid="file-finder-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={`Go to file…  (${FINDER_CHORD_LABEL})`}
          aria-label="file filter"
          spellCheck={false}
        />
        {error !== null ? (
          <div
            className="command-palette-empty"
            data-testid="file-finder-error"
            role="alert"
          >
            Could not list files: {error}
          </div>
        ) : files === null ? (
          <div
            className="command-palette-empty"
            data-testid="file-finder-loading"
          >
            Indexing…
          </div>
        ) : (
          <ul className="command-palette-list" role="listbox">
            {ranked.length === 0 ? (
              <li
                className="command-palette-empty"
                data-testid="file-finder-empty"
              >
                No matching files
              </li>
            ) : (
              ranked.map((m, i) => (
                <li
                  key={m.path}
                  role="option"
                  aria-selected={i === active}
                  className={
                    "command-palette-item" +
                    (i === active ? " command-palette-item-active" : "")
                  }
                  data-testid="file-finder-item"
                  // mousedown (not click) so the input's blur doesn't fire first
                  // and tear the overlay down before the open runs.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onOpen(m.path);
                    onClose();
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  {m.path}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
