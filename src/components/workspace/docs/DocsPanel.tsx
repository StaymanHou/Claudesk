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

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  docContentView,
  docsView,
  labelFor,
  orderDocs,
  type DocEntry,
} from "../docsOrder";
import {
  appliesToWorkspace,
  FS_CHANGE_EVENT,
  type FsChange,
} from "../../../state/fsChange";
import { DocMarkdown } from "./DocMarkdown";
import { latchNext, shouldFetch, type LatchState } from "./fetchLatch";
import { pickInitialDoc, selectedDoc } from "./pickInitialDoc";
import { decideReload, shouldJump } from "./docsReloadDecision";
import {
  captureScroll,
  planRestore,
  readGeometry,
} from "./docsScrollRestore";
import {
  hasPending,
  NO_PENDING,
  pendingNext,
  type PendingRestore,
} from "./pendingRestore";
import {
  makeDocLinkClickHandler,
  type DocLinkClickEvent,
} from "./handleDocLinkClick";

interface DocsPanelProps {
  /** The workspace's project root — the discovery scope, authenticated backend-side. */
  projectPath: string;
  /** Whether this host is the center-staged workspace (gates the initial fetch). */
  visible: boolean;
  /**
   * The owning workspace's id — WP4 needs it to filter the broadcast `fs-change` channel
   * down to this workspace's own events (`appliesToWorkspace`). The watcher emits one event
   * stream for all workspaces, so every consumer filters by its own id.
   */
  workspaceId: string;
  /**
   * Whether the Docs slot is the FRONTED panel. Distinct from `visible` (which is about the
   * workspace being center-staged): both must hold for `.docs-content` to have layout, since
   * `RightPanelHost` display-none's the non-front slot.
   *
   * ⚠️ WP4 uses this as the retry trigger for a DEFERRED scroll restore, not as a render gate:
   * a zero-height box silently ignores a `scrollTop` write, so an offset that cannot be applied
   * is HELD and re-applied when this flips true.
   *
   * ⚠️ CORRECTED at WP5: this used to say the motivating case is "a reload that lands while the
   * panel is hidden." It is NOT — the reload is *skipped* while hidden (see the `!visibleRef`
   * gate in the `fs-change` handler) and replayed by the catch-up effect after re-fronting, when
   * the box is measurable, so that path takes the `"applied"` arm. The deferred arm is reached by
   * a RACE: a reload that starts while front, then a panel switch during the
   * `docs_list`→`docs_read` round trip. The old wording caused a WP5 experiment to be designed
   * against the wrong path — see
   * `SURFACE-2026-08-02-BROWSER-SUPPLIES-THE-ANSWER-SO-SCROLL-RESTORE-CHECKS-ARE-VACUOUS`.
   */
  panelFront: boolean;
}

export function DocsPanel({
  projectPath,
  visible,
  workspaceId,
  panelFront,
}: DocsPanelProps) {
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

  // WP4 — where a JUMP parked the selection. Deliberately NOT `chosen`.
  //
  // ⚠️ This split exists because collapsing the two was a shipped CRITICAL (code review of
  // `480052e`): the jump arm wrote its own answer into `chosen`, and since `shouldJump` is
  // `chosen === null`, the FIRST jump permanently disabled every later one — the headline
  // behavior self-disabled after one firing. It was the exact move `docsReloadDecision.ts`
  // forbids for `"refallback"` ("would forge a fake user choice and suppress the next
  // legitimate jump-on-appear"), made one arm earlier.
  //
  // The distinction is intent, and it is the whole reason `chosen` is documented as "the
  // USER's explicit pick" above:
  //   `chosen`   — the user picked this. Sacred; a jump may never override it.
  //   `jumpedTo` — the machine picked this. Overridable by the next jump, and cleared the
  //                moment the user picks anything.
  // A jump landing on a doc must therefore leave `chosen` null, or the panel stops
  // re-orienting — which is the one job it has.
  const [jumpedTo, setJumpedTo] = useState<string | null>(null);

  // WP5 P3.2 — the LATCHED auto-resolution ("pin once resolved", operator decision).
  //
  // ⚠️ Without this, the bottom tier of `selectedDoc` recomputes `pickInitialDoc(docs)` every
  // render, and since `docs` is refreshed with fresh mtimes on every `fs-change`, editing a
  // file the reader is NOT looking at moved the selection. Measured live (WP5 P3.1): reading
  // `older-feature.md` at scrollTop 600, a touch of the sibling `newer-feature.md` swapped the
  // rendered doc and dropped the reader at scrollTop 0 — with NO reload arm running, so
  // nothing captured or restored the position.
  //
  // The rule this enforces: **only an appear/disappear may move an auto-selection.** Released
  // by the jump and refallback arms plus `chooseDoc`, which is exactly where re-ranking IS the
  // intent.
  //
  // ⚠️ WHERE this is written matters, and two earlier drafts were both rejected by lint —
  // worth recording, because the third shape is the only one that is actually correct:
  //   1. a `useEffect` calling `setSettled` → `set-state-in-effect` ("Calling setState
  //      synchronously within an effect can trigger cascading renders"), the same
  //      reach-for-a-state-updater mistake WP2 and WP3 each paid for;
  //   2. a `useRef` read+written during render → `Cannot access refs during render` (5 errors).
  //   3. ✅ state, written where the auto-resolution first becomes POSSIBLE — the `docs_list`
  //      response handler. That is a callback, not render and not an effect body, so there is
  //      no cascading render and no render-phase ref access. It is also the honest place: the
  //      latch is a fact about "the answer when the list arrived".
  const [settled, setSettled] = useState<string | null>(null);

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
  // ⚠️ The has-fetched latch is an EXPLICIT ref, never derived from `docs !== null` — deriving
  // it makes the effect's re-run depend on its own write, and WP4's live reload would re-arm it
  // and loop against a persistently failing `docs_list`
  // (SURFACE-2026-08-01-QUALITY-WP2-DOCSPANEL-FETCH-LATCH-ENTANGLED-WITH-DATA). A ref, not
  // state: flipping it must not schedule a render.
  //
  // ⚠️ The latch MUST be released by the cleanup — load-bearing, not tidiness. Set-before-await
  // and never-released deadlocks under StrictMode's mount → unmount → remount and renders a
  // permanently blank panel while every automated gate stays green. The transition table and the
  // full account live in `fetchLatch.ts`, which owns this machine as a pure function so the
  // sequence is asserted as a VALUE (`fetchLatch.test.ts`) rather than trusted inside a hook.
  //
  // The ref is deliberately never reset on a `projectPath` change: `CenterStage` keys each
  // `Workspace` by `ws.id`, so one mounted host is one project for its whole lifetime. The dep
  // stays as documentation of the real input.
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
        // WP5 P3.2 — LATCH the auto-resolution here, where it first becomes possible.
        // `pickInitialDoc` is pure, so this is the same answer the render would derive; fixing
        // it now is what stops later mtime churn from moving it. Nothing higher can be set yet
        // on this path (a user cannot have picked before the list existed), so no guard is
        // needed — but `selectedDoc`'s precedence would ignore it anyway if one were.
        setSettled(pickInitialDoc(entries));
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
  const selected = selectedDoc(chosen, docs, jumpedTo, settled);

  // WP4 — a "re-read the SAME path" signal. Bumped when `fs-change` reports the selected
  // doc's bytes changed.
  //
  // ⚠️ FORBIDDEN SHAPE: do NOT clear `loaded` (`setLoaded(null)`) to "re-trigger" the fetch.
  // It does not re-trigger — the effect below keys on `selected`, which by definition has NOT
  // changed on a content edit — and it leaves the panel permanently contentless. A nonce in the
  // dep array is the honest expression of "read it again". (Shipped broken once; every
  // automated gate was green. See the archived WP4 WIP for the incident.)
  const [reloadNonce, setReloadNonce] = useState(0);

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
    // `reloadNonce` is a deliberate re-run trigger, not a value the body reads.
  }, [selected, projectPath, reloadNonce]);

  // Current-for-this-selection, or nothing. This is the derivation described above.
  const current = loaded !== null && loaded.path === selected ? loaded : null;

  // ── WP4 — live reload on `fs-change` ──────────────────────────────────────────
  //
  // Three responses, decided by `decideReload` (a pure diff of the re-listed doc set):
  //   content changed → re-read + re-render IN PLACE, scroll preserved, selection untouched
  //   a doc appeared  → re-rank and jump (unless the user has an explicit pick)
  //   a doc vanished  → fall back to the ranking, CLEARING the explicit pick
  //
  // ⚠️ The decision comes from diffing the LIST, never from `FsChange.kind` — that field is
  // documented as "a hint only" and the backend folds a mixed 200ms batch to `Other`, so a
  // delete+create of `.session.md` in one window is indistinguishable from the event itself.
  //
  // Latest-refs, not deps: this listener is registered ONCE per workspace and must read the
  // CURRENT docs/selection at event time without re-subscribing on every keystroke CC makes.
  // The same latest-ref discipline `RightPanelHost` uses for its own `fs-change` consumer.
  //
  // ⚠️ Synced in an EFFECT, not during render. `react-hooks/refs` rejects `ref.current = x`
  // in the render body ("Cannot update ref during render") and the rule is right about the
  // shape: a render-phase write is discarded work under a re-render that React throws away,
  // and StrictMode's double render makes it happen for real. The effect runs after commit,
  // which is also exactly when the values become the ones an event handler should see.
  const docsRef = useRef<DocEntry[] | null>(null);
  const selectedRef = useRef<string | null>(null);
  const chosenRef = useRef<string | null>(null);
  // Whether the panel is currently WORTH doing work for: the workspace is center-staged AND
  // the Docs slot is the fronted panel. Read inside the listener (see the skip below).
  const visibleRef = useRef(false);
  // Set when an `fs-change` arrived while invisible and was skipped. Consumed by the catch-up
  // effect, which re-lists once the panel is worth working for again.
  const staleRef = useRef(false);
  useEffect(() => {
    docsRef.current = docs;
    selectedRef.current = selected;
    chosenRef.current = chosen;
    visibleRef.current = visible && panelFront;
  }, [docs, selected, chosen, visible, panelFront]);

  // The offset waiting to be (re-)applied, as a pure state machine (`pendingRestore.ts`)
  // rather than an ad-hoc ref pair.
  //
  // ⚠️ A ref, not state: holding an offset must NOT schedule a render (the write is a DOM
  // side effect, not rendered output), and the retry effect reads it synchronously after the
  // content swap. Modelled as a machine because "held across a failed apply" is exactly the
  // property a hook gets wrong silently — see the module header for the predecessor bug.
  const pendingRef = useRef<PendingRestore>(NO_PENDING);

  // Re-apply a held offset once the box is measurable again. Runs after every content commit,
  // and — via `panelFront`/`visible` — when the panel is re-fronted or the workspace
  // re-focused, which is what closes the hidden-reload case.
  useEffect(() => {
    if (!hasPending(pendingRef.current)) return;
    const el = contentRef.current;
    const plan = planRestore(readGeometry(el), pendingRef.current.offset);
    if (plan.apply && el !== null) {
      el.scrollTop = plan.scrollTop;
      pendingRef.current = pendingNext(pendingRef.current, { type: "applied" });
    } else {
      // Still unmeasurable — the offset STAYS held for the next opportunity. Dropping it
      // here is the "came back to the top" bug.
      pendingRef.current = pendingNext(pendingRef.current, { type: "deferred" });
    }
  }, [current, panelFront, visible]);

  // Re-list the docs and apply whatever `decideReload` says. Shared by the `fs-change`
  // listener and the catch-up effect below, so a skipped-while-invisible reload and a live one
  // take byte-identical paths — the alternative was duplicating ~50 lines of decision handling
  // and letting the two drift.
  //
  // `isLive()` is passed by the caller rather than captured: the listener needs its own
  // `cancelled` flag (StrictMode teardown), and the effect needs a different one.
  const runReload = useCallback(
    (isLive: () => boolean) => {
      const prev = docsRef.current;
      if (prev === null) return; // list hasn't loaded yet; the initial fetch will win.

      void invoke<DocEntry[]>("docs_list", { root: projectPath })
        .then((next) => {
          if (!isLive()) return;
          const sel = selectedRef.current;
          const decision = decideReload({ prev, next, selected: sel });

          // The list is refreshed on EVERY event regardless of the decision — that is how
          // mtimes advance, so the next diff compares against current data. Never set to
          // `null`: that would re-arm the fetch latch (see the latch comment above).
          setDocs(next);
          setError(null);

          switch (decision.kind) {
            case "none":
              break;
            case "content": {
              // Capture BEFORE the content swap, then let the retry effect above restore it
              // once React has committed the new text.
              const offset = captureScroll(
                readGeometry(contentRef.current),
                pendingRef.current.offset,
              );
              pendingRef.current = pendingNext(pendingRef.current, {
                type: "hold",
                offset,
              });
              // Re-read the same path via the nonce. ⚠️ NOT `setLoaded(null)` — see the
              // nonce's declaration: clearing `loaded` cannot re-trigger an effect keyed on
              // `selected` (unchanged on a content edit) and leaves the panel EMPTY.
              setReloadNonce((n) => n + 1);
              break;
            }
            case "jump":
              // An explicit pick is never overridden by a jump.
              if (shouldJump(chosenRef.current) && decision.selected !== null) {
                pendingRef.current = pendingNext(pendingRef.current, {
                  type: "reset",
                });
                // ⚠️ `setJumpedTo`, NOT `setChosen`. Writing the machine's answer into
                // `chosen` made the jump guard (`chosen === null`) false forever, so the
                // first jump disabled every later one — a shipped CRITICAL. See the
                // `jumpedTo` declaration for the full account.
                setJumpedTo(decision.selected);
                // WP5 P3.2 — release the latch: a jump is a deliberate re-rank, and a stale
                // `settled` would outrank the next fall-back (same argument as `jumpedTo`
                // below). `jumpedTo` outranks `settled` anyway, so this is belt-and-braces
                // for the case where a later `refallback` clears `jumpedTo`.
                setSettled(null);
                setLinkNote(null);
              }
              break;
            case "refallback":
              // ⚠️ CLEAR the sentinel (back to "unchosen"), never re-point it at the
              // fall-back answer — that would forge a fake user choice and suppress the next
              // legitimate jump-on-appear.
              pendingRef.current = pendingNext(pendingRef.current, {
                type: "reset",
              });
              setChosen(decision.chosen);
              // ⚠️ `jumpedTo` must be cleared too, for the same reason and by the same
              // argument: if the vanished doc was where a JUMP had parked us, a surviving
              // `jumpedTo` would outrank the fall-back answer (per `selectedDoc`'s
              // precedence) and the panel would keep pointing at a file that no longer
              // exists — the exact stale-render this arm exists to prevent.
              setJumpedTo(null);
              // WP5 P3.2 — RE-LATCH onto the newly-resolved fall-back answer. Do NOT clear to
              // null here.
              //
              // ⚠️ Clearing was the shipped bug (caught at this phase's verify-self): unlike
              // `"jump"`, which releases the latch and immediately writes `jumpedTo`, this arm
              // writes NOTHING — so a `null` latch drops the panel onto the live-compute tier
              // and leaves it there PERMANENTLY. The next sibling-mtime edit then moves the
              // selection again, reproducing the very defect this tier exists to fix. And the
              // trigger is the most routine event in this workflow: `/session-restore` deletes
              // `.session.md` on every restore (see `docsReloadDecision.ts` — "the routine
              // case, not an edge case").
              //
              // `decision.selected` is `pickInitialDoc(next)` — the fall-back answer computed
              // from the doc set WITHOUT the vanished file — so latching it cannot point at a
              // deleted doc, which is what the old comment here was worried about. Note this is
              // NOT the forbidden "forge a fake user choice": `chosen` stays null (cleared
              // above), so a later jump-on-appear still fires. Only the auto-resolution is
              // pinned, which is exactly "pin once resolved" applied to the new answer.
              setSettled(decision.selected);
              setLinkNote(null);
              break;
          }
        })
        .catch(() => {
          // A failed refresh leaves the current list in place rather than blanking the
          // panel — the reader keeps what they had, and the next event retries.
        });
    },
    [projectPath],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    // The `cancelled` guard is the StrictMode async-listen lesson: the cleanup can run before
    // `listen()` resolves, and without it the first subscription's unlisten is never captured
    // → a double listener.
    void listen<FsChange>(FS_CHANGE_EVENT, (event) => {
      if (!appliesToWorkspace(event.payload, workspaceId)) return;
      const { paths } = event.payload;
      // A git-meta-only event (no worktree paths) cannot have changed a doc.
      if (paths.length === 0) return;

      // ⚠️ Do NO work while the panel cannot be seen — record that it went stale instead.
      //
      // Added at the WP4 code-review refactor (MAJOR): the reload previously ran whenever the
      // workflow gate was on, independent of whether the Docs tab was ever opened. Since the
      // slot is mounted unconditionally under the gate, that meant a `docs_list` per 200ms
      // debounce window plus a full `docs_read` per content change — per workspace — feeding a
      // panel with `clientHeight: 0`. During the CC-churn scenario this feature targets, with
      // several workspaces open, that is a steady stream of invisible IPC.
      //
      // Skipping is only safe because the staleness is REMEMBERED: the catch-up effect below
      // re-lists once the panel is visible again, so re-fronting shows current content.
      // Without that flag this would trade cost for a stale panel — the bug WP4 exists to fix.
      if (!visibleRef.current) {
        staleRef.current = true;
        return;
      }

      runReload(() => !cancelled);
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [workspaceId, runReload]);

  // Catch-up: the panel just became visible after skipping at least one `fs-change`. Re-list
  // once and clear the flag, so what the reader sees on re-front is current.
  //
  // ⚠️ The flag is cleared BEFORE the async work, not after: leaving it set across the await
  // would let a second visibility flip start a duplicate reload, and clearing it in the
  // `.then` would strand it set forever if the effect were torn down mid-flight (the
  // unreleased-latch shape that produced this component's blank-panel bug — see `fetchLatch`).
  useEffect(() => {
    if (!(visible && panelFront)) return;
    if (!staleRef.current) return;
    staleRef.current = false;
    let cancelled = false;
    runReload(() => !cancelled);
    return () => {
      cancelled = true;
    };
  }, [visible, panelFront, runReload]);

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
  // The handler lives in its own module so tests can drive THE REAL CODE with real DOM
  // events rather than a re-implementation. Two prior guards for its central invariant
  // ("no doc-content click ever performs its default action") were source-text proxies and
  // both passed while the invariant was broken — see `handleDocLinkClick.ts`'s header.
  //
  // ⚠️ The ref is read INSIDE the callback, at click time — never passed to a function
  // during render. `react-hooks/refs` rejects the latter (it cannot see that the handler
  // defers the read), and the rule is right about the shape even though the getter was
  // safe: keeping ref access inside the event handler is what the rule is protecting.
  // THE single entry point for a USER-driven selection change — the row click and the
  // in-doc link handler both go through it, and nothing else may call `setChosen`.
  //
  // ⚠️ It exists because the two paths previously called `setChosen` directly and NEITHER
  // dispatched `"reset"` (code review of `480052e`, MAJOR). `pendingRestore.ts` defines that
  // event precisely for "the selection changed to a different document" and
  // `pendingRestore.test.ts` asserts it — but no caller sent it, so a scroll offset held for
  // doc A could be applied to freshly-opened doc B. It only looked harmless because
  // `planRestore` happened to clamp against a momentarily-empty container: correctness
  // resting on an incidental clamp rather than on the transition built for it.
  //
  // THREE things every user pick must do, which is why this is one function and not two call
  // sites: drop any pending offset (it belongs to the doc being left), clear `jumpedTo`
  // (a user pick supersedes wherever the machine had parked us), and release the WP5 `settled`
  // latch (`chosen` outranks it anyway, but leaving it set would resurrect a stale
  // auto-selection the moment a `refallback` clears `chosen`).
  const chooseDoc = useCallback((relPath: string) => {
    pendingRef.current = pendingNext(pendingRef.current, { type: "reset" });
    setJumpedTo(null);
    setSettled(null);
    setChosen(relPath);
    setLinkNote(null);
  }, []);

  const onContentClick = useCallback(
    (e: DocLinkClickEvent) =>
      makeDocLinkClickHandler({
        selected,
        docs,
        containerRef: contentRef,
        setLinkNote,
        setChosen: chooseDoc,
      })(e),
    [selected, docs, chooseDoc],
  );

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
                onClick={() => chooseDoc(entry.rel_path)}
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
