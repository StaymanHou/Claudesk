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

import { resetTurnEnds } from "../turnEndDedupe";
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

/** A closed turn that emitted `edgeId` and did not chain (the `fanOut.test.ts` shape). */
const tailFor = (edgeId: string, tokens?: number): TranscriptTail => ({
  path: "/t/a.jsonl",
  lines: [
    JSON.stringify({
      type: "assistant",
      message: {
        stop_reason: "end_turn",
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
  /** The workspace this `useSupervisor` instance serves (default `ws-1`, project `/p`). */
  workspaceId?: string;
  projectPath?: string;
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
/** Every `transcript_tail` invoke's arguments, in order. */
const tailArgs: Record<string, unknown>[] = [];
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
    workspaceId: setup.workspaceId ?? "ws-1",
    projectPath: setup.projectPath ?? "/p",
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

/**
 * Mount `setup` (it owns the IPC mock) plus one more live `useSupervisor` instance per entry in
 * `extra`, each with its own host and refs, as a second mounted workspace subtree would have.
 */
async function mount(setup: Setup = {}, extra: Setup[] = []) {
  records.length = 0;
  injected.length = 0;
  tailArgs.length = 0;
  recycles.length = 0;
  mockWindows("main");
  mockIPC(
    (cmd, args) => {
      if (cmd === "transcript_tail") {
        tailArgs.push(args as Record<string, unknown>);
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
  await act(async () =>
    root!.render(
      <>
        <Harness setup={setup} />
        {extra.map((e, i) => (
          <Harness key={i} setup={{ ...setup, ...e }} />
        ))}
      </>,
    ),
  );
  await settle();
}

/** Push one turn-end status event for `workspaceId`, as the Rust broadcaster does. */
async function turnEnd(
  sessionId: string | null = "cc-1",
  lastEventAt?: number,
  workspaceId = "ws-1",
) {
  await act(async () => {
    await emit(WORKSPACE_STATUS_EVENT, {
      workspace_id: workspaceId,
      state: "idle",
      is_turn_end: true,
      ...(sessionId === null ? {} : { session_id: sessionId }),
      ...(lastEventAt === undefined ? {} : { last_event_at: lastEventAt }),
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
  resetTurnEnds();
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
            message: {
              stop_reason: "end_turn",
              content: [{ type: "text", text: "Just chatting." }],
            },
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

describe("the transcript read names the right session twice over", () => {
  // `sessionId` picks the file (`<id>.jsonl`), so it must be CC's id from the hook, not the PTY
  // id, which names no file. `ptySessionId` picks the config root by the LIVE profile.
  it("passes the hook's CC session id as sessionId and the PTY id as ptySessionId", async () => {
    await mount({ tail: () => tailFor("F5") });
    await turnEnd("cc-7");
    expect(tailArgs).toEqual([
      { projectPath: "/p", sessionId: "cc-7", ptySessionId: "pty-1" },
    ]);
  });

  it("a turn end with no CC session id reads with sessionId null, never the PTY id", async () => {
    await mount({ tail: () => tailFor("F5") });
    await turnEnd(null);
    expect(tailArgs).toEqual([
      { projectPath: "/p", sessionId: null, ptySessionId: "pty-1" },
    ]);
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

// ⚠️ silent-supervisor Phase 1 — THE CONSUMING SURFACE, end to end. `fireOne` is reached only
// through this hook in production, so the flush race and turn scoping are driven here through
// the real `useSupervisor` → `decideTurn` → `fireOne` chain, with the real `transcript_tail`
// IPC shape and the real (unmocked) re-read sleep.
describe("silent-supervisor: the transcript lags the turn end", () => {
  const prompt = JSON.stringify({
    type: "user",
    message: { role: "user", content: "/feature-build" },
  });
  const closed = (text: string) =>
    JSON.stringify({
      type: "assistant",
      message: { stop_reason: "end_turn", content: [{ type: "text", text }] },
    });

  /** Settle long enough for a few 100 ms re-reads. */
  async function settleReReads() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
    });
  }

  it("waits for the turn's final line, then fires THIS turn's verdict (was: no-verdict)", async () => {
    let reads = 0;
    await mount({
      tail: () => {
        reads += 1;
        // The first two reads land before CC flushes the final line, as measured live.
        return {
          path: "/t/race.jsonl",
          lines:
            reads <= 2
              ? [prompt]
              : [prompt, closed("Built.\n\nTRANSITION: F8")],
        };
      },
    });
    await turnEnd();
    await settleReReads();

    expect(reads).toBe(3);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      outcome: "fired",
      edgeId: "F8",
      command: "/feature-verify-auto",
    });
    expect(injected).toHaveLength(1);
  });

  it("never fires a verdict from before the operator's latest message (AC-3b)", async () => {
    await mount({
      tail: () => ({
        path: "/t/scoped.jsonl",
        lines: [
          closed("Built.\n\nTRANSITION: F8"),
          JSON.stringify({
            type: "user",
            message: { role: "user", content: "wait, what does F8 mean?" },
          }),
          closed("F8 is build to verify-auto."),
        ],
      }),
    });
    await turnEnd();

    expect(records.map((r) => [r.outcome, r.reason, r.edgeId])).toEqual([
      ["withheld", "no-verdict", null],
    ]);
    expect(injected).toEqual([]);
  });
});

// ⚠️ silent-supervisor AC-4 — ONE DECISION PER `Stop`. The 2026-09-25 duplicate could not be
// reproduced, so the funnel is guarded on the EVENT itself: the same `(workspace_id,
// last_event_at)` delivered twice is decided once, and the repeat is recorded as what it is.
describe("silent-supervisor: a turn end delivered twice", () => {
  const counting = () => {
    const calls = { n: 0 };
    return {
      calls,
      tail: () => {
        calls.n += 1;
        return tailFor("F5");
      },
    };
  };

  it("the SAME event twice: one decision, and the repeat recorded as duplicate-turn-end", async () => {
    const t = counting();
    await mount({ tail: t.tail });
    await turnEnd("cc-1", 1_790_000_000_001);
    await turnEnd("cc-1", 1_790_000_000_001);

    expect(records.map((r) => [r.outcome, r.reason])).toEqual([
      ["fired", null],
      ["withheld", "duplicate-turn-end"],
    ]);
    expect(t.calls.n).toBe(1);
    expect(injected).toHaveLength(1);
  });

  it("two DIFFERENT events are each decided (the key is the event, not the workspace)", async () => {
    const t = counting();
    await mount({ tail: t.tail });
    await turnEnd("cc-1", 1_790_000_000_001);
    await turnEnd("cc-1", 1_790_000_000_002);

    expect(t.calls.n).toBe(2);
    expect(records.map((r) => r.reason)).toEqual([
      null,
      "already-fired-for-this-turn",
    ]);
  });

  it("an event without `last_event_at` is never deduplicated", async () => {
    const t = counting();
    await mount({ tail: t.tail });
    await turnEnd("cc-1");
    await turnEnd("cc-1");

    expect(t.calls.n).toBe(2);
    expect(records.map((r) => r.reason)).not.toContain("duplicate-turn-end");
  });

  it("⚠️ TWO live instances for one workspace, ONE broadcast `Stop`: one decision, one fire", async () => {
    // The shape that reproduced live in `ws-1` (a leaked, still-subscribed second instance): each
    // instance receives the single event once. Only the MODULE-level claim sees both, since each
    // instance has its own ledger and refs.
    const t = counting();
    await mount({ tail: t.tail }, [{}]);
    await turnEnd("cc-1", 1_790_000_000_001);

    expect(records.map((r) => [r.outcome, r.reason]).sort()).toEqual([
      ["fired", null],
      ["withheld", "duplicate-turn-end"],
    ]);
    expect(t.calls.n).toBe(1);
    expect(injected).toHaveLength(1);
  });

  it("two supervised workspaces with the SAME `last_event_at`: each is decided, under its own project", async () => {
    const t = counting();
    await mount({ tail: t.tail }, [{ workspaceId: "ws-3", projectPath: "/q" }]);
    await turnEnd("cc-1", 1_790_000_000_001, "ws-1");
    await turnEnd("cc-3", 1_790_000_000_001, "ws-3");

    expect(t.calls.n).toBe(2);
    expect(
      records.map((r) => [r.workspaceId, r.projectPath, r.outcome, r.reason]),
    ).toEqual([
      ["ws-1", "/p", "fired", null],
      ["ws-3", "/q", "fired", null],
    ]);
    expect(injected).toHaveLength(2);
  });

  it("with the gate OFF a duplicate writes nothing either", async () => {
    const t = counting();
    await mount({ enabled: false, tail: t.tail });
    await turnEnd("cc-1", 1_790_000_000_001);
    await turnEnd("cc-1", 1_790_000_000_001);

    expect(records).toEqual([]);
    expect(t.calls.n).toBe(0);
  });
});
