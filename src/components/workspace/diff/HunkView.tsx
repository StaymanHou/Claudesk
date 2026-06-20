// WP4 Phase B — HunkView: render one diff Hunk as plain styled +/- lines.
//
// No CodeMirror — each line is a <div> with an origin-based class (context/add/
// remove) and old/new line-number gutters, the flat Sublime-Merge look (operator-
// confirmed render decision 2026-06-20). The backend (git2) already computed the
// hunks; this is pure presentation.

import { memo } from "react";
import type { Hunk } from "./diffModel";

interface HunkViewProps {
  hunk: Hunk;
}

// memo: a file section can hold many hunks; they never change once loaded, so skip
// re-render when the parent re-renders for an unrelated reason (e.g. collapse of a
// different file).
export const HunkView = memo(function HunkView({ hunk }: HunkViewProps) {
  return (
    <div className="diff-hunk" data-testid="diff-hunk">
      <div className="diff-hunk-header">{hunk.header.trimEnd()}</div>
      {hunk.lines.map((line, i) => {
        const sign =
          line.origin === "add" ? "+" : line.origin === "remove" ? "-" : " ";
        return (
          <div
            // Lines have no stable id of their own; index within a fixed,
            // never-reordered hunk is a safe key.
            key={i}
            className={`diff-line is-${line.origin}`}
            data-origin={line.origin}
          >
            <span className="diff-lineno diff-lineno-old">
              {line.old_lineno ?? ""}
            </span>
            <span className="diff-lineno diff-lineno-new">
              {line.new_lineno ?? ""}
            </span>
            <span className="diff-line-sign" aria-hidden>
              {sign}
            </span>
            {/* Preserve the content's own spacing; strip only the trailing newline
                git includes so each line doesn't render a blank row after it. */}
            <span className="diff-line-content">
              {line.content.replace(/\n$/, "")}
            </span>
          </div>
        );
      })}
    </div>
  );
});
