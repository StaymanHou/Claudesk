// WP4 Phase B — CommitList: the collapsible "Commits" section at the top of the
// diff panel (operator-confirmed placement 2026-06-20: a collapsible top region,
// not a left rail — fits the half-width column).
//
// Lists recent commits (subject, author, relative time, short SHA, HEAD marker),
// newest-first, in pages with a "Load more" button. Selecting a commit asks the
// parent to switch the files area to that commit's diff. The fetch + pagination
// accumulation live in the parent DiffPanel; this is presentation + callbacks.

import { memo } from "react";
import { type CommitSummary, relativeTime } from "./diffModel";

interface CommitListProps {
  commits: readonly CommitSummary[];
  collapsed: boolean;
  /** True while a (first or "load more") page fetch is in flight. */
  loading: boolean;
  /** Show the "Load more" affordance (false at end of history). */
  showLoadMore: boolean;
  /** Epoch seconds, for relative-time formatting (passed so render stays pure). */
  nowSecs: number;
  /** SHA of the commit currently being viewed in the files area, if any. */
  selectedSha: string | null;
  onToggleCollapsed: () => void;
  onSelect: (commit: CommitSummary) => void;
  onLoadMore: () => void;
}

export const CommitList = memo(function CommitList({
  commits,
  collapsed,
  loading,
  showLoadMore,
  nowSecs,
  selectedSha,
  onToggleCollapsed,
  onSelect,
  onLoadMore,
}: CommitListProps) {
  return (
    <div className="diff-commits" data-testid="diff-commits">
      <button
        type="button"
        className="diff-commits-header"
        data-testid="diff-commits-header"
        aria-expanded={!collapsed}
        onClick={onToggleCollapsed}
      >
        <span className="diff-chevron" aria-hidden>
          {collapsed ? "▸" : "▾"}
        </span>
        <span className="diff-commits-title">Commits</span>
        <span className="diff-commits-count">{commits.length}</span>
      </button>

      {!collapsed && (
        <div className="diff-commits-body" data-testid="diff-commits-body">
          {commits.length === 0 && !loading && (
            <div className="diff-commits-empty">No commits yet.</div>
          )}
          <ul className="diff-commit-list">
            {commits.map((c) => (
              <li key={c.sha}>
                <button
                  type="button"
                  className={`diff-commit-row${c.sha === selectedSha ? " is-selected" : ""}`}
                  data-testid="diff-commit-row"
                  data-selected={c.sha === selectedSha}
                  onClick={() => onSelect(c)}
                  title={c.subject}
                >
                  <span className="diff-commit-subject">{c.subject}</span>
                  <span className="diff-commit-meta">
                    {c.is_head && (
                      <span className="diff-commit-head">HEAD</span>
                    )}
                    <span className="diff-commit-sha">{c.short_sha}</span>
                    <span className="diff-commit-author">{c.author}</span>
                    <span className="diff-commit-time">
                      {relativeTime(c.time, nowSecs)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {loading && <div className="diff-commits-loading">Loading…</div>}
          {showLoadMore && !loading && (
            <button
              type="button"
              className="diff-load-more"
              data-testid="diff-load-more"
              onClick={onLoadMore}
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
});
