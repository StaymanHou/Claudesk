// WP4 Phase B — FileDiffSection: one collapsible changed-file section.
//
// Header row (status badge + path + staged tag + collapse chevron) over the file's
// hunks (HunkView per hunk). The header is always shown; the body shows the hunks
// when expanded + loaded, a loading line while fetching, an inline error if the
// fetch failed, or a "binary file" notice. Collapse state + the (lazy) hunk fetch
// are owned by the parent DiffPanel — this component is presentation + a toggle
// callback, so it stays pure enough to render identically in working-dir and
// commit views.

import { memo } from "react";
import { HunkView } from "./HunkView";
import { type ChangedStatus, type FileDiff, statusMeta } from "./diffModel";

/** The load state of one file's hunks (working-dir files lazy-load on expand). */
export type HunkLoad =
  | { kind: "idle" } // not yet fetched (collapsed working-dir file)
  | { kind: "loading" }
  | { kind: "loaded"; diff: FileDiff }
  | { kind: "error"; message: string };

interface FileDiffSectionProps {
  path: string;
  status: ChangedStatus;
  staged: boolean;
  collapsed: boolean;
  load: HunkLoad;
  onToggle: () => void;
  /**
   * Open this file in the workspace editor. Always opens the CURRENT working-tree
   * content — even when this section is part of a commit's diff (commit-row
   * blob-at-rev fidelity is deferred to WP5; see DiffPanel). Omitted → no
   * open-in-editor affordance.
   */
  onOpenInEditor?: (path: string) => void;
}

export const FileDiffSection = memo(function FileDiffSection({
  path,
  status,
  staged,
  collapsed,
  load,
  onToggle,
  onOpenInEditor,
}: FileDiffSectionProps) {
  const meta = statusMeta(status);
  return (
    <div className="diff-file-section" data-testid="diff-file-section">
      {/* The header is a flex row of two controls (not one <button> wrapping
          another — invalid HTML): the toggle covers most of the row; the
          open-in-editor button sits at the end and stops propagation so it never
          toggles collapse. */}
      <div className="diff-file-header" data-testid="diff-file-header">
        <button
          type="button"
          className="diff-file-toggle"
          data-testid="diff-file-toggle"
          aria-expanded={!collapsed}
          onClick={onToggle}
          title={`${meta.label}${staged ? " (staged)" : ""}: ${path}`}
        >
          <span className="diff-chevron" aria-hidden>
            {collapsed ? "▸" : "▾"}
          </span>
          <span
            className={`diff-badge diff-badge-${status}`}
            aria-label={meta.label}
          >
            {meta.badge}
          </span>
          <span className="diff-file-path">{path}</span>
          {staged && <span className="diff-staged-tag">staged</span>}
        </button>
        {onOpenInEditor && (
          <button
            type="button"
            className="diff-open-in-editor"
            data-testid="diff-open-in-editor"
            title="Open in editor"
            aria-label={`Open ${path} in editor`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenInEditor(path);
            }}
          >
            Edit
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="diff-file-body" data-testid="diff-file-body">
          {load.kind === "loading" && (
            <div className="diff-file-loading">Loading diff…</div>
          )}
          {load.kind === "error" && (
            <div className="diff-error" data-testid="diff-file-error">
              <p className="diff-error-detail">{load.message}</p>
            </div>
          )}
          {load.kind === "loaded" && load.diff.binary && (
            <div
              className="diff-binary-notice"
              data-testid="diff-binary-notice"
            >
              Binary file — no text diff to show.
            </div>
          )}
          {load.kind === "loaded" &&
            !load.diff.binary &&
            load.diff.hunks.length === 0 && (
              <div className="diff-binary-notice">No textual changes.</div>
            )}
          {load.kind === "loaded" &&
            !load.diff.binary &&
            load.diff.hunks.map((hunk, i) => <HunkView key={i} hunk={hunk} />)}
        </div>
      )}
    </div>
  );
});
