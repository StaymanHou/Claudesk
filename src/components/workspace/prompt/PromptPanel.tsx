// F-a WP3 — the Prompt panel: a CM6 prose buffer for composing a message before it reaches
// Claude Code, persisted per project.
//
// SCOPE as of Phase 3: the view + draft persistence. SENDING is WP4 — nothing here imports
// `stagedPayload`, `injectCommand`, `appendToHistory` or `cc_input`, and a guard asserts
// that (P3.6). Wiring a send seam nothing consumes is the discipline `DocsPanel` follows.
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
import { loadDraft, saveDraft } from "../draftStore";
import {
  DRAFT_DEBOUNCE_MS,
  planEdit,
  planFlush,
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
}

export function PromptPanel({
  projectPath,
  visible,
  panelFront,
  onDraftPresenceChange,
}: PromptPanelProps) {
  // Seeded from the project's persisted draft (P3.1). Lazy initializer so the read happens
  // once at mount rather than on every render.
  const [doc, setDoc] = useState(() => loadDraft(projectPath));

  // The single pending write. A ref, not state: it must be readable by the unmount cleanup
  // WITHOUT that cleanup depending on it, or the effect would tear down and re-register on
  // every keystroke and never actually reach its own timer.
  const pendingRef = useRef<PendingWrite | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The project this panel is currently showing, so the switch effect can see the PREVIOUS
  // value. `projectPath` alone cannot tell us what we are switching *from*.
  const shownPathRef = useRef(projectPath);

  /**
   * Execute a plan from `promptDraftSync`. ⚠️ THE ONLY PLACE `saveDraft` IS CALLED.
   * Guarding this one function is what makes the machine's guarantees real for every
   * caller, rather than only for the machine.
   */
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
  }, [projectPath, runPlan]);

  // Report the SEEDED presence once at mount. Without this the indicator would stay dark
  // for a project that already has a stored draft until the operator typed — i.e. it would
  // be wrong in exactly the case it exists for (returning to unsent work).
  useEffect(() => {
    presenceRef.current?.(loadDraft(projectPath) !== "");
    // Mount-only: the switch effect above owns every later project change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush whatever is pending when the panel goes away, so the window between the last
  // keystroke and the debounce timer is not a hole.
  //
  // ⚠️ Goes through `runPlan(planFlush(...))` like every other write — NOT a direct
  // `saveDraft` call. A first draft of this cleanup called `saveDraft` inline, which is
  // precisely the second-caller shape this module's funnel exists to prevent: the machine
  // would have stayed fully guarded while one of its three write moments bypassed it.
  useEffect(() => {
    return () => {
      runPlanRef.current(planFlush(pendingRef.current));
    };
  }, []);

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
    </div>
  );
}

export default PromptPanel;
