// M11 WP2 — the Docs panel body: a workflow-ordered list of the project's conventional
// strategic docs.
//
// SCOPE: this WP is the LIST only. Selecting a row records the selection (per-workspace,
// preserved across panel switches like every other panel's state) but renders nothing —
// WP3 adds the markdown render, WP4 adds scroll-preserving live reload on `fs-change`.
// Deliberately no `fs-change` listener here: re-fetching the list on every disk write is
// WP4's concern, and adding it now would be an untested seam nothing consumes.
//
// GATING: this component is only ever MOUNTED when the workflow gate is on — the parent
// (`RightPanelHost`) renders the whole slot inside an `enabled &&` branch. It does not
// read the gate itself; a second read would be a second source of truth (the M10.9 seam
// contract's "never invoke the command ad hoc" rule).

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { docsView, labelFor, orderDocs, type DocEntry } from "../docsOrder";

interface DocsPanelProps {
  /** The workspace's project root — the discovery scope, authenticated backend-side. */
  projectPath: string;
  /** Whether this host is the center-staged workspace (gates the initial fetch). */
  visible: boolean;
}

export function DocsPanel({ projectPath, visible }: DocsPanelProps) {
  const [docs, setDocs] = useState<DocEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Fetch once per project. `visible` gates the FIRST fetch so a backgrounded workspace
  // doesn't hit the filesystem on mount — but once fetched we keep the result (all
  // workspaces stay mounted; switching the center stage must not refetch or lose the
  // selection). The `cancelled` flag is the StrictMode double-mount guard used by every
  // async effect in this file's siblings.
  useEffect(() => {
    if (!visible || docs !== null) return;
    let cancelled = false;
    void invoke<DocEntry[]>("docs_list", { root: projectPath })
      .then((entries) => {
        if (cancelled) return;
        setDocs(entries);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Surfaced, never swallowed (the WP6/WP7 error-surfacing lesson): a failed
        // discovery must read as an error, not as "this project has no docs".
        setError(String(e));
        setDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, projectPath, docs]);

  const ordered = docs ? orderDocs(docs) : [];
  // ONE view at a time, decided by a pure function so the exclusivity is testable as a
  // value (docsOrder.docsView). Rendering three independent conditionals here is how you
  // end up showing an error banner above an "empty" message.
  const view = docsView(docs, error);

  return (
    <div className="docs-panel" data-testid="docs-panel">
      {view === "error" && (
        <div className="docs-panel-error" data-testid="docs-panel-error">
          Could not read this project&rsquo;s docs: {error}
        </div>
      )}

      {view === "empty" && (
        <div className="docs-panel-empty" data-testid="docs-panel-empty">
          No workflow docs found in this project.
        </div>
      )}

      {view === "list" && (
        <ul
          className="docs-list"
          role="listbox"
          aria-label="workflow documents"
          data-testid="docs-list"
        >
          {ordered.map((entry) => (
            <li key={entry.rel_path}>
              <button
                type="button"
                role="option"
                aria-selected={selected === entry.rel_path}
                className={`docs-list-row${
                  selected === entry.rel_path ? " is-selected" : ""
                }`}
                data-testid={`docs-row-${entry.kind}`}
                data-rel-path={entry.rel_path}
                onClick={() => setSelected(entry.rel_path)}
                // The full path is the disambiguator the label omits — several
                // `*wbs*.md` label by filename, and the tooltip says where each lives.
                title={entry.rel_path}
              >
                {labelFor(entry)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
