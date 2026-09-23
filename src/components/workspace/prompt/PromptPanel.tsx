// F-a WP3 — the Prompt panel: a CM6 prose buffer for composing a message before it reaches
// Claude Code, persisted per project.
//
// SCOPE: the view, draft persistence (WP3) and SENDING (WP4 Phase 2).
//
// ⚠️ WP3's header said "SENDING is WP4 — nothing here imports `injectCommand`", and a guard in
// `promptDraftSync.test.ts` enforced that. WP4 Phase 2 OPENED that seam deliberately, and the
// guard was INVERTED in the same change rather than deleted — it now asserts the send path is
// present AND that there is exactly ONE `injectCommand` call site here. Deleting it would have
// traded a real invariant for nothing.
//
// ⚠️ THE SEND HAS ONE IMPLEMENTATION AND FOUR TRIGGERS (two buttons, two hotkeys). All four
// route through `send(mode)`, whose only decision-making lives in `sendStagedDraft.planSend`.
// The keyboard triggers arrive from `RightPanelHost` via `onRegisterSend` because the HOST owns
// the capture-phase keydown router while the PANEL owns the buffer.
//
// ⚠️ The extension set is built by a SIBLING module, not inherited from the editor's —
// see `promptExtensions.ts` for why a second builder exists rather than a reuse.
//
// ⚠️ EVERY WRITE GOES THROUGH `runPlan`, WHICH IS THE ONLY CALLER OF `saveDraft`. The write
// DECISIONS live in `promptDraftSync.ts` as pure functions; this component only executes
// the plans they return. Adding a new "also save when…" moment means adding an input to
// that module, NOT a second `saveDraft` call here — see its header for why (M11 WP4 shipped
// a CRITICAL from exactly that shape: a guarded state machine with unguarded callers).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { editorDarkTheme } from "../editor/theme";
import { promptExtensions } from "./promptExtensions";
import { loadPromptFontSize, savePromptFontSize } from "./promptFontZoom";
import { clearDraft, loadDraft, saveDraft } from "../draftStore";
import { appendToHistory, loadHistory } from "../draftHistory";
import { planRecover, discardConfirmSpec } from "./promptRecover";
import { ConfirmModal } from "../editor/ConfirmModal";
import { injectCommand } from "../autoResumeFire";
import { planSend, type SendMode } from "./sendStagedDraft";
import { loadDictatedWrap, saveDictatedWrap } from "./promptDictatedWrap";
import {
  DRAFT_DEBOUNCE_MS,
  planEdit,
  planFlush,
  planPanelChange,
  planProjectSwitch,
  type PendingWrite,
  type WritePlan,
} from "./promptDraftSync";

interface PromptPanelProps {
  /** The workspace's project root — the durable key the draft is stored under. */
  projectPath: string;
  /** Whether this host is the center-staged workspace. */
  visible: boolean;
  /** Whether the Prompt panel is the front panel in its host. */
  panelFront: boolean;
  /**
   * P3.4 — reports whether this project currently has a non-empty draft, so the host can
   * mark the Prompt TAB.
   *
   * ⚠️ Called with what was (or would be) PERSISTED, not with the live buffer's emptiness
   * at render time. The distinction matters because the indicator must be correct for a
   * panel the operator is not looking at: it is answering "is there unsent text in this
   * project?", which is a fact about storage.
   */
  onDraftPresenceChange?: (hasDraft: boolean) => void;
  /**
   * F-a WP4 — the CC session this workspace's prompt is sent to, or `null` when no session is
   * live (the send controls disable).
   *
   * ⚠️ **PASSED AS A LIVE VALUE ON EVERY RENDER, NOT CAPTURED ONCE.** A recycle replaces the
   * session id, and `Workspace.tsx` keeps a `ccSessionIdRef` for exactly this reason — a value
   * captured at mount would address a PTY that no longer exists, and the send would vanish into
   * `injectCommand`'s `.catch` with only a `console.warn` to show for it.
   */
  ccSessionId?: string | null;
  /**
   * F-a WP4 — registers this panel's send handler with the host.
   *
   * ⚠️ THE HOST OWNS THE KEYBOARD, THE PANEL OWNS THE SEND. `RightPanelHost` holds the
   * capture-phase keydown router (and is one of the four files `chordRegistry.test.ts` accepts
   * as a registration host), but only this panel knows the buffer's contents. Rather than lift
   * the draft into the host or duplicate the send there, the panel hands its one send function
   * up and the host calls it on a chord match. ⚠️ The alternative — a second `planSend` call
   * site in the host — is precisely the multi-call-site shape `sendStagedDraft.ts`'s header
   * warns about.
   */
  onRegisterSend?: (send: ((mode: SendMode) => void) | null) => void;
}

export function PromptPanel({
  projectPath,
  visible,
  panelFront,
  onDraftPresenceChange,
  ccSessionId,
  onRegisterSend,
}: PromptPanelProps) {
  // Seeded from the project's persisted draft (P3.1). Lazy initializer so the read happens
  // once at mount rather than on every render.
  const [doc, setDoc] = useState(() => loadDraft(projectPath));

  // F-a WP4 Phase 3 — the sent-draft ring, for the recover affordance.
  //
  // ⚠️ Phase 2 deliberately did NOT hold this in state: nothing read it, and an unread value is
  // a `tsc` error rather than harmless. It becomes legitimate state HERE, where the recover
  // control renders from it.
  const [history, setHistory] = useState<string[]>(() =>
    loadHistory(projectPath),
  );
  // Whether the recover list is expanded. Collapsed by default — the panel's job is composing,
  // and a permanently-open history list would crowd the buffer it exists to protect.
  const [recoverOpen, setRecoverOpen] = useState(false);

  // F-a WP4 — the entry awaiting a discard confirmation, or `null` when no prompt is open.
  //
  // ⚠️ HOLDS THE TEXT, not a boolean. `planRecover` carries the entry on its `confirm` arm
  // precisely so the caller does not re-read the buffer after the dialog closes: the operator
  // could have edited it while the prompt was open, and recovering against a document they were
  // never warned about is the defect this shape prevents.
  const [pendingRecover, setPendingRecover] = useState<string | null>(null);

  // The single pending write. A ref, not state: it must be readable by the unmount cleanup
  // WITHOUT that cleanup depending on it, or the effect would tear down and re-register on
  // every keystroke and never actually reach its own timer.
  const pendingRef = useRef<PendingWrite | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The project this panel is currently showing, so the switch effect can see the PREVIOUS
  // value. `projectPath` alone cannot tell us what we are switching *from*.
  const shownPathRef = useRef(projectPath);

  /** Execute a plan from `promptDraftSync`. ⚠️ THE ONLY PLACE `saveDraft` IS CALLED. */
  // The presence callback, held in a ref so `runPlan` does not have to depend on it (a
  // changing prop identity would otherwise rebuild the funnel on every parent render).
  // ⚠️ Written in an EFFECT, not during render — `react-hooks/refs` rejects the latter,
  // correctly: a ref mutated during render is not a render input and can desync.
  const presenceRef = useRef(onDraftPresenceChange);
  useEffect(() => {
    presenceRef.current = onDraftPresenceChange;
  }, [onDraftPresenceChange]);

  // ⚠️ `runPlan` re-enters itself when a debounce timer fires. A direct self-reference in
  // its own `useCallback` body reads the binding before it is initialised, so the recursion
  // goes through this ref instead — which also keeps the timer callback pointed at the
  // CURRENT funnel rather than capturing the first one forever.
  const runPlanRef = useRef<(plan: WritePlan) => void>(() => {});

  const runPlan = useCallback((plan: WritePlan) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (plan.write) {
      // ⚠️ `plan.write.projectPath`, never the component's current `projectPath` — a flush
      // racing a project switch must land on the project the text was typed in.
      saveDraft(plan.write.projectPath, plan.write.text);
      // P3.4 — reported from HERE, inside the funnel, so the indicator can never disagree
      // with what was actually written. Derived from the same text `saveDraft` just
      // persisted rather than from React state, which may not have re-rendered yet.
      presenceRef.current?.(plan.write.text !== "");
    }
    pendingRef.current = plan.pending;
    if (plan.pending) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        runPlanRef.current(planFlush(pendingRef.current));
      }, DRAFT_DEBOUNCE_MS);
    }
  }, []);

  useEffect(() => {
    runPlanRef.current = runPlan;
  }, [runPlan]);

  const handleChange = useCallback(
    (next: string) => {
      setDoc(next);
      runPlan(planEdit(projectPath, next));
    },
    [projectPath, runPlan],
  );

  // P3.3 — project switch. Flush the OUTGOING project at its own path, then seed the
  // incoming one from storage. `planProjectSwitch` no-ops when the path did not really
  // change, so a re-render never costs a flush.
  useEffect(() => {
    const from = shownPathRef.current;
    if (from === projectPath) return;
    runPlan(planProjectSwitch(pendingRef.current, from, projectPath));
    shownPathRef.current = projectPath;
    const seeded = loadDraft(projectPath);
    setDoc(seeded);
    presenceRef.current?.(seeded !== "");
    // ⚠️ The RING is per-project too. Without this the recover list would offer project A's sent
    // drafts while the operator is looking at project B — and recovering one would paste the
    // wrong project's text into this buffer.
    setHistory(loadHistory(projectPath));
    setRecoverOpen(false);
  }, [projectPath, runPlan]);

  // Report the SEEDED presence once at mount. Without this the indicator would stay dark
  // for a project that already has a stored draft until the operator typed — i.e. it would
  // be wrong in exactly the case it exists for (returning to unsent work).
  useEffect(() => {
    // Reads the already-seeded `doc` rather than hitting storage a second time — the lazy
    // initializer above did that read once, which is the ground it was chosen on.
    presenceRef.current?.(doc !== "");
    // Mount-only: the switch effect above owns every later project change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush when the operator tabs AWAY from the Prompt panel.
  //
  // ⚠️ This closes a real window, and it was MISSING until code review caught it: panels
  // stay mounted (CLAUDE.md), so leaving the tab neither unmounts the panel nor cancels the
  // debounce timer — but an operator who tabs to Editor and quits inside the 400ms window
  // loses that text. `planPanelChange` existed and was tested from the start; nothing
  // called it, so the module documented a guarantee the panel never actually provided.
  //
  // `panelFront` is the panel's view of the host's selection, so "no longer front" is the
  // signal available here. The plan is computed by the same machine as every other write.
  const wasFrontRef = useRef(panelFront);
  useEffect(() => {
    const wasFront = wasFrontRef.current;
    wasFrontRef.current = panelFront;
    // Only the front → not-front EDGE is a flush point. Firing on every render while
    // backgrounded would defeat the debounce for a panel nobody is even looking at.
    if (wasFront && !panelFront) {
      runPlanRef.current(planPanelChange(pendingRef.current, panelFront));
    }
  }, [panelFront]);

  // Flush whatever is pending when the panel goes away, so the window between the last
  // keystroke and the debounce timer is not a hole.
  useEffect(() => {
    return () => {
      runPlanRef.current(planFlush(pendingRef.current));
    };
  }, []);

  // ── F-a WP4: the send path ────────────────────────────────────────────────────────────────
  //
  // ⚠️ ONE SEND FUNCTION, AND BOTH ENTRY POINTS GO THROUGH IT. The two buttons and the two
  // hotkeys are FOUR triggers for two modes; giving any of them its own `planSend` call would
  // be the multi-call-site shape that shipped a CRITICAL in M11 WP4 twice. The mode is the only
  // thing that varies, so it is the only parameter.

  // Latest-refs so `send` can stay `useCallback`-stable while still reading current values. A
  // `send` that changed identity on every keystroke would re-register with the host constantly
  // (and the host's keydown listener is registered once, so it would capture a stale one).
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  const projectPathRef = useRef(projectPath);
  useEffect(() => {
    projectPathRef.current = projectPath;
  }, [projectPath]);
  const ccSessionIdRef = useRef(ccSessionId);
  useEffect(() => {
    ccSessionIdRef.current = ccSessionId;
  }, [ccSessionId]);

  // Paydown WP10 — the "mark as dictated" toggle. Seeded from storage (lazy, read once) and read
  // by `send` THROUGH A REF, for the same stable-identity reason as the refs above.
  const [dictated, setDictated] = useState(() => loadDictatedWrap());
  const dictatedRef = useRef(dictated);
  useEffect(() => {
    dictatedRef.current = dictated;
  }, [dictated]);

  const send = useCallback(
    (mode: SendMode) => {
      const body = docRef.current;
      const path = projectPathRef.current;

      // ⚠️ The blank check lives in `planSend`, not here — see its header. A blank body returns
      // null and nothing happens: no inject, no clear, no archive.
      const plan = planSend(body, mode, { dictated: dictatedRef.current });
      if (!plan) return;

      // ⚠️ Read the session id THROUGH THE REF, at send time. A recycle swaps it, and a value
      // closed over at mount would address a dead PTY.
      const sessionId = ccSessionIdRef.current;
      if (!sessionId) return;

      // ⚠️ THE ONE CALL TO `injectCommand` IN THIS COMPONENT — the single injection funnel, with
      // the staging label and the staged payload builder. NOT `invoke("cc_input", …)`: opening a
      // second path is forbidden by F-a decision 2.
      void injectCommand(
        sessionId,
        plan.command,
        undefined,
        plan.label,
        plan.buildPayload,
      );

      // ⚠️ ARCHIVE BEFORE CLEAR, and the order is load-bearing rather than stylistic.
      // `appendToHistory` refuses a blank entry, so clearing first would hand it an empty string
      // and silently archive NOTHING — destroying the only copy of text that has just left the
      // panel.
      //
      // ⚠️ Phase 3: the return value is now CONSUMED. `appendToHistory` returns the new ring, so
      // the recover list updates without a re-read — which also means the just-sent text is
      // recoverable immediately, not only after a remount. (Phase 2 discarded it because nothing
      // rendered it yet.)
      setHistory(appendToHistory(path, body));

      // ⚠️ Clear through the SAME funnel every other write uses. `runPlan(planEdit(path, ""))`
      // would merely schedule a debounced write; the draft must be gone NOW because the text is
      // already on its way to the PTY. So the store is cleared directly and the pending timer is
      // cancelled by running an empty flush through the funnel — which also reports presence.
      clearDraft(path);
      setDoc("");
      pendingRef.current = null;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      presenceRef.current?.(false);
    },
    // Every value read inside comes from a ref, so this is genuinely stable.
    [],
  );

  /**
   * Put a recovered entry in the buffer. ⚠️ OVERWRITES unconditionally — whether a confirmation
   * was owed first is `planRecover`'s decision, not this function's.
   *
   * Writes through `runPlan`/`planEdit`, never `saveDraft` directly — see this file's header for
   * the funnel rule.
   */
  const applyRecover = useCallback(
    (text: string) => {
      setDoc(text);
      runPlan(planEdit(projectPathRef.current, text));
      // Collapse after recovering: the operator's attention belongs back in the buffer, and a
      // list left open over the text they just restored is in the way.
      setRecoverOpen(false);
      setPendingRecover(null);
    },
    [runPlan],
  );

  const recover = useCallback(
    (entry: string) => {
      // ⚠️ The DECISION lives in `planRecover`, not here — so "does this destroy unsent work?"
      // is testable without a render. `replace` means there was nothing to lose.
      const action = planRecover(docRef.current, entry);
      if (action.kind === "replace") {
        applyRecover(action.text);
        return;
      }
      // `confirm` — hold the entry and let the dialog decide. ⚠️ The buffer is NOT touched here;
      // Cancel must leave it exactly as it was.
      setPendingRecover(action.text);
    },
    [applyRecover],
  );

  // ⚠️ Hand the send up to the host, which owns the keydown router. Unregister on unmount so a
  // torn-down panel's send can never be invoked (it would write into a stale project's ring).
  useEffect(() => {
    onRegisterSend?.(send);
    return () => onRegisterSend?.(null);
  }, [onRegisterSend, send]);

  // Seeded from storage so the view mounts at the persisted zoom rather than flashing the
  // default. Lazy initializer — a localStorage read per render would be wasteful and
  // `loadPromptFontSize` is only meaningful once.
  const [fontSize, setFontSize] = useState(() => loadPromptFontSize());

  const handleFontSizeChange = useCallback((px: number) => {
    setFontSize(px);
    savePromptFontSize(px);
  }, []);

  // ⚠️ Memoized on its REAL dependencies. `@uiw/react-codemirror` treats a new array
  // identity as a full CM6 reconfigure, so rebuilding this every render would tear down
  // and reapply the whole extension set on every keystroke.
  const extensions = useMemo(
    () =>
      promptExtensions({
        fontSize,
        onFontSizeChange: handleFontSizeChange,
      }),
    [fontSize, handleFontSizeChange],
  );

  return (
    <div className="prompt-panel" data-testid="prompt-panel">
      <CodeMirror
        value={doc}
        onChange={handleChange}
        // ⚠️ THE DARK THEME GOES IN THE `theme` PROP, NOT IN `extensions` — found at
        // Phase 2 verify-self, where the panel rendered with a WHITE background.
        // `@uiw/react-codemirror` defaults this prop to `"light"` when it is omitted and
        // wraps the view in `.cm-theme-light`, whose rules beat an equivalent theme passed
        // through `extensions`. The tell was the wrapper class: `cm-theme-light` here vs.
        // the editor's plain `cm-theme`. Claudesk is dark-only (CLAUDE.md), so a light
        // editor is a real defect, not a preference.
        theme={editorDarkTheme}
        extensions={extensions}
        // ⚠️ `basicSetup={false}` IS THE WHOLE POINT (F-a decision 5). Leaving it at its
        // default would bring line numbers, the fold gutter, bracket matching,
        // autocompletion and the code keymap back in as a bundle — the exact set this
        // surface excludes. Every extension this view wants is composed explicitly in
        // `promptExtensions`.
        basicSetup={false}
        // Autofocus only when this panel is actually the one in front of the operator, so
        // a background workspace never steals the caret.
        autoFocus={visible && panelFront}
        data-testid="prompt-editor"
      />
      {/* F-a WP4 Phase 3 — recover a sent draft. ⚠️ MINIMAL BY MANDATE (WBS task 4.4: "the ring
          is the load-bearing part; a richer browser is additive later"). Show the ring, pick one,
          restore it. No search, no preview pane, no pinning, no delete. */}
      {history.length > 0 && (
        <div className="prompt-recover">
          <button
            type="button"
            className="prompt-recover-toggle"
            onClick={() => setRecoverOpen((v) => !v)}
            aria-expanded={recoverOpen}
            title="Put a previously sent prompt back in the buffer"
            data-testid="prompt-recover-toggle"
          >
            {recoverOpen ? "▾" : "▸"} Recent ({history.length})
          </button>
          {recoverOpen && (
            <ul
              className="prompt-recover-list"
              data-testid="prompt-recover-list"
            >
              {history.map((entry, i) => (
                /* ⚠️ Keyed on CONTENT, not index: the ring is PREPENDED to, so an
                   index-bearing key re-keys every row on each send. Duplicate entries are
                   possible (consecutive duplicates are deliberately not collapsed — see
                   draftHistory.ts), so the index is the tiebreak, appended AFTER the content
                   so it does not dominate. */
                <li key={`${entry.slice(0, 64)}::${i}`}>
                  <button
                    type="button"
                    className="prompt-recover-item"
                    onClick={() => recover(entry)}
                    /* ⚠️ The FULL entry in the tooltip — the visible label is truncated by CSS,
                       and a dictated passage is exactly the case where the first line does not
                       identify it. */
                    title={entry}
                    data-testid={`prompt-recover-item-${i}`}
                  >
                    {/* Newlines collapsed to spaces so a multi-line entry stays one row. */}
                    {entry.replace(/\s+/g, " ").trim()}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {/* F-a WP4 — the discard confirmation (operator ruling 2026-09-22). ⚠️ Reuses the editor's
          `ConfirmModal` rather than adding a second confirm surface: it already handles focus,
          Esc and backdrop-click, and `escValue: "cancel"` makes BOTH of those resolve to the
          safe arm. ⚠️ "Discard" carries `variant: "danger"` and Cancel is `primary`, so the
          focused default is the NON-destructive choice — Enter must not destroy the buffer. */}
      {pendingRecover !== null && (
        <ConfirmModal
          spec={discardConfirmSpec()}
          onChoose={(value) => {
            if (value === "discard") {
              applyRecover(pendingRecover);
              return;
            }
            // ⚠️ Cancel leaves the buffer UNTOUCHED — only the pending entry is dropped.
            setPendingRecover(null);
          }}
        />
      )}
      <div className="prompt-actions">
        {/* Paydown WP10 — wraps the SENT text in the dictated notes; the draft and the recover
            history keep the raw body, so the wrap is applied once, at send time. */}
        <label
          className="prompt-dictated"
          title="Wrap the sent text in notes telling Claude it was dictated and may contain speech-recognition errors"
        >
          <input
            type="checkbox"
            checked={dictated}
            onChange={(e) => {
              setDictated(e.target.checked);
              saveDictatedWrap(e.target.checked);
            }}
            data-testid="prompt-dictated-toggle"
          />
          Dictated
        </label>
        {/* ⚠️ DISABLED WHEN THERE IS NOTHING TO SEND — `planSend` would return null and the
            click would be a silent no-op, which reads as a broken button. The predicate
            mirrors `planSend`'s own blank rule (trim), so the two cannot disagree about what
            "empty" means. Also disabled with no live CC session: `injectCommand` would warn
            into the console and the operator would see nothing at all. */}
        <button
          type="button"
          className="prompt-send prompt-send--stage"
          onClick={() => send("stage-only")}
          disabled={doc.trim() === "" || !ccSessionId}
          title="Put this text in Claude Code's prompt without submitting it (⇧⌘↵)"
          data-testid="prompt-send-stage"
        >
          Stage
        </button>
        <button
          type="button"
          className="prompt-send prompt-send--submit"
          onClick={() => send("auto-submit")}
          disabled={doc.trim() === "" || !ccSessionId}
          title="Send this text to Claude Code and submit it (⌘↵)"
          data-testid="prompt-send-submit"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default PromptPanel;
