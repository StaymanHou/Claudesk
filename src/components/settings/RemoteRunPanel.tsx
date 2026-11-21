// M18 WP6 + WP7 — Install, Update and Uninstall on a remote host, from its Settings → Remote hosts
// entry (§R.3, §R.5).
//
// One panel per entry: a button for each op the entry is offered (Install on an Absent host;
// Update on a Managed one that is behind GitHub; Uninstall on a Managed one, all only with the
// link Up; WP7 D12), then that op's confirm step, then the run's streamed output, then its result.
// It reuses the local install wizard's look (`.install-wizard*`), not its component: the local
// wizard picks a folder and owns the local gate, and a remote run does neither.
//
// ## The result comes from the host, not from this panel
// The backend re-probes the host after every run and writes the per-host cache, so the entry's
// state tag flips through the one store (`useHostSubstrates`) before the finished event arrives.
// That is also why this panel stays mounted once a run has started: the op that started it stops
// being offered mid-run (an installed host is no longer Absent).
//
// ## A Settings reopened mid-run shows the run (WP7 D11)
// On mount the panel asks the backend for the run in flight (`getRemoteRunState`); if it is this
// host's, the panel shows it running and listens to its events, instead of offering a button the
// backend would refuse as "already running". Output from before the reopen is not replayed.
// The query runs only once the three listeners are attached (subscribe, then query), and a finished
// event or phase for this host that lands while it is in flight is kept, not dropped (WP8 P1.2).
//
// ## Cancel (ruling A)
// Install: during the clone. Update: during the fetch. Once the run reports `install`, the button
// disables and says the run is finishing; a cancel that races that boundary is refused by the
// backend with the same words, shown here. Uninstall has no Cancel (WP7 D7: under a second, and it
// must not be split).

import { useCallback, useEffect, useRef, useState } from "react";
import { useTauriListen } from "../../useTauriListen";
import {
  cancelRemoteRun,
  FINISHING_LABEL,
  getRemoteRunState,
  previewRemoteUninstall,
  REMOTE_CONSENT_ITEMS,
  REMOTE_RUN_FINISHED_EVENT,
  REMOTE_RUN_OUTPUT_EVENT,
  REMOTE_RUN_PHASE_EVENT,
  REMOTE_UNINSTALL_INTRO,
  REMOTE_UNINSTALL_NOTE,
  REMOTE_UPDATE_ITEMS,
  startRemoteRun,
  type RemoteOp,
  type RemotePhase,
  type RemoteRunFinished,
  type RemoteRunLine,
  type RemoteRunPhase,
  type RemoteRunView,
  type RemoteUninstallPreview,
} from "../../state/remoteRun";
import { CANCELLING_LABEL } from "./workflowInstallCopy";

/** Which ops this entry offers right now. */
export type RemoteRunOffers = Readonly<Record<RemoteOp, boolean>>;

type Step =
  | { readonly kind: "closed" }
  | { readonly kind: "consent"; readonly op: RemoteOp }
  | {
      readonly kind: "running";
      readonly op: RemoteOp;
      readonly reattached: boolean;
    }
  | { readonly kind: "done"; readonly op: RemoteOp };

type Preview =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly preview: RemoteUninstallPreview }
  | { readonly kind: "refused"; readonly reason: string };

const OPS: readonly RemoteOp[] = ["install", "update", "uninstall"];

const WORDS: Record<
  RemoteOp,
  {
    readonly open: string;
    readonly heading: string;
    readonly confirm: string;
    readonly running: string;
    readonly ok: string;
    readonly failed: string;
  }
> = {
  install: {
    open: "Install…",
    heading: "Install the workflow system on this host",
    confirm: "Install",
    running: "Installing on this host…",
    ok: "Installed",
    failed: "Install failed",
  },
  update: {
    open: "Update…",
    heading: "Update the workflow system on this host",
    confirm: "Update",
    running: "Updating this host…",
    ok: "Updated",
    failed: "Update failed",
  },
  uninstall: {
    open: "Uninstall…",
    heading: "Remove the workflow system from this host",
    confirm: "Uninstall",
    running: "Uninstalling from this host…",
    ok: "Uninstalled",
    failed: "Uninstall failed",
  },
};

/** The result's heading. */
export function resultTitle(result: RemoteRunFinished): string {
  if (result.ok) return WORDS[result.op].ok;
  return result.cancelled ? "Cancelled" : WORDS[result.op].failed;
}

/** Whether Cancel is honoured in `phase` for `op`. */
function cancellable(op: RemoteOp, phase: RemoteRunPhase | null): boolean {
  return op !== "uninstall" && phase !== "install";
}

export function RemoteRunPanel({
  host,
  offers,
  onDone,
}: {
  host: string;
  /** Which buttons may show (the host's state and its link, decided by the entry). */
  offers: RemoteRunOffers;
  /** Called once when a run ends having done what it was for (the parent re-checks the entry). */
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "closed" });
  const [lines, setLines] = useState<string[]>([]);
  const [phase, setPhase] = useState<RemoteRunPhase | null>(null);
  const [result, setResult] = useState<RemoteRunFinished | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [cancel, setCancel] = useState<"idle" | "pending">("idle");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview>({ kind: "loading" });

  const runningOp = step.kind === "running" ? step.op : null;
  // WP8 P1.2 (`SURFACE-2026-11-20-QUALITY-REATTACH-RACES-ITS-LISTENERS`): the re-attach seed's
  // state, in refs because the listeners must see it BEFORE React re-renders.
  //  - `seedPending`: the run-state query has not answered yet. Until it does, this panel cannot
  //    tell which op a host-matching event belongs to, so it keeps the newest finished event and
  //    phase for this host instead of dropping them.
  //  - `reattachedOp`: set the moment the answer names this host's run, so an event landing
  //    between that answer and the re-render (when `runningOp` is still null) is routed, not lost.
  const seedPending = useRef(true);
  const reattachedOp = useRef<RemoteOp | null>(null);
  const earlyFinished = useRef<RemoteRunFinished | null>(null);
  const earlyPhase = useRef<RemotePhase | null>(null);
  const mine = (p: { host: string; op: RemoteOp }) =>
    p.host === host &&
    p.op ===
      (runningOp ?? (step.kind === "closed" ? reattachedOp.current : null));
  const unseeded = (p: { host: string }) =>
    seedPending.current && step.kind === "closed" && p.host === host;

  const finish = (p: RemoteRunFinished) => {
    reattachedOp.current = null;
    setResult(p);
    setStep({ kind: "done", op: p.op });
    // From the listener (or the seed's reply), not a state updater: StrictMode runs updaters twice.
    if (p.ok) onDone();
  };

  // Subscribe, THEN query (`useTauriListen`'s `onSubscribed`): the query runs only once all three
  // listeners are attached, so nothing the run sends after the backend reads its state is missed.
  const [subscribed, setSubscribed] = useState(0);
  const onSubscribed = useCallback(() => setSubscribed((n) => n + 1), []);
  useTauriListen<RemoteRunLine>(
    REMOTE_RUN_OUTPUT_EVENT,
    (e) => {
      if (mine(e.payload)) setLines((prev) => [...prev, e.payload.line]);
    },
    onSubscribed,
  );
  useTauriListen<RemotePhase>(
    REMOTE_RUN_PHASE_EVENT,
    (e) => {
      if (unseeded(e.payload)) earlyPhase.current = e.payload;
      else if (mine(e.payload)) setPhase(e.payload.phase);
    },
    onSubscribed,
  );
  useTauriListen<RemoteRunFinished>(
    REMOTE_RUN_FINISHED_EVENT,
    (e) => {
      if (unseeded(e.payload)) earlyFinished.current = e.payload;
      else if (mine(e.payload)) finish(e.payload);
    },
    onSubscribed,
  );

  // WP7 D11: a run already in flight for this host (Settings reopened mid-run) is shown, not
  // re-offered. Asked once per mount, after the listeners; a reply after unmount is dropped.
  const listening = subscribed >= 3;
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  useEffect(() => {
    if (!listening) return;
    let live = true;
    const settle = (run: RemoteRunView | null) => {
      if (!live) return;
      seedPending.current = false;
      const fin = earlyFinished.current;
      const ph = earlyPhase.current;
      earlyFinished.current = null;
      earlyPhase.current = null;
      if (run && run.host === host) {
        // The run ended while the query was in flight: show how it ended.
        if (fin && fin.op === run.op) return finishRef.current(fin);
        reattachedOp.current = run.op;
        setStep((s) =>
          s.kind === "closed"
            ? { kind: "running", op: run.op, reattached: true }
            : s,
        );
        setPhase(ph && ph.op === run.op ? ph.phase : run.phase);
        return;
      }
      // The run ended before the backend read its state: its finished event is all there is.
      if (fin) finishRef.current(fin);
    };
    getRemoteRunState().then(settle, () => settle(null));
    return () => {
      live = false;
    };
  }, [host, listening]);

  // A confirm step belongs to the moment the operator opened it, while its op was offered. When
  // that op's offer CHANGES, in either direction, close it: turned off (another run changed the
  // host), an open step would offer a run the backend then refuses; turned on again, a step hidden
  // by the render gate below would come back by itself with a stale reason. A run already started
  // stays, to show its result. ⚠️ The offers read the entry's `link_up` from `getRemoteHosts` at
  // mount, which never updates, so a link that drops does NOT close a step: only the backend's
  // "isn't connected" refusal catches it. React's "adjust state when a prop changes" pattern.
  const offerKey = OPS.map((o) => (offers[o] ? "1" : "0")).join("");
  const [wasOfferKey, setWasOfferKey] = useState(offerKey);
  if (offerKey !== wasOfferKey) {
    setWasOfferKey(offerKey);
    if (step.kind === "consent") setStep({ kind: "closed" });
  }

  // Bring the panel into view when it opens or changes step (the local wizard's lesson: a button
  // row below the fold is a button nobody finds).
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [step.kind]);

  const open = useCallback(
    (op: RemoteOp) => {
      setStartError(null);
      setStep({ kind: "consent", op });
      if (op !== "uninstall") return;
      // Uninstall's confirm IS the host's own dry run, behind the remote refuse-guard.
      setPreview({ kind: "loading" });
      previewRemoteUninstall(host).then(
        (p) => setPreview({ kind: "ready", preview: p }),
        (e: unknown) => setPreview({ kind: "refused", reason: String(e) }),
      );
    },
    [host],
  );

  const start = useCallback(
    (op: RemoteOp) => {
      setStartError(null);
      setLines([]);
      setPhase(null);
      setResult(null);
      setCancel("idle");
      setCancelError(null);
      setStep({ kind: "running", op, reattached: false });
      startRemoteRun(op, host).catch((e: unknown) => {
        // A refused start sends no finished event: this is the only place it can surface.
        setStartError(String(e));
        setStep({ kind: "consent", op });
      });
    },
    [host],
  );

  const requestCancel = useCallback(() => {
    setCancel("pending");
    setCancelError(null);
    cancelRemoteRun().catch((e: unknown) => {
      setCancel("idle");
      setCancelError(String(e));
    });
  }, []);

  // A confirm step renders only while its op is offered: a refused start that lands after the
  // host stopped being offered must not reopen it (the prop-change block above covers an open one).
  if (step.kind === "closed" || (step.kind === "consent" && !offers[step.op])) {
    const shown = OPS.filter((o) => offers[o]);
    if (shown.length === 0) return null;
    return (
      <div className="remote-run-buttons">
        {shown.map((op) => (
          <button
            key={op}
            type="button"
            className="substrate-install-button"
            data-testid={`remote-${op}-open`}
            onClick={() => open(op)}
          >
            {WORDS[op].open}
          </button>
        ))}
      </div>
    );
  }

  const op = step.op;
  const finishing = !cancellable(op, phase);
  const canConfirm = op !== "uninstall" || preview.kind === "ready";
  return (
    <div className="install-wizard" data-testid="remote-run" ref={panelRef}>
      {step.kind === "consent" && (
        <>
          <h3>{WORDS[op].heading}</h3>
          {op === "install" && (
            <>
              <p className="install-wizard-intro">
                Claudesk will run the companion repository&rsquo;s own installer
                on <code>{host}</code>, over its open connection. Here is
                everything it changes there:
              </p>
              <ul className="install-wizard-disclosures">
                {REMOTE_CONSENT_ITEMS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {op === "update" && (
            <>
              <p className="install-wizard-intro">
                Claudesk will update the workflow system on <code>{host}</code>,
                over its open connection:
              </p>
              <ul className="install-wizard-disclosures">
                {REMOTE_UPDATE_ITEMS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {op === "uninstall" && (
            <>
              <p className="install-wizard-intro">{REMOTE_UNINSTALL_INTRO}</p>
              {preview.kind === "loading" && (
                <p
                  className="install-wizard-hint"
                  data-testid="remote-uninstall-preview-loading"
                >
                  Asking the host what it would remove&hellip;
                </p>
              )}
              {preview.kind === "ready" && (
                <>
                  <p className="install-wizard-hint">
                    The clone that will be deleted:{" "}
                    <code data-testid="remote-uninstall-clone">
                      {preview.preview.clone_dir}
                    </code>
                  </p>
                  <pre
                    className="install-wizard-log"
                    data-testid="remote-uninstall-preview"
                  >
                    {preview.preview.preview}
                  </pre>
                </>
              )}
              {preview.kind === "refused" && (
                <p
                  className="install-wizard-error"
                  role="alert"
                  data-testid="remote-uninstall-refused"
                >
                  {preview.reason}
                </p>
              )}
              <p className="install-wizard-hint">{REMOTE_UNINSTALL_NOTE}</p>
            </>
          )}
          {startError && (
            <p
              className="install-wizard-error"
              role="alert"
              data-testid="remote-run-start-error"
            >
              {startError}
            </p>
          )}
          <div className="install-wizard-actions">
            <button
              type="button"
              onClick={() => setStep({ kind: "closed" })}
              data-testid="remote-run-dismiss"
            >
              Cancel
            </button>
            {canConfirm && (
              <button
                type="button"
                onClick={() => start(op)}
                data-testid="remote-run-confirm"
              >
                {WORDS[op].confirm}
              </button>
            )}
          </div>
        </>
      )}

      {step.kind === "running" && (
        <>
          <h3>{WORDS[op].running}</h3>
          {step.reattached && (
            <p
              className="install-wizard-hint"
              data-testid="remote-run-reattached"
            >
              This run started before Settings was reopened; its earlier output
              isn&rsquo;t shown.
            </p>
          )}
          <pre className="install-wizard-log" data-testid="remote-run-log">
            {lines.join("\n")}
          </pre>
          {op !== "uninstall" && (
            <div className="install-wizard-actions">
              <button
                type="button"
                onClick={requestCancel}
                disabled={finishing || cancel === "pending"}
                data-testid="remote-run-cancel"
              >
                {finishing
                  ? FINISHING_LABEL[op]
                  : cancel === "pending"
                    ? CANCELLING_LABEL
                    : "Cancel"}
              </button>
            </div>
          )}
          {cancelError && (
            <p className="install-wizard-error" role="alert">
              {cancelError}
            </p>
          )}
          <p className="install-wizard-hint">
            {op === "uninstall"
              ? "Uninstall can't be cancelled; it takes about a second."
              : finishing
                ? "install.sh is running; stopping it halfway would leave the host half-installed, so it finishes."
                : "Closing Settings leaves the run going."}
          </p>
        </>
      )}

      {step.kind === "done" && result && (
        <>
          <h3 data-testid="remote-run-result">{resultTitle(result)}</h3>
          {result.message && (
            <p
              className={
                result.ok ? "install-wizard-intro" : "install-wizard-warning"
              }
              data-testid="remote-run-message"
            >
              {result.message}
            </p>
          )}
          {lines.length > 0 && (
            <pre className="install-wizard-log" data-testid="remote-run-log">
              {lines.join("\n")}
            </pre>
          )}
          <div className="install-wizard-actions">
            <button
              type="button"
              onClick={() => setStep({ kind: "closed" })}
              data-testid="remote-run-close"
            >
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
}
