// WP7 Phase 2 — ProjectSearch: the ⌘⇧F project-wide "Find in Files" overlay.
//
// APP-LAYER subsystem (research.md correction — @codemirror/search is single-document
// only): a React overlay over the backend `project_search` command. The operator types
// a pattern (+ regex / case / whole-word toggles), hits Enter, and gets results grouped
// by file; clicking a match opens that file into the EditorPanel and scrolls to +
// highlights the match (via the openFile highlight-target seam).
//
// Mirrors FileFinder (WP6) / CommandPalette (WP3b) for the overlay shell + keyboard
// nav; the chord that OPENS it (⌘⇧F) is registered in RightPanelHost via the WP1
// capture-phase document listener so it fires while focus is inside CodeMirror.
//
// STATE IS LIFTED to RightPanelHost (query + results + error are props, not local):
// closing then re-opening the overlay restores the last search, and opening a result
// does NOT clear the list — so the operator can click through many matches. The
// overlay only owns transient UI state (the active-row index + in-flight flag).
//
// IPC ERRORS ARE SURFACED, NEVER SWALLOWED (the WP6 picker IPC error-surfacing lesson):
// a bad root or an invalid regex renders an inline error row, not a silent empty list.

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  byteOffsetToCharIndex,
  matchTargetFor,
  totalMatchCount,
  type FileMatches,
  type HighlightTarget,
  type LineMatch,
  type SearchQuery,
} from "./searchModel";
import { SEARCH_CHORD_LABEL } from "./searchChord";

interface ProjectSearchProps {
  /** The workspace project dir — the root project_search walks. */
  projectPath: string;
  /** The current query (lifted to RightPanelHost so it persists across re-opens). */
  query: SearchQuery;
  onQueryChange: (q: SearchQuery) => void;
  /** Last results (lifted). null = never searched this session; [] = searched, no matches. */
  results: FileMatches[] | null;
  onResults: (r: FileMatches[]) => void;
  /** Last error string (lifted), or null. */
  error: string | null;
  onError: (e: string | null) => void;
  /** Open a result's file at the match (line + char range → highlight). */
  onOpen: (path: string, target: HighlightTarget) => void;
  /** Close the overlay (Esc or backdrop click). */
  onClose: () => void;
}

/** One nav-addressable row in the flat match sequence (for ↓/↑ navigation). */
interface FlatRow {
  file: string;
  match: LineMatch;
}

/** Flatten grouped results into the document-order match sequence for keyboard nav. */
function flatten(results: FileMatches[]): FlatRow[] {
  return results.flatMap((f) =>
    f.matches.map((match) => ({ file: f.file, match })),
  );
}

export function ProjectSearch({
  projectPath,
  query,
  onQueryChange,
  results,
  onResults,
  error,
  onError,
  onOpen,
  onClose,
}: ProjectSearchProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the query field on open so the operator types immediately (Sublime parity).
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const flatRows = useMemo(() => (results ? flatten(results) : []), [results]);
  const active =
    flatRows.length === 0 ? -1 : Math.min(activeIndex, flatRows.length - 1);

  // Run the search. Explicit (Enter / Search button) — NOT as-you-type: project-wide
  // content search is heavier than the in-memory fuzzy finder, so we submit on intent.
  const runSearch = () => {
    if (query.pattern === "") return; // empty pattern is a no-op (backend rejects it too)
    setSearching(true);
    onError(null);
    invoke<FileMatches[]>("project_search", {
      root: projectPath,
      query: {
        pattern: query.pattern,
        regex: query.regex,
        case_sensitive: query.caseSensitive,
        whole_word: query.wholeWord,
      },
    })
      .then((r) => {
        onResults(r);
        setActiveIndex(0);
      })
      .catch((e: unknown) => {
        onError(String(e));
        onResults([]); // distinct from "never searched"; the error row is what's shown
      })
      .finally(() => setSearching(false));
  };

  const openRow = (row: FlatRow | undefined) => {
    if (!row) return;
    onOpen(row.file, matchTargetFor(row.match));
    // Do NOT close — keep the overlay so the operator can click through more matches
    // (the lifted-state design). Esc / backdrop closes it.
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (flatRows.length > 0)
          setActiveIndex((i) => (i + 1) % flatRows.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (flatRows.length > 0)
          setActiveIndex((i) => (i - 1 + flatRows.length) % flatRows.length);
        break;
      case "Enter":
        e.preventDefault();
        // Enter submits a new search when results are stale-or-absent; once results
        // exist, Enter opens the active row (the operator is navigating hits).
        if (results === null) runSearch();
        else openRow(flatRows[active]);
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
      default:
        break;
    }
  };

  const patch = (p: Partial<SearchQuery>) => onQueryChange({ ...query, ...p });

  // The flat-row index where each file group starts — so the grouped render can map a
  // match back to its flat-nav index for the active-row highlight. Derived (no
  // render-time mutation): groupStarts[i] = sum of match counts of groups before i.
  const groupStarts = useMemo(() => {
    const starts: number[] = [];
    let acc = 0;
    for (const f of results ?? []) {
      starts.push(acc);
      acc += f.matches.length;
    }
    return starts;
  }, [results]);

  return (
    <div
      className="command-palette-backdrop"
      data-testid="project-search"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="command-palette project-search"
        role="dialog"
        aria-label="Find in files"
      >
        <div className="project-search-controls">
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            data-testid="project-search-input"
            value={query.pattern}
            onChange={(e) => patch({ pattern: e.target.value })}
            onKeyDown={onKeyDown}
            placeholder={`Find in files…  (${SEARCH_CHORD_LABEL})`}
            aria-label="search pattern"
            spellCheck={false}
          />
          <div
            className="project-search-toggles"
            role="group"
            aria-label="search options"
          >
            <label className="project-search-toggle" title="Regular expression">
              <input
                type="checkbox"
                data-testid="project-search-regex"
                checked={query.regex}
                onChange={(e) => patch({ regex: e.target.checked })}
              />
              .*
            </label>
            <label className="project-search-toggle" title="Case sensitive">
              <input
                type="checkbox"
                data-testid="project-search-case"
                checked={query.caseSensitive}
                onChange={(e) => patch({ caseSensitive: e.target.checked })}
              />
              Aa
            </label>
            <label className="project-search-toggle" title="Whole word">
              <input
                type="checkbox"
                data-testid="project-search-word"
                checked={query.wholeWord}
                onChange={(e) => patch({ wholeWord: e.target.checked })}
              />
              W
            </label>
            <button
              type="button"
              className="project-search-go"
              data-testid="project-search-go"
              onClick={runSearch}
              disabled={query.pattern === "" || searching}
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
        </div>

        {error !== null ? (
          <div
            className="command-palette-empty"
            data-testid="project-search-error"
            role="alert"
          >
            Search failed: {error}
          </div>
        ) : results === null ? (
          <div
            className="command-palette-empty"
            data-testid="project-search-hint"
          >
            Type a pattern and press Enter to search the project.
          </div>
        ) : flatRows.length === 0 ? (
          <div
            className="command-palette-empty"
            data-testid="project-search-empty"
          >
            No matches
          </div>
        ) : (
          <>
            <div
              className="project-search-summary"
              data-testid="project-search-summary"
            >
              {totalMatchCount(results)} matches in {results.length} files
            </div>
            <ul
              className="command-palette-list project-search-list"
              role="listbox"
            >
              {results.map((fileGroup, gi) => {
                const groupStart = groupStarts[gi];
                return (
                  <li key={fileGroup.file} className="project-search-group">
                    <div
                      className="project-search-file"
                      data-testid="project-search-file"
                    >
                      {fileGroup.file}
                      <span className="project-search-file-count">
                        {fileGroup.matches.length}
                      </span>
                    </div>
                    <ul className="project-search-matches" role="group">
                      {fileGroup.matches.map((m, j) => {
                        const flatIndex = groupStart + j;
                        // Byte→char for the DISPLAY slice too (the editor highlight
                        // converts separately via matchTargetFor) — exact for
                        // multi-byte lines, a no-op for ASCII.
                        const cs = byteOffsetToCharIndex(m.line_text, m.start);
                        const ce = byteOffsetToCharIndex(m.line_text, m.end);
                        return (
                          <li
                            key={`${m.line}:${m.start}`}
                            role="option"
                            aria-selected={flatIndex === active}
                            className={
                              "project-search-match" +
                              (flatIndex === active
                                ? " command-palette-item-active"
                                : "")
                            }
                            data-testid="project-search-match"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              openRow({ file: fileGroup.file, match: m });
                            }}
                            onMouseEnter={() => setActiveIndex(flatIndex)}
                          >
                            <span className="project-search-line-no">
                              {m.line}
                            </span>
                            <span className="project-search-line-text">
                              {m.line_text.slice(0, cs)}
                              <mark className="project-search-hit">
                                {m.line_text.slice(cs, ce)}
                              </mark>
                              {m.line_text.slice(ce)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
