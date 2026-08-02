// M11 — the Docs panel: a workflow-ordered list of the project's conventional strategic
// docs (WP2) above the selected one, rendered read-only (WP3).
//
// SCOPE as of WP3: list + render + auto-select-on-open + link navigation. Still no
// `fs-change` listener — live reload is WP4's, and WP4 also adds "jump to a doc that newly
// APPEARS" (an operator decision at WP3 verify-human; see `wbs.md` task 4.3, which was
// amended for it). Adding the subscription now would be an untested seam nothing consumes.
//
// The heavy lifting lives in pure siblings so it is testable as values rather than trusted
// inside hooks: `docsOrder` (order/label/which-view), `fetchLatch` (the StrictMode-safe
// fetch-once machine), `pickInitialDoc` (where the panel lands), `classifyHref` +
// `resolveDocLink` (link routing), `frontmatter` + `DocMarkdown` (the render).
//
// GATING: this component is only ever MOUNTED when the workflow gate is on — the parent
// (`RightPanelHost`) renders the whole slot inside an `enabled &&` branch. It does not
// read the gate itself; a second read would be a second source of truth (the M10.9 seam
// contract's "never invoke the command ad hoc" rule).

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  docContentView,
  docsView,
  labelFor,
  orderDocs,
  type DocEntry,
} from "../docsOrder";
import { DocMarkdown } from "./DocMarkdown";
import { latchNext, shouldFetch, type LatchState } from "./fetchLatch";
import { selectedDoc } from "./pickInitialDoc";
import { anchorSelector, classifyHref } from "./classifyHref";
import { resolveDocLink } from "./resolveDocLink";
import { openUrl } from "@tauri-apps/plugin-opener";

interface DocsPanelProps {
  /** The workspace's project root — the discovery scope, authenticated backend-side. */
  projectPath: string;
  /** Whether this host is the center-staged workspace (gates the initial fetch). */
  visible: boolean;
}

export function DocsPanel({ projectPath, visible }: DocsPanelProps) {
  const [docs, setDocs] = useState<DocEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ⚠️ `chosen` is the USER's explicit pick, and `null` means "hasn't picked yet" — it is
  // NOT the selected doc. The actual selection is DERIVED below as
  // `chosen ?? pickInitialDoc(docs)`.
  //
  // Why derived rather than written by an effect when the list arrives: the same reason
  // the panel default is derived in RightPanelHost. An effect that calls `setSelected`
  // once the fetch lands is a cascading render (`react-hooks/set-state-in-effect`), and it
  // leaves one frame where docs exist but nothing is selected — a visible flash of "list
  // with no document". Deriving closes that window entirely: the first render that has
  // docs also has a selection.
  //
  // It also keeps WP4 honest. WP4 re-runs `pickInitialDoc` when a NEW doc appears, and
  // must never override an explicit user pick; with intent stored separately from the
  // computed answer, "has the user chosen?" is a fact in state rather than something WP4
  // has to infer by comparing paths.
  const [chosen, setChosen] = useState<string | null>(null);

  // A one-line note for link outcomes the user should see but that are not errors in
  // the panel: an external open that failed, or a link pointing outside the curated doc
  // set. Cleared on the next successful navigation.
  const [linkNote, setLinkNote] = useState<string | null>(null);

  // The scroll box. WP4 restores `scrollTop` on this element; P2.4 scopes
  // anchor-scrolling to it so a `#fragment` scrolls the panel, not the app shell.
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Fetch once per project. `visible` gates the FIRST fetch so a backgrounded workspace
  // doesn't hit the filesystem on mount — but once fetched we keep the result (all
  // workspaces stay mounted; switching the center stage must not refetch or lose the
  // selection). The `cancelled` flag is the StrictMode double-mount guard used by every
  // async effect in this file's siblings.
  //
  // ⚠️ The has-fetched latch is an EXPLICIT ref, not `docs !== null`
  // (SURFACE-2026-08-01-QUALITY-WP2-DOCSPANEL-FETCH-LATCH-ENTANGLED-WITH-DATA, fixed in
  // WP3 before the render state landed). Deriving the latch from the data made the
  // effect's re-run depend on its own write, and worked only because BOTH arms happen to
  // store a non-null value. M11 WP4 adds live reload to this component: a refetch that
  // resets `docs` to null would re-arm the effect and, against a persistently failing
  // `docs_list`, loop. Stating the latch separately makes fetch-once a property of the
  // code rather than an emergent accident. `useRef` (not state) deliberately: flipping it
  // must not itself schedule a render.
  //
  // The ref is never reset on a `projectPath` change, and that is sound rather than an
  // oversight: `CenterStage` keys each `Workspace` by `ws.id` and threads
  // `workspace.project_path` down, so one mounted host is one project for its entire
  // lifetime — a different project is a different key and therefore a fresh mount with a
  // fresh ref. `projectPath` stays in the dep array as documentation of the real input;
  // it simply cannot change in practice.
  // ⚠️ The latch is RELEASED by the cleanup, and that is load-bearing — not tidiness.
  // React StrictMode runs every effect mount → unmount → remount. A latch that is set
  // before the await and never released deadlocks on exactly that sequence:
  //   mount   → latch = true, fetch starts
  //   unmount → cleanup sets cancelled = true
  //   remount → latch is still true, so the guard returns early and never refetches
  //   …then the first response lands, sees `cancelled`, and DISCARDS its data
  // leaving `docs === null` forever, which `docsView` renders as "loading" — a
  // permanently blank panel. This shipped and was caught at verify-human (2026-08-02).
  //
  // Releasing the latch on the cancelled path lets the remount re-arm and fetch again,
  // which is what makes fetch-once correct under StrictMode rather than merely stated.
  // (The predecessor `docs !== null` latch survived this by accident: it read from state,
  // which the discarded write never updated, so the remount refetched.)
  // The latch itself is the pure state machine in `fetchLatch.ts`, driven from here. It
  // lives in its own module so the mount/unmount/remount sequence is asserted as a VALUE
  // (`fetchLatch.test.ts`) instead of trusted inside a hook — which is exactly what failed.
  const latchRef = useRef<LatchState>("idle");
  useEffect(() => {
    if (!shouldFetch(latchRef.current, visible)) return;
    latchRef.current = latchNext(latchRef.current, "start");
    let cancelled = false;
    void invoke<DocEntry[]>("docs_list", { root: projectPath })
      .then((entries) => {
        if (cancelled) return;
        latchRef.current = latchNext(latchRef.current, "settle");
        setDocs(entries);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        latchRef.current = latchNext(latchRef.current, "settle");
        // Surfaced, never swallowed (the WP6/WP7 error-surfacing lesson): a failed
        // discovery must read as an error, not as "this project has no docs".
        setError(String(e));
        setDocs([]);
      });
    return () => {
      cancelled = true;
      latchRef.current = latchNext(latchRef.current, "cancel");
    };
  }, [visible, projectPath]);

  // ── The selected doc's CONTENT (WP3) ──────────────────────────────────────────
  // Refetched on every selection change, unlike the list's fetch-once.
  //
  // ⚠️ The fetch result is stored TOGETHER WITH the path it belongs to, and the render
  // DERIVES whether that result is current (`loaded.path === selected`). It is not reset
  // in the effect. Two reasons, and the second is the one that matters:
  //
  //   1. Clearing state at the top of an effect is the cascading-render pattern
  //      `react-hooks/set-state-in-effect` rejects — the same lint that made WP2 derive
  //      `panel` from `reconcilePanel(storedPanel, gate)` rather than sync it.
  //   2. Deriving is strictly CORRECT here, not merely lint-clean. A reset-in-effect
  //      leaves one frame in which the new doc is selected but the OLD doc's text is
  //      still in state — the panel would render one document's content under another
  //      document's highlighted row. Pairing the data with its key makes that state
  //      unrepresentable rather than merely brief.
  //
  // A late-arriving response for a doc the user already navigated away from is ignored by
  // the same comparison, on top of the `cancelled` guard.
  const [loaded, setLoaded] = useState<{
    path: string;
    text: string | null;
    error: string | null;
  } | null>(null);

  // THE selection: the user's explicit pick, else the auto-selected landing doc. Computed
  // before the content effect so that effect sees the auto-selection on the very first
  // render that has docs — which is what makes the panel open on a rendered document with
  // no click (P2.2, `[PRIOR: primary-surface-is-zero-ceremony-not-a-mode]`).
  const selected = selectedDoc(chosen, docs);

  useEffect(() => {
    if (selected === null) return;
    let cancelled = false;
    void invoke<string>("docs_read", { root: projectPath, path: selected })
      .then((text) => {
        if (cancelled) return;
        setLoaded({ path: selected, text, error: null });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Surfaced, never swallowed — a doc that fails to read must say so rather than
        // render as an empty document.
        setLoaded({ path: selected, text: null, error: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [selected, projectPath]);

  // Current-for-this-selection, or nothing. This is the derivation described above.
  const current = loaded !== null && loaded.path === selected ? loaded : null;

  const ordered = docs ? orderDocs(docs) : [];
  // ONE view at a time, decided by a pure function so the exclusivity is testable as a
  // value (docsOrder.docsView). Rendering three independent conditionals here is how you
  // end up showing an error banner above an "empty" message.
  const view = docsView(docs, error);
  const contentView = docContentView(
    selected,
    current?.text ?? null,
    current?.error ?? null,
  );

  // ── P2.4 — link navigation, via ONE delegated handler on the content container ──
  //
  // Delegated rather than a `components={{ a }}` renderer override: WP1 chose this because
  // it is renderer-agnostic (a future renderer swap keeps working) and because there is
  // one place to reason about "can a click ever navigate the webview?" rather than one per
  // link.
  //
  // ⚠️ `preventDefault()` fires for EVERY classified href, including ones we then do
  // nothing with. Claudesk's window has no back button, so a webview that navigates away
  // is an unrecoverable state — "block first, then decide" is the only safe order.
  //
  // ⚠️ `[[slug]]` links are NOT handled here and structurally CANNOT be (P2.5): WP1
  // measured that the renderer emits them as literal text with no `<a>` element at all, so
  // this handler never sees them. Decision + rationale in the WIP.
  const onContentClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest?.("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;

    // Read the AUTHORED href, not `anchor.href` — the DOM property resolves relative URLs
    // against the page origin, turning `wbs.md` into `http://localhost:1420/wbs.md`, which
    // would make every cross-doc link classify as external.
    const href = anchor.getAttribute("href") ?? "";

    // ⚠️ preventDefault FIRST — before classification, before ANY early return. The anchor
    // was matched by `closest("a[href]")`, so at this point the click is definitely on a
    // link inside rendered doc content, and NO such click may ever perform its default
    // action.
    //
    // This previously sat below `if (kind === "empty") return;`, which left one reachable
    // hole: markdown `[click]()` renders a live `<a href="">` (measured — it survives the
    // sanitizer), classifies as `empty`, and took the early return with the event still
    // cancelable. In a WKWebView an empty href navigates to the CURRENT url, i.e. an
    // app-shell reload — and Claudesk's window has no back button, which is exactly the
    // unrecoverable state this ordering exists to prevent. Found at Phase 3 verify-self by
    // a subagent asked to attack the claim; the guard test named for this invariant did
    // NOT catch it, because it compared source-text positions and was structurally blind
    // to an early return sitting above the call (see `docsPanelWiring.test.ts`).
    e.preventDefault();

    const kind = classifyHref(href);
    // Nothing actionable, but the default action is already blocked above.
    if (kind === "empty") return;

    if (kind === "external") {
      // Clear any stale note first: a successful navigation of ANY kind should not leave
      // the previous link's message on screen (observed live at Phase 3 verify-self — a
      // "not one of this project's docs" note persisted through a later successful
      // external open, making the successful click look like it had failed).
      setLinkNote(null);
      // The app's FIRST `openUrl` call site. Failure is surfaced, not swallowed: a
      // silently dead link is indistinguishable from a broken handler.
      void openUrl(href).catch((err: unknown) => {
        setLinkNote(`Could not open ${href}: ${String(err)}`);
      });
      return;
    }

    if (kind === "anchor") {
      setLinkNote(null);
      const target = contentRef.current?.querySelector(anchorSelector(href));
      // `block: "start"` scrolls WITHIN `.docs-content` (the panel's own scroll box)
      // rather than scrolling the whole app shell.
      target?.scrollIntoView({ block: "start" });
      return;
    }

    // cross-doc: resolve against the doc it was written in, then switch the selection.
    if (selected === null || docs === null) return;
    const resolved = resolveDocLink(href, selected, docs);
    if (resolved.kind === "not-in-set") {
      // Deliberately visible. `CHANGELOG.md` / `README.md` are real files that are NOT in
      // the curated doc set, so this is reachable in normal use — and a click that does
      // nothing at all reads as a broken panel.
      setLinkNote(
        `Not one of this project's workflow docs: ${resolved.attempted}`,
      );
      return;
    }
    setLinkNote(null);
    setChosen(resolved.relPath);
  };

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

      {/* ── LAYOUT (WP3 task P1.6) ────────────────────────────────────────────────
          The list sits in a FIXED-HEIGHT scrollable strip along the top, with the
          rendered doc filling the remaining space below it.

          Decided over the two alternatives:
            · list-replaced-by-content + a back button — rejected: re-orientation is the
              whole point of this panel, and hiding the other docs behind a navigation
              step re-introduces exactly the ceremony
              `primary-surface-is-zero-ceremony-not-a-mode` argues against. Cross-doc
              links would also have no visible destination context.
            · a left/right split — rejected: the panel already lives in the right HALF of
              a workspace, so a further vertical split leaves the prose column too narrow
              to read tables and code blocks, which is most of what these docs contain.

          ⚠️ The stacked layout is also what WP4 needs: the CONTENT owns its own scroll
          container (`.docs-content`), independent of the list strip. WP4 restores
          `scrollTop` on that element, so it must remain a single stable scrolling box —
          do not move `overflow-y` up to `.docs-panel` or the list will scroll with the
          prose and the restore target will be wrong. */}
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
                onClick={() => {
                  setChosen(entry.rel_path);
                  setLinkNote(null);
                }}
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

      {view === "list" && contentView !== "none" && (
        <div
          className="docs-content"
          data-testid="docs-content"
          ref={contentRef}
          onClick={onContentClick}
        >
          {linkNote !== null && (
            <div className="docs-link-note" data-testid="docs-link-note">
              {linkNote}
            </div>
          )}
          {contentView === "error" && (
            <div className="docs-panel-error" data-testid="docs-content-error">
              Could not read this document: {current?.error}
            </div>
          )}
          {contentView === "content" && (
            <DocMarkdown source={current?.text ?? ""} />
          )}
        </div>
      )}
    </div>
  );
}
