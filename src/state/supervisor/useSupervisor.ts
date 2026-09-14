// M15 WP4 Phase 4 — THE SUPERVISOR'S FIRST PRODUCTION CALLER.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THE HOST IS **PER-WORKSPACE**, NOT AN APP-LEVEL SWEEP — AND `fanOut` IS DELIBERATELY LEFT
// UNWIRED IN PRODUCTION.
//
// `fanOut()` sweeps N workspaces, which reads like an invitation to host it once at app level.
// **It is not.** `recycleSession()` cannot be called without `relaunch` and
// `awaitFreshSessionId`, which are built from `ccPaneRef` / `ccSessionIdRef` — refs that exist
// only inside a mounted `Workspace`. An app-level host would have to reach into per-workspace
// refs it does not own.
//
// So each `Workspace` supervises **itself** via `fireOne`, and `fanOut` remains correct, tested,
// and unwired — the N-workspace shape for a future host that has N recycle contexts.
// ⚠️ **Do NOT "fix" the unused export by wiring `fanOut` at app level.** It would compile, and
// the recycle branch would then have no way to act.
//
// ⚠️ **ACCEPTED COST (recorded, not a gap):** supervision is per-MOUNTED-workspace, so a
// workspace whose webview is gone is not supervised. That is the SAME cost ruling R-4 already
// recorded ("the supervisor stops when the webview is gone"), not a new one — a workspace with
// no webview has no PTY to inject into anyway.
//
// ⚠️ **THE GATE IS CHECKED INSIDE THE CALLBACK, NOT AROUND THE SUBSCRIPTION.** `useTurnEnd`
// subscribes unconditionally and filters inside, so hook order cannot depend on `enabled`.

import { useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTurnEnd } from "./turnEnd";
import {
  fireOne,
  type FanOutOutcome,
  type SupervisedWorkspace,
} from "./fanOut";
import { FireLedger } from "./verdict";
import { parseWip, type ParsedWip } from "./wipPhases";
import type { TranscriptTail } from "./transcript";
import type { DriveMode } from "../workflowMachine/policy";
import { injectCommand } from "../../components/workspace/autoResumeFire";

/** The shape Rust's `wip_read` command returns. */
interface WipRead {
  path: string | null;
  text: string;
}

/**
 * Everything the host needs from its `Workspace`.
 *
 * ⚠️ Refs rather than values throughout: the turn-end callback is registered once and would
 * otherwise close over a frozen snapshot of the session id and drive mode. This is the same
 * reason `fireRecycle` polls `ccSessionIdRef` instead of capturing at click time.
 */
export interface SupervisorHost {
  readonly workspaceId: string;
  readonly projectPath: string;
  /** Whether the M10.9 workflow-features gate is ON. Supervision is off entirely when false. */
  readonly enabled: boolean;
  /** The project's STORED drive mode (R-1's authority). `null` → not supervised. */
  readonly storedModeRef: React.RefObject<DriveMode | null>;
  /** The live PTY/CC session id, mirrored into a ref. */
  readonly ccSessionIdRef: React.RefObject<string | null>;
  /**
   * Perform the context-pressure recycle for this workspace.
   *
   * ⚠️ Supplied by the caller because `recycleSession()` needs caller-owned React state. This
   * hook decides; the component acts.
   */
  readonly onRecycle: (info: RecycleRequest) => void;
  /** Diagnostic sink. Defaults to `console.warn`. */
  readonly warn?: (message: string) => void;
}

/** What the supervisor concluded when it decided to recycle. */
export interface RecycleRequest {
  readonly edgeId: string;
  /** The skill that was deferred — what the fresh session resumes into. */
  readonly skill: string;
  readonly tokens: number;
}

/**
 * Read and parse a workspace's active WIP file.
 *
 * ⚠️ Returns `null` on any failure rather than throwing: an unreadable WIP must degrade to
 * "chain as usual", never to a recycle and never to a dead sweep.
 */
export async function readWipFor(
  projectPath: string,
): Promise<ParsedWip | null> {
  const res = await invoke<WipRead>("wip_read", { projectPath });
  return parseWip(res?.text ?? null);
}

/**
 * Supervise this workspace: on every turn end, decide whether to chain, recycle, or do nothing.
 *
 * ⚠️ **THE LEDGER IS PER-WORKSPACE AND LIVES ACROSS TURNS.** Held in a ref so the same instance
 * is reused for the life of the mount — a ledger recreated per turn would remember nothing and
 * the idempotency guard (`already-fired-for-this-turn`) would never fire, double-injecting every
 * turn the supervisor sees twice.
 */
export function useSupervisor(host: SupervisorHost): void {
  const ledgerRef = useRef<FireLedger | null>(null);
  if (ledgerRef.current === null) ledgerRef.current = new FireLedger();

  const onTurnEnd = useCallback(async () => {
    const warn = host.warn ?? ((m: string) => console.warn(m));
    // ⚠️ Re-checked HERE rather than only in `useTurnEnd`'s `enabled`: the gate can flip while a
    // turn is in flight, and the fire is the irreversible half.
    if (!host.enabled) return;

    const storedMode = host.storedModeRef.current;
    // ⚠️ A project with no stored mode is not supervised (R-1, opt-in). `decideVerdict` also
    // refuses it — this is the cheap early exit, not the guard.
    if (storedMode === null) return;

    const ptySessionId = host.ccSessionIdRef.current;
    if (!ptySessionId) return;

    const workspace: SupervisedWorkspace = {
      workspaceId: host.workspaceId,
      sessionId: ptySessionId,
      projectPath: host.projectPath,
      storedMode,
      ptySessionId,
    };

    let outcome: FanOutOutcome;
    try {
      outcome = await fireOne(workspace, {
        readTail: async (w) =>
          invoke<TranscriptTail>("transcript_tail", {
            projectPath: w.projectPath,
            sessionId: w.sessionId,
          }),
        // ⚠️ The label is forwarded THROUGH as `injectCommand`'s 4th argument (the 3rd is
        // `onIpcError`, left undefined). Dropping it would fall back to the `"auto-resume"`
        // default and point every supervisor failure at M12's arm instead of this one.
        inject: async (pty, command, label) =>
          injectCommand(pty, command, undefined, label),
        readWip: async (w) => readWipFor(w.projectPath),
        adjudicator: {
          // ⚠️ **`model` IS FORWARDED FROM `adjudicate`, NOT CHOSEN HERE — and `deps.model` is
          // deliberately NOT set.** `assertPinnedModel` checks any supplied model before every
          // adjudication, so plumbing one through from config would produce a LOUD failure
          // rather than a silent downgrade (R-6 condition 1). Leaving it unset lets the module's
          // own `ADJUDICATOR_MODEL` pin be the single source of truth; the Rust command takes
          // the model as a parameter precisely so the pin is not duplicated backend-side.
          run: async ({ model, prompt, timeoutMs }) =>
            invoke<string>("supervisor_adjudicate", {
              model,
              prompt,
              timeoutMs,
            }),
          warn,
        },
        ledger: ledgerRef.current as FireLedger,
      });
    } catch (e) {
      // ⚠️ `fireOne` already isolates its own failures; this catch exists so a throw from the
      // invoke bridge cannot escape into React's event handler and blank the workspace.
      warn(`supervisor: sweep threw for ${host.workspaceId} — ${String(e)}`);
      return;
    }

    // ⚠️ The recycle is handed to the CALLER. This hook never calls `recycleSession` itself —
    // see the module header for why that is structural, not stylistic.
    if (outcome.recycle) host.onRecycle(outcome.recycle);
  }, [host]);

  useTurnEnd({
    enabled: host.enabled,
    workspaceId: host.workspaceId,
    onTurnEnd: () => {
      void onTurnEnd();
    },
  });
}
