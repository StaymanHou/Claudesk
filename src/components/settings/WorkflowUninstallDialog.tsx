// M10.9 WP3.5b task P3.3 — the three-intent uninstall dialog.
//
// ## Two entry points, one dialog (operator decision, verify-human 2026-07-31)
// This opens EITHER from the substrate row's `[Uninstall & disable…]` button — the visible pair
// of `[Install…]` — OR from turning `workflow_features_enabled` off while the substrate is
// `managed`. The caller passes `trigger` so the dialog knows which, because `[Cancel]` means
// "undo what brought me here" and that differs: from the toggle it must leave the gate ON
// (structurally — the setting is never written while this is open), from the button there was
// nothing to undo. `[Keep it installed]` is offered on the toggle path only; arriving via a
// button labelled "Uninstall & disable", disable-without-removing is an intent the user never
// expressed.
//
// An earlier version of this header argued the opposite — that the toggle should be the sole
// trigger and "a standalone button would need different semantics (cancel what?), so there
// deliberately is none". That reasoning is retained here only because it names the real
// question; the answer turned out to be "pass the trigger", not "ship one entry point". The
// design error it produced (a button on the install side, a sentence on the uninstall side) is
// what design prior `paired-actions-need-paired-affordances` now guards against.
//
// ## What this component does NOT decide
// Whether the record was deleted, whether a retry is available, what the removal means — all
// of it arrives in the `workflow-uninstall-finished` payload from Rust's pure
// `terminal::resolve_uninstall_terminal_state`. Re-deriving any of it here would create a
// second implementation of the terminal-state table that could silently disagree with the
// tested one. Same discipline as the install wizard.
//
// ## The preview is the script's own output
// `[Uninstall]` is never offered before the `--dry-run` result is in hand. Preview and action
// then come from the same script and cannot drift — the operator's decision, and the reason
// Claudesk composes no removal list of its own.

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTauriListen } from "../../useTauriListen";
import {
  CANCEL_BUTTON,
  CANCEL_HINT_BUTTON,
  CANCEL_HINT_TOGGLE,
  KEEP_BUTTON,
  KEEP_HINT,
  UNINSTALL_BUTTON,
  UNINSTALL_CANCELLING_HINT,
  UNINSTALL_CANCELLING_LABEL,
  UNINSTALL_DONE_TITLE,
  UNINSTALL_EFFECTS,
  UNINSTALL_FAILED_TITLE,
  UNINSTALL_INTRO,
  UNINSTALL_NOT_REMOVED,
  UNINSTALL_PREVIEW_HINT,
  UNINSTALL_PREVIEW_LABEL,
  UNINSTALL_PREVIEW_LOADING,
  UNINSTALL_RETRY_HINT,
  UNINSTALL_RUNNING_LABEL,
  UNINSTALL_STALE_RECORD_HINT,
  UNINSTALL_TITLE,
} from "./workflowUninstallCopy";
import {
  cancelMentionsGate,
  offersKeepIntent,
  type UninstallIntent,
  type UninstallTrigger,
} from "./uninstallIntercept";

/** Outcome payload from Rust — mirrors `commands::UninstallFinished` field-for-field. */
export interface UninstallFinished {
  ok: boolean;
  record_deleted: boolean;
  removal_complete: boolean;
  retry_available: boolean;
  error: string | null;
}

type Step = "confirm" | "running" | "done";

interface Props {
  /**
   * The user picked an intent. The CALLER owns what each one means for the gate — this
   * component does not touch settings state (`outcomeForIntent` is the shared table).
   *
   * Fired for `keep` and `cancel` when the button is clicked, and for `uninstall` when the
   * run STARTS (not when it ends): the "turn the features off" intent is settled at
   * authorization and must survive a crash or a failed run.
   */
  onIntent: (intent: UninstallIntent) => void;
  /** Called when a real uninstall run ends, so the caller can re-resolve substrate state. */
  onFinished: (result: UninstallFinished) => void;
  /**
   * Dismiss the dialog.
   *
   * Separate from `onIntent` because they answer different questions: the intent decides the
   * gate and the substrate, `onClose` decides whether this box is on screen. `uninstall` fires
   * its intent at run-start and closes much later (after the user reads the outcome), so
   * collapsing the two would tear the dialog down mid-run.
   */
  onClose: () => void;
  /**
   * How this dialog was opened — see {@link UninstallTrigger}.
   *
   * Decides whether `[Keep it installed]` is offered: it is a coherent third answer when the
   * user arrived by unchecking the gate, and incoherent when they arrived by pressing a button
   * labelled *Uninstall & disable* (they never asked to disable-without-removing).
   */
  trigger: UninstallTrigger;
}

export function WorkflowUninstallDialog({
  onIntent,
  onFinished,
  onClose,
  trigger,
}: Props) {
  const [step, setStep] = useState<Step>("confirm");
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [cancelPending, setCancelPending] = useState(false);
  const [result, setResult] = useState<UninstallFinished | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  // Cancel says "nothing changes" either way, but only the toggle path has a pending change to
  // reassure about (the features staying on). See the copy module.
  const cancelHint = cancelMentionsGate(trigger)
    ? CANCEL_HINT_TOGGLE
    : CANCEL_HINT_BUTTON;

  // Fetch the real `--dry-run` output on mount. A refusal surfaces here as a rejection
  // carrying the refuse-guard's own user-facing message — which is the honest thing to show:
  // if the guard would refuse the removal, the user must learn that BEFORE choosing.
  useEffect(() => {
    let cancelled = false;
    invoke<string>("workflow_uninstall_dry_run")
      .then((out) => {
        if (!cancelled) setPreview(out);
      })
      .catch((e: unknown) => {
        if (!cancelled) setPreviewError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useTauriListen<string>("workflow-uninstall-output", (event) => {
    setLines((prev) => [...prev, event.payload]);
  });

  useTauriListen<UninstallFinished>("workflow-uninstall-finished", (event) => {
    const payload = event.payload;
    setResult(payload);
    setStep("done");
    setCancelPending(false);
    // From the listener, never inside a state updater — StrictMode double-invokes updaters,
    // and this fires the caller's gate write + state refresh (the exact double-write defect
    // WP2 shipped and fixed at review).
    onFinished(payload);
  });

  // Follow the tail as output streams. A CALLBACK ref, not `useRef` + an effect: the `done`
  // step renders a DIFFERENT <pre> than `running`, so a single attached ref left the final
  // transcript scrolled to the top — the exact box the operator saw at WP3.5a verify-human.
  const tailRef = useCallback((node: HTMLPreElement | null) => {
    if (node) node.scrollTop = node.scrollHeight;
  }, []);

  /**
   * Reveal the dialog on open — and specifically reveal its BUTTONS.
   *
   * ## Why `block: "nearest"` alone is not enough here (found at operator verify-human)
   * The install wizard fixed its own below-the-fold bug with `scrollIntoView({block:"nearest"})`,
   * and that works *when the element fits in the viewport*. This dialog does not: with the
   * disclosure list plus ~55 lines of real `--dry-run` output it runs ~700px inside a ~600px
   * panel body. For an element TALLER than its scroll container, "nearest" aligns the top edge
   * and stops — which is exactly what the operator hit: the dialog opened, the top was visible,
   * and the entire action row (Cancel / Keep it installed / Uninstall) sat below the fold. From
   * the user's side, clicking the toggle appeared to do nothing at all.
   *
   * So the reveal targets the ACTIONS row, not the dialog root. Scrolling the buttons into view
   * necessarily brings the dialog's lower half with them, and the buttons are the thing the user
   * must reach to make any progress. If the whole dialog happens to fit, this is equivalent to
   * revealing the dialog itself.
   *
   * The ref lands on the actions row and is re-attached per step, so the running and done steps
   * (whose buttons sit at different heights) each get the same treatment.
   *
   * ## Why a ref alone is NOT sufficient — the second half of the same bug
   * A callback ref fires when the node MOUNTS. The confirm step's actions row mounts
   * immediately, but the `--dry-run` preview arrives asynchronously and inserts ~100px of
   * output ABOVE those buttons — pushing them back below the fold long after the ref has run.
   * Measured live: the reveal fired, then the panel sat at `scrollTop: 163` while the buttons
   * needed ~280. So the reveal is also re-run as an EFFECT keyed on the things that change this
   * dialog's height (the step, and whether the preview/its error has landed).
   */
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const revealActions = useCallback(() => {
    actionsRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, []);
  const revealActionsRef = useCallback(
    (node: HTMLDivElement | null) => {
      actionsRef.current = node;
      if (node) revealActions();
    },
    [revealActions],
  );
  // Re-reveal once the async content that grows the dialog has landed.
  useEffect(() => {
    revealActions();
  }, [step, preview, previewError, revealActions]);

  const runUninstall = useCallback(() => {
    setStartError(null);
    setLines([]);
    setStep("running");
    // Persist the gate NOW, not at the terminal Close. The user's "turn the features off"
    // intent is settled the moment they authorize the removal, and it must survive a crash,
    // a quit, or a failed run (spec assumption 2 — a failed uninstall keeps the record, so
    // the wizard stays re-offerable, but the features stay off as asked).
    //
    // This is the ONLY intent whose gate write happens before the dialog closes; `keep` and
    // `cancel` are instantaneous, so for them the two moments are the same.
    onIntent("uninstall");
    invoke("workflow_uninstall_start").catch((e: unknown) => {
      // A rejected START never fires the finished event, so this is the only place that
      // failure can surface. Returning to confirm keeps the dialog usable.
      setStartError(String(e));
      setStep("confirm");
    });
  }, [onIntent]);

  const cancelRun = useCallback(() => {
    setCancelPending(true);
    void invoke("workflow_uninstall_cancel");
  }, []);

  return (
    <div className="install-wizard" data-testid="workflow-uninstall-dialog">
      {step === "confirm" && (
        <>
          <h3>{UNINSTALL_TITLE}</h3>
          <p className="settings-row-help">{UNINSTALL_INTRO}</p>
          <ul className="install-wizard-list">
            {UNINSTALL_EFFECTS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="settings-row-help">{UNINSTALL_NOT_REMOVED}</p>

          <p className="settings-row-help">
            <strong>{UNINSTALL_PREVIEW_LABEL}</strong>
          </p>
          {preview === null && previewError === null && (
            <p
              className="settings-row-help"
              data-testid="uninstall-preview-loading"
            >
              {UNINSTALL_PREVIEW_LOADING}
            </p>
          )}
          {previewError !== null && (
            <pre
              className="install-wizard-log"
              data-testid="uninstall-preview-error"
            >
              {previewError}
            </pre>
          )}
          {preview !== null && (
            <>
              <pre
                className="install-wizard-log uninstall-preview-log"
                data-testid="uninstall-preview"
              >
                {preview}
              </pre>
              <p className="settings-row-help">{UNINSTALL_PREVIEW_HINT}</p>
            </>
          )}
          {startError !== null && (
            <pre
              className="install-wizard-log"
              data-testid="uninstall-start-error"
            >
              {startError}
            </pre>
          )}

          <div className="install-wizard-actions" ref={revealActionsRef}>
            {/* Cancel FIRST and always available — the no-side-effect exit, including when
                the preview failed or the guard refused. */}
            <button
              onClick={() => {
                onIntent("cancel");
                onClose();
              }}
              data-testid="uninstall-cancel-intent"
              title={cancelHint}
            >
              {CANCEL_BUTTON}
            </button>
            {offersKeepIntent(trigger) && (
              <button
                onClick={() => {
                  onIntent("keep");
                  onClose();
                }}
                data-testid="uninstall-keep"
                title={KEEP_HINT}
              >
                {KEEP_BUTTON}
              </button>
            )}
            {/* Offered ONLY once the dry run has produced a real removal list. Without it the
                user would be authorizing a removal they were never shown. */}
            <button
              onClick={runUninstall}
              data-testid="uninstall-confirm"
              disabled={preview === null}
            >
              {UNINSTALL_BUTTON}
            </button>
          </div>
          <p className="settings-row-help">
            {offersKeepIntent(trigger) && (
              <>
                {KEEP_BUTTON}: {KEEP_HINT} ·{" "}
              </>
            )}
            {CANCEL_BUTTON}: {cancelHint}
          </p>
        </>
      )}

      {step === "running" && (
        <>
          <h3>{UNINSTALL_RUNNING_LABEL}</h3>
          <pre
            className="install-wizard-log"
            data-testid="uninstall-log"
            ref={tailRef}
          >
            {lines.join("\n")}
          </pre>
          <div className="install-wizard-actions" ref={revealActionsRef}>
            <button
              onClick={cancelRun}
              data-testid="uninstall-cancel-run"
              disabled={cancelPending}
            >
              {cancelPending ? UNINSTALL_CANCELLING_LABEL : CANCEL_BUTTON}
            </button>
          </div>
          {cancelPending && (
            <p className="settings-row-help">{UNINSTALL_CANCELLING_HINT}</p>
          )}
        </>
      )}

      {step === "done" && result && (
        <>
          <h3>{result.ok ? UNINSTALL_DONE_TITLE : UNINSTALL_FAILED_TITLE}</h3>
          {/* The one arm where a surviving record is a PROBLEM, not a safety property. */}
          {!result.ok &&
            result.removal_complete === false &&
            result.record_deleted === false &&
            result.retry_available === false && (
              <p className="install-wizard-warning">
                {UNINSTALL_STALE_RECORD_HINT}
              </p>
            )}
          {!result.ok && result.retry_available && (
            <p className="settings-row-help">{UNINSTALL_RETRY_HINT}</p>
          )}
          {result.error && (
            <pre
              className="install-wizard-log"
              data-testid="uninstall-error"
              ref={tailRef}
            >
              {result.error}
            </pre>
          )}
          {lines.length > 0 && !result.error && (
            <pre className="install-wizard-log" ref={tailRef}>
              {lines.join("\n")}
            </pre>
          )}
          <div className="install-wizard-actions" ref={revealActionsRef}>
            {/* Close only — the gate was already persisted when the run started, so this
                button carries no intent. */}
            <button onClick={onClose} data-testid="uninstall-close">
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
}
