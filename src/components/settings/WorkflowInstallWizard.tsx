// M10.9 WP3.5a Phase 4 — the install wizard: pick a location, consent, watch it run.
//
// ## Two steps, one confirmation point
// `consent` → `running` → `done`. The consent step is where the user authorizes every `~/.claude/`
// side effect, and it is the *only* such point: there is no separate pre-dialog, because a second
// confirmation for the same act trains people to click through both.
//
// ## What this component does NOT decide
// Whether the gate reverts, whether a partial clone is left, whether the substrate is installed
// despite an error — all of that arrives in the `workflow-install-finished` payload from Rust's
// pure `terminal::resolve_terminal_state`. Re-deriving any of it here would create a second
// implementation of the terminal-state table that could silently disagree with the tested one.

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useTauriListen } from "../../useTauriListen";
import {
  CANCELLING_HINT,
  CANCELLING_LABEL,
  CONSENT_ITEMS,
} from "./workflowInstallCopy";

/** The upstream repository. Not user-editable — only the destination is. */
const ORIGIN_URL =
  "git@github.com:StaymanHou/stayman-claude-code-customization.git";

/**
 * The clone's own directory name, **derived** from the backend's default location rather than
 * duplicated as a literal.
 *
 * ⚠️ This used to be a hardcoded `"my-claude-code-customization"` mirroring Rust's
 * `workflow_install::CLONE_DIR_NAME`, with a comment acknowledging the coupling — the drift
 * channel being that a change to the Rust constant would make the seeded default path and a
 * Browse-picked path disagree, silently, with no test able to see it.
 * (`SURFACE-2026-07-29-QUALITY-WP3.5A-CLONE-DIR-NAME-DUPLICATED`.)
 *
 * The wizard already fetches the full default path at mount, and that path ends in exactly this
 * basename — so there is one source of truth (Rust) and the frontend reads it instead of
 * restating it. Documenting a drift channel is strictly worse than removing it.
 *
 * Falls back to the literal only if the default-location call failed, in which case the field
 * is empty and Browse is the user's only path anyway.
 */
function cloneDirNameFrom(defaultPath: string): string {
  const base = defaultPath.replace(/\/+$/, "").split("/").pop();
  return base && base.length > 0 ? base : "my-claude-code-customization";
}

/** Outcome payload from Rust — mirrors `commands::InstallFinished`. */
interface InstallFinished {
  ok: boolean;
  revert_gate: boolean;
  partial_clone_left: boolean;
  substrate_installed: boolean;
  error: string | null;
}

type Step = "consent" | "running" | "done";

interface Props {
  /** Close the wizard. */
  onClose: () => void;
  /** Called after a run ends so the caller can re-resolve provenance + honor a gate revert. */
  onFinished: (result: InstallFinished) => void;
  /**
   * Turn the workflow-features gate ON, then close.
   *
   * Offered only on a successful install. The gate flip stays the CALLER's job — this component
   * does not own settings state, and routing it through the panel's existing `useSettingControl`
   * keeps the optimistic-set/revert-on-reject discipline in one place.
   */
  onEnableAndClose: () => void;
}

export function WorkflowInstallWizard({
  onClose,
  onFinished,
  onEnableAndClose,
}: Props) {
  const [step, setStep] = useState<Step>("consent");
  const [dest, setDest] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [cancelPending, setCancelPending] = useState(false);
  const [result, setResult] = useState<InstallFinished | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  // Seed the location field with the backend's default. The path is composed in Rust from the
  // resolved home dir — the frontend never builds a `~/...` string itself, because only the
  // commands layer is allowed to know where home is.
  //
  // Retained in a ref as well as state so `browse` can derive the clone's basename from it
  // without taking `dest` as a dependency — `dest` changes on every keystroke in the editable
  // field, and the picked-parent path must not be recomposed from a half-typed value.
  const defaultPathRef = useRef("");
  useEffect(() => {
    let cancelled = false;
    invoke<string>("workflow_install_default_location")
      .then((p) => {
        if (!cancelled) {
          defaultPathRef.current = p;
          setDest(p);
        }
      })
      .catch(() => {
        /* Leave the field empty; the user can type a path. Not worth an error surface. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useTauriListen<string>("workflow-install-output", (event) => {
    setLines((prev) => [...prev, event.payload]);
  });

  useTauriListen<InstallFinished>("workflow-install-finished", (event) => {
    const payload = event.payload;
    setResult(payload);
    setStep("done");
    setCancelPending(false);
    // Called from the listener, NOT from inside a state updater: StrictMode double-invokes
    // updaters, which would fire this side effect twice (the exact defect WP2 shipped and had
    // to fix at review — a double-write on every settings toggle).
    onFinished(payload);
  });

  // Follow the tail as output streams — the whole point of streaming is watching it move.
  //
  // A CALLBACK ref, not `useRef` + an effect keyed on `lines`. Two reasons, both found at
  // verify-human: (1) the `done` step renders a DIFFERENT <pre> than the `running` step, so a
  // single ref attached to only one of them left the final transcript scrolled to the top —
  // which is the box the operator saw; (2) a callback ref runs on every render *after* the DOM
  // is updated, so it tails correctly on mount, on each new line, and across the step change,
  // without needing a dependency array that has to enumerate all three.
  const tailRef = useCallback((node: HTMLPreElement | null) => {
    if (node) node.scrollTop = node.scrollHeight;
  }, []);

  const start = useCallback(() => {
    setStartError(null);
    setLines([]);
    setStep("running");
    invoke("workflow_install_start", { url: ORIGIN_URL, dest }).catch(
      (e: unknown) => {
        // A rejected *start* never fires the finished event, so this is the only place that
        // failure can surface. Returning to consent keeps the wizard usable.
        setStartError(String(e));
        setStep("consent");
      },
    );
  }, [dest]);

  // Native directory picker. Appends the repo's own directory name to whatever parent the user
  // chooses, so picking `~/code` yields `~/code/my-claude-code-customization` rather than cloning
  // loose files into a directory that already has contents.
  const browse = useCallback(async () => {
    try {
      const picked = await open({ directory: true, multiple: false });
      if (typeof picked === "string") {
        // Basename derived from the backend's default path (see `cloneDirNameFrom`), so a
        // Browse-picked destination and the seeded default can never disagree.
        const name = cloneDirNameFrom(defaultPathRef.current);
        setDest(`${picked.replace(/\/$/, "")}/${name}`);
      }
    } catch {
      /* Dialog cancelled or unavailable — keep whatever the field already holds. */
    }
  }, []);

  /**
   * On mount, scroll the Settings panel so the WHOLE wizard is visible.
   *
   * The wizard is tall (six disclosure bullets + a location row + actions) and it opens partway
   * down a scrollable panel, so it was appearing with its bottom half — including the Install
   * and Cancel buttons — clipped below the fold. The user then had to find the scrollbar to
   * reach the primary action of the thing they just opened.
   *
   * `block: "nearest"` rather than `"start"`/`"center"`: it scrolls the MINIMUM needed to bring
   * the element fully into view and no-ops when it already is. `"start"` would yank the wizard
   * to the top of the viewport even when it was perfectly visible, losing the surrounding
   * context (the status line above it) for no reason.
   *
   * A callback ref, not an effect: it fires once the node is in the DOM and laid out, which is
   * what `scrollIntoView` needs to compute the right offset. `behavior: "smooth"` because the
   * jump is otherwise disorienting — the panel moves without the user having asked it to.
   */
  const revealRef = useCallback((node: HTMLDivElement | null) => {
    node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const cancel = useCallback(() => {
    setCancelPending(true);
    void invoke("workflow_install_cancel");
  }, []);

  return (
    <div
      className="install-wizard"
      data-testid="workflow-install-wizard"
      ref={revealRef}
    >
      {step === "consent" && (
        <>
          <h3>Install the workflow system</h3>
          <p className="install-wizard-intro">
            Claudesk will run the companion repository&rsquo;s own installer.
            Here is everything it changes:
          </p>
          <ul className="install-wizard-disclosures">
            {CONSENT_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <label className="install-wizard-location">
            Install location
            <span className="install-wizard-location-row">
              <input
                type="text"
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                data-testid="install-location"
                spellCheck={false}
              />
              {/* Both affordances, deliberately. The picker is the discoverable path; the text
                  field stays editable because the default destination does not exist yet, and a
                  native directory picker cannot select a directory that has not been created —
                  it would force the user to make `~/.claudesk/vendor/` by hand first. */}
              <button
                type="button"
                onClick={browse}
                data-testid="install-browse"
              >
                Browse&hellip;
              </button>
            </span>
          </label>
          {startError && (
            <p className="install-wizard-error" role="alert">
              {startError}
            </p>
          )}
          <div className="install-wizard-actions">
            <button onClick={onClose}>Cancel</button>
            <button
              onClick={start}
              disabled={dest.trim() === ""}
              data-testid="install-confirm"
            >
              Install
            </button>
          </div>
        </>
      )}

      {step === "running" && (
        <>
          <h3>Installing&hellip;</h3>
          <pre
            className="install-wizard-log"
            ref={tailRef}
            data-testid="install-log"
          >
            {lines.join("\n")}
          </pre>
          <div className="install-wizard-actions">
            {/* Always dismissable, even mid-run. Closing the panel does NOT cancel the
                install — the backend keeps going and `install.sh` is idempotent — and the
                copy below says so, because a Close button that silently abandoned a
                half-finished `~/.claude/` mutation would be worse than no button.

                This is the frontend half of the stuck-in-`running` fix. The backend's
                RunGuard now emits a terminal event even on an unwinding panic, so this
                should be unreachable; it exists because the cost of being wrong is a
                wizard with no exit, and the cost of the button is one line. */}
            <button onClick={onClose} data-testid="install-hide">
              Close
            </button>
            <button
              onClick={cancel}
              disabled={cancelPending}
              data-testid="install-cancel"
            >
              {cancelPending ? CANCELLING_LABEL : "Cancel"}
            </button>
          </div>
          {cancelPending && (
            <p className="install-wizard-hint">{CANCELLING_HINT}</p>
          )}
          {!cancelPending && (
            <p className="install-wizard-hint">
              Closing this leaves the install running &mdash; use Cancel to stop
              it.
            </p>
          )}
        </>
      )}

      {step === "done" && result && (
        <>
          <h3>{result.ok ? "Installed" : "Install failed"}</h3>
          {/* The substrate-installed-despite-error case. Reporting a flat failure here would
              send the user to retry into a tree that IS already installed. */}
          {!result.ok && result.substrate_installed && (
            <p className="install-wizard-warning">
              The workflow system was installed, but Claudesk could not record
              it. It will show as a developer install, and Claudesk will not
              offer to remove it.
            </p>
          )}
          {result.partial_clone_left && (
            <p className="install-wizard-warning">
              A partial clone was left at the install location. Claudesk does
              not delete it — remove it by hand if you want to retry cleanly.
            </p>
          )}
          {result.error && (
            <pre
              className="install-wizard-log"
              data-testid="install-error"
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
          <div className="install-wizard-actions">
            {/* On success, offer the obvious next step as its own button (operator request at
                verify-human). Installing the substrate and ENABLING the feature layer are
                deliberately separate acts — that separation is milestone property 2 — but
                someone who just consented to an install almost certainly wants the features
                on, and making them hunt for the checkbox afterwards is friction with no
                safety value. So: two buttons, both explicit, neither implied.

                Plain `Close` stays FIRST and remains the no-side-effect exit: a user who
                installed to try it later, or who wants to read the transcript before
                committing, must not have enabling forced on them. */}
            <button onClick={onClose} data-testid="install-close">
              Close
            </button>
            {result.ok && (
              <button
                onClick={onEnableAndClose}
                data-testid="install-enable-close"
              >
                Enable workflow features &amp; close
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
