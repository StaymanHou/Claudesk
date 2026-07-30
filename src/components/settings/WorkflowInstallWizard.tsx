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
 * The clone's own directory name, appended to whatever parent the Browse dialog returns.
 *
 * Mirrors Rust's `workflow_install::CLONE_DIR_NAME`. Duplicated rather than plumbed through an
 * IPC call because it is a constant, not state — but note the coupling: if the Rust constant
 * changes, the default path from `workflow_install_default_location` and a Browse-picked path
 * would disagree.
 */
const CLONE_DIR_NAME = "my-claude-code-customization";

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
}

export function WorkflowInstallWizard({ onClose, onFinished }: Props) {
  const [step, setStep] = useState<Step>("consent");
  const [dest, setDest] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [cancelPending, setCancelPending] = useState(false);
  const [result, setResult] = useState<InstallFinished | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  // Seed the location field with the backend's default. The path is composed in Rust from the
  // resolved home dir — the frontend never builds a `~/...` string itself, because only the
  // commands layer is allowed to know where home is.
  useEffect(() => {
    let cancelled = false;
    invoke<string>("workflow_install_default_location")
      .then((p) => {
        if (!cancelled) setDest(p);
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
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

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
        setDest(`${picked.replace(/\/$/, "")}/${CLONE_DIR_NAME}`);
      }
    } catch {
      /* Dialog cancelled or unavailable — keep whatever the field already holds. */
    }
  }, []);

  const cancel = useCallback(() => {
    setCancelPending(true);
    void invoke("workflow_install_cancel");
  }, []);

  return (
    <div className="install-wizard" data-testid="workflow-install-wizard">
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
            ref={logRef}
            data-testid="install-log"
          >
            {lines.join("\n")}
          </pre>
          <div className="install-wizard-actions">
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
            <pre className="install-wizard-log" data-testid="install-error">
              {result.error}
            </pre>
          )}
          {lines.length > 0 && !result.error && (
            <pre className="install-wizard-log">{lines.join("\n")}</pre>
          )}
          <div className="install-wizard-actions">
            <button onClick={onClose} data-testid="install-close">
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
}
