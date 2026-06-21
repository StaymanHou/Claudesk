// WP7 Phase 2 — ProjectSearch: the ⌘⇧F project-wide "Find in Files" QUERY overlay.
//
// APP-LAYER subsystem (research.md correction — @codemirror/search is single-document
// only): a small React overlay over the backend `project_search` command. The operator
// types a pattern (+ regex / case / whole-word toggles), hits Enter / Search, and the
// RESULTS render into a Sublime-style "Find Results" TAB in the editor (the WP12
// synthetic-tab seam) — NOT into this overlay. This overlay is QUERY+REPLACE INPUT: it
// owns the find/replace inputs + toggles + the search invocation, and hands the results
// up via `onResults`; RightPanelHost formats them into the tab. (Operator UX redirect
// 2026-06-21: floating result list → Find Results tab.)
//
// REPLACE (WP7 Phase 3): a replacement input + a project-wide "Replace All" button.
// Replace All is gated on a search having found matches (`canReplace`) and routes through
// `onReplaceAll` → RightPanelHost's confirm dialog (blast-radius counts) → the backend
// `project_replace`. Per-result / per-file replace are deferred (the read-only Find
// Results tab has no per-row affordance — SURFACE-2026-06-21-WP7-PER-RESULT-PER-FILE-REPLACE).
//
// Mirrors FileFinder (WP6) / CommandPalette (WP3b) for the overlay shell; the chord that
// OPENS it (⌘⇧F) is registered in RightPanelHost via the WP1 capture-phase document
// listener so it fires while focus is inside CodeMirror.
//
// STATE IS LIFTED to RightPanelHost (query + error are props): closing then re-opening
// the overlay restores the last query, and the results live in the tab (persistent
// across re-opens) — so the operator can click through many matches.
//
// IPC ERRORS ARE SURFACED, NEVER SWALLOWED (the WP6 picker IPC error-surfacing lesson):
// a bad root or an invalid regex renders an inline error row, not a silent empty result.

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { type FileMatches, type SearchQuery } from "./searchModel";
import { SEARCH_CHORD_LABEL } from "./searchChord";

interface ProjectSearchProps {
  /** The workspace project dir — the root project_search walks. */
  projectPath: string;
  /** The current query (lifted to RightPanelHost so it persists across re-opens). */
  query: SearchQuery;
  onQueryChange: (q: SearchQuery) => void;
  /** The current replacement text (lifted, persists across re-opens). */
  replacement: string;
  onReplacementChange: (r: string) => void;
  /** Last error string (lifted), or null. */
  error: string | null;
  onError: (e: string | null) => void;
  /** Hand the search results up — RightPanelHost renders them into the Find Results tab. */
  onResults: (results: FileMatches[], query: SearchQuery) => void;
  /**
   * True when a search has run and found ≥1 match — gates "Replace All" (we only replace
   * what the last search found, and the confirm needs the match/file counts).
   */
  canReplace: boolean;
  /** Open the Replace-All confirm flow (RightPanelHost owns the confirm + the replace). */
  onReplaceAll: () => void;
  /** Close the overlay (Esc or backdrop click). */
  onClose: () => void;
}

export function ProjectSearch({
  projectPath,
  query,
  onQueryChange,
  replacement,
  onReplacementChange,
  error,
  onError,
  onResults,
  canReplace,
  onReplaceAll,
  onClose,
}: ProjectSearchProps) {
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the query field on open so the operator types immediately (Sublime parity).
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Run the search. Explicit (Enter / Search button) — NOT as-you-type: project-wide
  // content search is heavier than the in-memory fuzzy finder, so we submit on intent.
  // On success the results go UP (onResults → the Find Results tab); the overlay does
  // not render them. An error stays inline here so the operator can fix the pattern.
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
      .then((r) => onResults(r, query))
      .catch((e: unknown) => onError(String(e)))
      .finally(() => setSearching(false));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        runSearch();
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

  return (
    <div
      className="command-palette-backdrop"
      data-testid="project-search"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="command-palette project-search project-search-query-only"
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

          {/* Replace row (WP7 Phase 3) — a replacement input + project-wide Replace All.
              Replace All is gated on a search having found matches (canReplace): we only
              replace what the last search found, and the confirm needs its counts. */}
          <div className="project-search-replace-row">
            <input
              type="text"
              className="command-palette-input"
              data-testid="project-search-replace"
              value={replacement}
              onChange={(e) => onReplacementChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  onClose();
                }
                // Enter in the replace field does NOT auto-replace — replace is
                // destructive and must go through the explicit button + confirm.
              }}
              placeholder="Replace with…"
              aria-label="replacement text"
              spellCheck={false}
            />
            <button
              type="button"
              className="project-search-go project-search-replace-all"
              data-testid="project-search-replace-all"
              onClick={onReplaceAll}
              disabled={!canReplace || searching}
              title={
                canReplace
                  ? "Replace every match across the project"
                  : "Run a search that finds matches first"
              }
            >
              Replace All
            </button>
          </div>
        </div>

        {/* Results render into the Find Results editor tab, not here. The overlay only
            surfaces a search ERROR inline (invalid regex / bad root) so the operator can
            fix the pattern without losing the overlay — the WP6 IPC-error-surfacing lesson. */}
        {error !== null && (
          <div
            className="command-palette-empty"
            data-testid="project-search-error"
            role="alert"
          >
            Search failed: {error}
          </div>
        )}
      </div>
    </div>
  );
}
