// @vitest-environment jsdom
//
// The supervisor activity record's FUNNEL, driven on a live `useSupervisor` mount: a real
// `workspace-status` turn-end event goes through `useTurnEnd` → `onTurnEnd` → `decideTurn` →
// the real `fireOne`, with IPC answered by `mockIPC`. It pins AC-1: while the gate is ON, every
// turn end yields EXACTLY ONE record, whatever exit it took; with the gate OFF, none.
//
// ⚠️ Each exit is asserted by its REASON and its OUTCOME, never by a count alone: "one record
// was written" would pass a funnel that records the wrong exit (`source-text-guards.md`,
// entry 15, a length standing in for an identity).

import { afterEach, describe, expect, it } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import {
  useSupervisor,
  type RecycleRequest,
  type RecycleStatus,
  type SupervisorHost,
} from "../useSupervisor";
import type { ActivityRecord } from "../activityRecord";
import type { DriveMode } from "../../workflowMachine/policy";
import type { TranscriptTail } from "../transcript";
import { RECYCLE_TOKEN_THRESHOLD } from "../contextPressure";
import { WORKSPACE_STATUS_EVENT } from "../../workspaceStatus";
import {
  claimOrigin,
  resetOrigins,
  type SupervisorOrigin,
} from "../turnOrigin";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** A turn that emitted `edgeId` and did not chain (the `fanOut.test.ts` shape). */
const tailFor = (edgeId: string, tokens?: number): TranscriptTail => ({
  path: "/t/a.jsonl",
  lines: [
    JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "text", text: `All done.\n\nTRANSITION: ${edgeId}` }],
        ...(tokens === undefined
          ? {}
          : {
              usage: {
                input_tokens: tokens,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
              },
            }),
      },
    }),
  ],
});

/** A feature WIP at a non-final boundary, the shape that allows a recycle. */
const WIP_AT_BOUNDARY = {
  path: "/p/workflow-system/state/wip/f.md",
  text: "**Workflow:** feature\n- [x] Phase 1: done\n- [ ] Phase 2: open",
};

interface Setup {
  enabled?: boolean;
  supervisorEnabled?: boolean | null;
  storedMode?: DriveMode | null;
  ptySessionId?: string | null;
  tail?: () => TranscriptTail;
  wip?: { path: string | null; text: string };
  injectFails?: boolean;
  /** Turn attribution: claim the origin inside the `cc_input` handler (default true). */
  claimAtInject?: boolean;
  unsentInput?: boolean;
  onRecycle?: (info: RecycleRequest) => RecycleStatus;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const records: ActivityRecord[] = [];
const injected: string[] = [];
const recycles: RecycleRequest[] = [];
/** Turn attribution: the origin a turn start would claim AT THE MOMENT `cc_input` arrives. */
let originAtInject: SupervisorOrigin | null | undefined;

function Harness({ setup }: { setup: Setup }) {
  const storedModeRef = useRef<DriveMode | null>(
    setup.storedMode === undefined ? "autopilot" : setup.storedMode,
  );
  const supervisorEnabledRef = useRef<boolean | null>(
    setup.supervisorEnabled === undefined ? true : setup.supervisorEnabled,
  );
  const ccSessionIdRef = useRef<string | null>(
    setup.ptySessionId === undefined ? "pty-1" : setup.ptySessionId,
  );
  const host: SupervisorHost = {
    workspaceId: "ws-1",
    projectPath: "/p",
    enabled: setup.enabled ?? true,
    storedModeRef,
    supervisorEnabledRef,
    ccSessionIdRef,
    hasUnsentInput: () => setup.unsentInput === true,
    onRecycle: (info) => {
      recycles.push(info);
      return setup.onRecycle ? setup.onRecycle(info) : "started";
    },
    warn: () => {},
    record: (r) => {
      records.push(r);
    },
    appVersion: async () => "9.9.9",
    now: () => 1_000,
  };
  useSupervisor(host);
  return null;
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

async function mount(setup: Setup = {}) {
  records.length = 0;
  injected.length = 0;
  recycles.length = 0;
  mockWindows("main");
  mockIPC(
    (cmd, args) => {
      if (cmd === "transcript_tail") {
        if (!setup.tail) throw new Error("transcript read failed");
        return setup.tail();
      }
      if (cmd === "wip_read") return setup.wip ?? { path: null, text: "" };
      if (cmd === "supervisor_adjudicate") return "PROCEED";
      if (cmd === "cc_input") {
        // Claim here, as the turn start this injection produces would: it proves the origin was
        // armed BEFORE the invoke, not after it resolved.
        if (setup.claimAtInject !== false)
          originAtInject = claimOrigin("ws-1", 1_040);
        if (setup.injectFails) throw new Error("no such session");
        injected.push(String((args as { data: string }).data));
        return null;
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<Harness setup={setup} />));
  await settle();
}

/** Push one turn-end status event for `ws-1`, as the Rust broadcaster does. */
async function turnEnd(sessionId: string | null = "cc-1") {
  await act(async () => {
    await emit(WORKSPACE_STATUS_EVENT, {
      workspace_id: "ws-1",
      state: "idle",
      is_turn_end: true,
      ...(sessionId === null ? {} : { session_id: sessionId }),
    });
  });
  await settle();
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  clearMocks();
  resetOrigins();
  originAtInject = undefined;
});

describe("AC-1: exactly one record per turn end, one per exit", () => {
  it("fired: records the command, edge, mode and transcript, with no reason", async () => {
    await mount({ tail: () => tailFor("F5") });
    await turnEnd();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      v: 1,
      ts: 1_000,
      appVersion: "9.9.9",
      workspaceId: "ws-1",
      projectPath: "/p",
      sessionId: "cc-1",
      outcome: "fired",
      reason: null,
      command: "/feature-plan",
      edgeId: "F5",
      mode: "autopilot",
      transcriptPath: "/t/a.jsonl",
    });
    // Positive control for the instrument: the fire really reached the PTY.
    expect(injected).toHaveLength(1);
  });

  it.each([
    ["supervisor-toggled-off", { supervisorEnabled: false }],
    ["no-stored-mode", { storedMode: null }],
    ["no-pty-session", { ptySessionId: null }],
  ] as const)(
    "the silent early return %s is now recorded as a withhold",
    async (reason, over) => {
      await mount({ tail: () => tailFor("F5"), ...over });
      await turnEnd();
      expect(records.map((r) => [r.outcome, r.reason])).toEqual([
        ["withheld", reason],
      ]);
      expect(injected).toEqual([]);
    },
  );

  it("⚠️ a not-yet-loaded toggle (null) is ON: it proceeds and fires", async () => {
    await mount({ tail: () => tailFor("F5"), supervisorEnabled: null });
    await turnEnd();
    expect(records.map((r) => r.outcome)).toEqual(["fired"]);
  });

  it("transcript-unreadable: a failed read is a withhold, not a lost turn", async () => {
    await mount({ tail: undefined });
    await turnEnd();
    expect(records.map((r) => [r.outcome, r.reason])).toEqual([
      ["withheld", "transcript-unreadable"],
    ]);
  });

  it("no-transcript: an empty session file", async () => {
    await mount({ tail: () => ({ path: null, lines: [] }) });
    await turnEnd();
    expect(records.map((r) => r.reason)).toEqual(["no-transcript"]);
  });

  it("no-verdict: carries the transcript path it read", async () => {
    await mount({
      tail: () => ({
        path: "/t/b.jsonl",
        lines: [
          JSON.stringify({
            type: "assistant",
            message: { content: [{ type: "text", text: "Just chatting." }] },
          }),
        ],
      }),
    });
    await turnEnd();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      outcome: "withheld",
      reason: "no-verdict",
      transcriptPath: "/t/b.jsonl",
    });
  });

  it("policy-not-auto: carries the edge and the verdict's detail", async () => {
    // F3 (spec → research) is a PAUSE in autopilot.
    await mount({ tail: () => tailFor("F3") });
    await turnEnd();
    expect(records).toHaveLength(1);
    expect(records[0].outcome).toBe("withheld");
    expect(records[0].reason).toBe("policy-not-auto");
    expect(records[0].edgeId).toBe("F3");
    expect(records[0].detail).toEqual(expect.any(String));
  });

  it("unsent-input-present", async () => {
    await mount({ tail: () => tailFor("F5"), unsentInput: true });
    await turnEnd();
    expect(records.map((r) => [r.outcome, r.reason])).toEqual([
      ["withheld", "unsent-input-present"],
    ]);
    expect(injected).toEqual([]);
  });

  it("⚠️ inject-failed: a rejected cc_input is an ERROR, never recorded as fired", async () => {
    // `injectCommand` swallows a rejected `cc_input`; the supervisor's wiring re-throws from
    // `onIpcError` so the failure reaches `fireOne`. Without that, this recorded `fired`.
    await mount({ tail: () => tailFor("F5"), injectFails: true });
    await turnEnd();
    expect(records.map((r) => [r.outcome, r.reason])).toEqual([
      ["error", "inject-failed"],
    ]);
  });

  it("already-fired-for-this-turn: the same turn twice is two records, one fire", async () => {
    await mount({ tail: () => tailFor("F5") });
    await turnEnd();
    await turnEnd();
    expect(records.map((r) => [r.outcome, r.reason])).toEqual([
      ["fired", null],
      ["withheld", "already-fired-for-this-turn"],
    ]);
  });

  it.each([
    ["started", "recycle-started"],
    ["declined", "recycle-declined"],
  ] as const)(
    "recycle %s: the caller's status is the recorded outcome",
    async (status, outcome) => {
      await mount({
        tail: () => tailFor("F5", RECYCLE_TOKEN_THRESHOLD + 1),
        wip: WIP_AT_BOUNDARY,
        onRecycle: () => status,
      });
      await turnEnd();
      expect(recycles).toHaveLength(1);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        outcome,
        reason: "context-pressure-recycle",
        command: "/feature-plan",
        tokens: RECYCLE_TOKEN_THRESHOLD + 1,
      });
      expect(injected).toEqual([]);
    },
  );

  it("a throwing onRecycle is still recorded, as sweep-threw", async () => {
    await mount({
      tail: () => tailFor("F5", RECYCLE_TOKEN_THRESHOLD + 1),
      wip: WIP_AT_BOUNDARY,
      onRecycle: () => {
        throw new Error("boom");
      },
    });
    await turnEnd();
    expect(records.map((r) => [r.outcome, r.reason])).toEqual([
      ["error", "sweep-threw"],
    ]);
  });

  it("a turn-end event without a session id records sessionId null", async () => {
    await mount({ tail: () => tailFor("F5") });
    await turnEnd(null);
    expect(records.map((r) => r.sessionId)).toEqual([null]);
  });
});

describe("AC-7: with the gate OFF nothing is recorded", () => {
  it("writes no record, even for a turn that would fire", async () => {
    await mount({ tail: () => tailFor("F5"), enabled: false });
    await turnEnd();
    expect(records).toEqual([]);
    expect(injected).toEqual([]);
  });

  it("positive control: the identical setup with the gate ON records one", async () => {
    await mount({ tail: () => tailFor("F5"), enabled: true });
    await turnEnd();
    expect(records).toHaveLength(1);
  });
});

describe("turn attribution: the supervisor arms an origin for the turn it starts", () => {
  it("⚠️ a fire arms the origin BEFORE cc_input, carrying the command it injects", async () => {
    await mount({ tail: () => tailFor("F5") });
    await turnEnd();
    // The turn start trails the invoke by ~40 ms (the P3.1 probe), so an origin armed only after
    // the invoke resolved could be missed. Claimed from inside the `cc_input` handler.
    expect(originAtInject).toEqual({
      command: "/feature-plan",
      firedAt: 1_000,
    });
    expect(injected).toHaveLength(1);
  });

  it("a successful fire left unclaimed stays pending for the next turn start", async () => {
    // The positive control for the failure test below: the same fire, not claimed at inject time,
    // IS still claimable afterwards. So a `null` there comes from the disarm, not from never arming.
    await mount({ tail: () => tailFor("F5"), claimAtInject: false });
    await turnEnd();
    expect(claimOrigin("ws-1", 1_040)?.command).toBe("/feature-plan");
  });

  it("⚠️ a FAILED injection disarms: no turn is attributed to a command CC never received", async () => {
    await mount({
      tail: () => tailFor("F5"),
      injectFails: true,
      claimAtInject: false,
    });
    await turnEnd();
    expect(records.map((r) => r.reason)).toEqual(["inject-failed"]);
    expect(claimOrigin("ws-1", 1_040)).toBeNull();
  });

  it("a withhold arms nothing", async () => {
    await mount({ tail: () => tailFor("F3") });
    await turnEnd();
    expect(originAtInject).toBeUndefined();
    expect(claimOrigin("ws-1", 1_040)).toBeNull();
  });
});
