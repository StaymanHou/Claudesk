// M18 WP6 — Install on a remote host, from its Settings → Remote hosts entry (§R.3, §R.5).
//
// One panel per entry: an "Install…" button while the host reads Absent with its link Up, then a
// consent step, then the run's streamed output, then its result. It reuses the local install
// wizard's look (`.install-wizard*`), not its component: the local wizard picks a folder and owns
// the local gate, and a remote install does neither.
//
// ## The result comes from the host, not from this panel
// The backend re-probes the host after every run and writes the per-host cache, so the entry's
// state tag flips to Managed through the one store (`useHostSubstrates`) before the finished
// event even arrives. That is also why this panel stays mounted once a run has started: the
// parent offers it only for an Absent host, and the host stops being Absent mid-run.
//
// ## Cancel (ruling A)
// Honoured only during the clone. Once the run reports `install`, the button disables and says the
// install is finishing; a cancel that races that boundary is refused by the backend with the same
// words, shown here.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTauriListen } from "../../useTauriListen";
import {
  cancelRemoteInstall,
  FINISHING_LABEL,
  REMOTE_CONSENT_ITEMS,
  REMOTE_INSTALL_FINISHED_EVENT,
  REMOTE_INSTALL_OUTPUT_EVENT,
  REMOTE_INSTALL_PHASE_EVENT,
  startRemoteInstall,
  type RemoteInstallFinished,
  type RemoteInstallPhase,
  type RemotePhase,
} from "../../state/remoteInstall";
import { CANCELLING_LABEL } from "./workflowInstallCopy";

type Step = "closed" | "consent" | "running" | "done";

/** The result's heading. */
export function resultTitle(result: RemoteInstallFinished): string {
  if (result.ok) return "Installed";
  return result.cancelled ? "Cancelled" : "Install failed";
}

export function RemoteInstallPanel({
  host,
  offered,
  onInstalled,
}: {
  host: string;
  /** The host reads Absent and its link is Up: the Install button may show. */
  offered: boolean;
  /** Called once when a run ends with the host installed (the parent re-checks the entry). */
  onInstalled: () => void;
}) {
  const [step, setStep] = useState<Step>("closed");
  const [lines, setLines] = useState<string[]>([]);
  const [phase, setPhase] = useState<RemoteInstallPhase | null>(null);
  const [result, setResult] = useState<RemoteInstallFinished | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [cancel, setCancel] = useState<"idle" | "pending">("idle");
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Output carries no host: one run at a time app-wide (the backend's single-run lock), and only
  // the panel that started it is `running`.
  useTauriListen<string>(REMOTE_INSTALL_OUTPUT_EVENT, (e) => {
    if (step === "running") setLines((prev) => [...prev, e.payload]);
  });
  useTauriListen<RemotePhase>(REMOTE_INSTALL_PHASE_EVENT, (e) => {
    if (step === "running" && e.payload.host === host)
      setPhase(e.payload.phase);
  });
  useTauriListen<RemoteInstallFinished>(REMOTE_INSTALL_FINISHED_EVENT, (e) => {
    if (step !== "running" || e.payload.host !== host) return;
    setResult(e.payload);
    setStep("done");
    // From the listener, not a state updater: StrictMode runs updaters twice.
    if (e.payload.ok) onInstalled();
  });

  // A consent step belongs to the moment the operator opened it, while the host was offered. When
  // `offered` CHANGES, in either direction, close any consent step:
  // - turned false (another run installed the host): an open consent would offer an Install the
  //   backend then refuses. ⚠️ `offered` reads the entry's `link_up` from `getRemoteHosts` at
  //   mount, which never updates, so a link that drops does NOT close the step: only the
  //   backend's "isn't connected" refusal catches it;
  // - turned true again: a consent step hidden by the render gate below (a start refused AFTER the
  //   host stopped being offered) would otherwise come back by itself, with a stale reason.
  // A run already started stays, to show its result (the host stops being Absent mid-run).
  // React's "adjust state when a prop changes" pattern, not an effect (`set-state-in-effect`).
  const [wasOffered, setWasOffered] = useState(offered);
  if (offered !== wasOffered) {
    setWasOffered(offered);
    if (step === "consent") setStep("closed");
  }

  // Bring the panel into view when it opens or changes step (it opens partway down a scrolling
  // panel; the local wizard's lesson: a button row below the fold is a button nobody finds).
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [step]);

  const start = useCallback(() => {
    setStartError(null);
    setLines([]);
    setPhase(null);
    setResult(null);
    setCancel("idle");
    setCancelError(null);
    setStep("running");
    startRemoteInstall(host).catch((e: unknown) => {
      // A refused start sends no finished event: this is the only place it can surface.
      setStartError(String(e));
      setStep("consent");
    });
  }, [host]);

  const requestCancel = useCallback(() => {
    setCancel("pending");
    setCancelError(null);
    cancelRemoteInstall().catch((e: unknown) => {
      setCancel("idle");
      setCancelError(String(e));
    });
  }, []);

  // A consent step renders only while the host is offered: a refused start that lands after the
  // host stopped being Absent must not reopen it (the prop-change block above covers an open one).
  if (step === "closed" || (step === "consent" && !offered)) {
    if (!offered) return null;
    return (
      <button
        type="button"
        className="substrate-install-button remote-install-open"
        data-testid="remote-install-open"
        onClick={() => {
          setStartError(null);
          setStep("consent");
        }}
      >
        Install…
      </button>
    );
  }

  const finishing = phase === "install";
  return (
    <div className="install-wizard" data-testid="remote-install" ref={panelRef}>
      {step === "consent" && (
        <>
          <h3>Install the workflow system on this host</h3>
          <p className="install-wizard-intro">
            Claudesk will run the companion repository&rsquo;s own installer on{" "}
            <code>{host}</code>, over its open connection. Here is everything it
            changes there:
          </p>
          <ul className="install-wizard-disclosures">
            {REMOTE_CONSENT_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {startError && (
            <p
              className="install-wizard-error"
              role="alert"
              data-testid="remote-install-start-error"
            >
              {startError}
            </p>
          )}
          <div className="install-wizard-actions">
            <button
              type="button"
              onClick={() => setStep("closed")}
              data-testid="remote-install-dismiss"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={start}
              data-testid="remote-install-confirm"
            >
              Install
            </button>
          </div>
        </>
      )}

      {step === "running" && (
        <>
          <h3>Installing on this host&hellip;</h3>
          <pre className="install-wizard-log" data-testid="remote-install-log">
            {lines.join("\n")}
          </pre>
          <div className="install-wizard-actions">
            <button
              type="button"
              onClick={requestCancel}
              disabled={finishing || cancel === "pending"}
              data-testid="remote-install-cancel"
            >
              {finishing
                ? FINISHING_LABEL
                : cancel === "pending"
                  ? CANCELLING_LABEL
                  : "Cancel"}
            </button>
          </div>
          {cancelError && (
            <p className="install-wizard-error" role="alert">
              {cancelError}
            </p>
          )}
          <p className="install-wizard-hint">
            {finishing
              ? "install.sh is running; stopping it halfway would leave the host half-installed, so it finishes."
              : "Closing Settings leaves the install running."}
          </p>
        </>
      )}

      {step === "done" && result && (
        <>
          <h3 data-testid="remote-install-result">{resultTitle(result)}</h3>
          {result.message && (
            <p
              className={
                result.ok ? "install-wizard-intro" : "install-wizard-warning"
              }
              data-testid="remote-install-message"
            >
              {result.message}
            </p>
          )}
          {lines.length > 0 && (
            <pre
              className="install-wizard-log"
              data-testid="remote-install-log"
            >
              {lines.join("\n")}
            </pre>
          )}
          <div className="install-wizard-actions">
            <button
              type="button"
              onClick={() => setStep("closed")}
              data-testid="remote-install-close"
            >
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
}
