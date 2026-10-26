// @vitest-environment jsdom
//
// M16.5 WP4 Phase 3 — the verify-human pause read and its wiring at the turn-end handler.
//
// The pure half (`endsAtVerifyHuman`, `mayPromote`) is asserted as values. The wiring half
// drives a LIVE `useSupervisor` mount: a real `workspace-status` turn-end event goes through
// `useTurnEnd` → `onTurnEnd`, with IPC answered by `mockIPC`, and the `workspace_status_promote`
// call is captured as a VALUE (`[[ts-arity-flexible-assignability-hides-a-widened-param]]`).

import { afterEach, describe, expect, it } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { useSupervisor, type SupervisorHost } from "../useSupervisor";
import { resetTurnEnds } from "../turnEndDedupe";
import { resetOrigins } from "../turnOrigin";
import type { TranscriptLine, TranscriptTail } from "../transcript";
import { WORKSPACE_STATUS_EVENT } from "../../workspaceStatus";
import {
  endsAtVerifyHuman,
  lastSkillInvocation,
  mayPromote,
  SessionSkillMemo,
} from "../verifyHumanPause";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Derived from the host rather than imported from `workflowMachine/`, whose importer
// population is pinned (`workflowMachineFunnel.test.ts`).
type DriveMode = NonNullable<SupervisorHost["storedModeRef"]["current"]>;

// ---- transcript line builders (the shapes CC writes) ----

const skillCall = (skill: string, sidechain = false): TranscriptLine => ({
  type: "assistant",
  ...(sidechain ? { isSidechain: true } : {}),
  message: {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", name: "Skill", input: { skill } }],
  },
});
const commandLine = (name: string): TranscriptLine => ({
  type: "user",
  message: {
    role: "user",
    content: `<command-message>${name}</command-message>\n<command-name>/${name}</command-name>`,
  },
});
const prose = (text: string): TranscriptLine => ({
  type: "user",
  message: { role: "user", content: text },
});
const endTurn = (text: string): TranscriptLine => ({
  type: "assistant",
  message: { stop_reason: "end_turn", content: [{ type: "text", text }] },
});

describe("endsAtVerifyHuman — the session's most recent skill invocation", () => {
  it("a Skill call into feature-verify-human → true", () => {
    expect(
      endsAtVerifyHuman([
        skillCall("feature-verify-human"),
        endTurn("checklist"),
      ]),
    ).toBe(true);
  });

  it("a later Skill call moves on → false", () => {
    expect(
      endsAtVerifyHuman([
        skillCall("feature-verify-human"),
        skillCall("feature-verify-codify"),
        endTurn("codified"),
      ]),
    ).toBe(false);
  });

  it("a typed or injected /feature-verify-human command line → true", () => {
    expect(
      endsAtVerifyHuman([
        commandLine("feature-verify-human"),
        endTurn("checklist"),
      ]),
    ).toBe(true);
  });

  it("a later command line of another command → false", () => {
    expect(
      endsAtVerifyHuman([
        skillCall("feature-verify-human"),
        commandLine("session-handoff"),
        endTurn("handed off"),
      ]),
    ).toBe(false);
  });

  it("⚠️ SESSION-scoped: the skill call sits in an EARLIER turn of a multi-turn checklist → true", () => {
    expect(
      endsAtVerifyHuman([
        skillCall("feature-verify-human"),
        endTurn("item 1?"),
        prose("pass"),
        endTurn("recorded; item 2?"),
      ]),
    ).toBe(true);
  });

  it("a subagent's Skill call does not move the main conversation", () => {
    const lines = [
      skillCall("feature-verify-human"),
      skillCall("feature-build", true),
      endTurn("checklist"),
    ];
    expect(lastSkillInvocation(lines)).toBe("feature-verify-human");
    expect(endsAtVerifyHuman(lines)).toBe(true);
  });

  it("no invocation in the tail → false (today's colour, the safe direction)", () => {
    expect(endsAtVerifyHuman([prose("hi"), endTurn("hello")])).toBe(false);
    expect(endsAtVerifyHuman([])).toBe(false);
  });
});

// ⚠️ The read is keyed on the INVOCATION, never on the turn's `TRANSITION:` token. See the module
// header ("NOT KEYED ON THE TURN'S EXIT TOKEN") for the measurement that ruled a token rule out.
// These cases pin that, so a well-meant "no blue after F11/F12/F13" has to fail here first.
describe("endsAtVerifyHuman — exit tokens do not decide it (P3.verify-human.0)", () => {
  it("auto-skip that chains in the same turn → false (the measured shape: 2 of 2)", () => {
    expect(
      endsAtVerifyHuman([
        skillCall("feature-verify-human"),
        endTurn(
          "Nothing here needs you — advanced per drive_mode=autopilot.\n\nTRANSITION: F11",
        ),
        skillCall("feature-verify-codify"),
        endTurn("codified"),
      ]),
    ).toBe(false);
  });

  it("⚠️ an exit token followed by a question still reads as a pause → true", () => {
    expect(
      endsAtVerifyHuman([
        skillCall("feature-verify-human"),
        endTurn(
          "TRANSITION: F13\n\nBefore I continue: want me to run verify-codify now, and stop there for your go-ahead?",
        ),
      ]),
    ).toBe(true);
  });

  it("⚠️ a token QUOTED inside a checklist still reads as a pause → true", () => {
    expect(
      endsAtVerifyHuman([
        skillCall("feature-verify-human"),
        endTurn(
          "I'm still not emitting `TRANSITION: F13` — reply pass/fail per item.",
        ),
      ]),
    ).toBe(true);
  });

  it("ACCEPTED COST: an exit token followed by a bare stop reads blue (1 of 324 measured) → true", () => {
    expect(
      endsAtVerifyHuman([
        skillCall("feature-verify-human"),
        endTurn("TRANSITION: F13\n\nNext: `/feature-verify-codify`."),
      ]),
    ).toBe(true);
  });
});

describe("mayPromote — never after a fire or a started recycle", () => {
  it.each([
    [{ outcome: "fired", reason: null }, false],
    [{ outcome: "recycle-started", reason: null }, false],
    [{ outcome: "withheld", reason: "duplicate-turn-end" }, false],
    [{ outcome: "withheld", reason: "no-verdict" }, true],
    [{ outcome: "withheld", reason: "supervisor-toggled-off" }, true],
    [{ outcome: "recycle-declined", reason: null }, true],
    [{ outcome: "error", reason: "sweep-threw" }, true],
  ] as const)("%o → %s", (decision, expected) => {
    expect(mayPromote(decision as Parameters<typeof mayPromote>[0])).toBe(
      expected,
    );
  });
});

// ---- the live wiring ----

const VH_TAIL: TranscriptTail = {
  path: "/t/a.jsonl",
  lines: [
    commandLine("feature-verify-human"),
    endTurn("## Manual Verification"),
  ].map((l) => JSON.stringify(l)),
};
const OTHER_TAIL: TranscriptTail = {
  path: "/t/a.jsonl",
  lines: [commandLine("feature-build"), endTurn("built")].map((l) =>
    JSON.stringify(l),
  ),
};

interface Setup {
  enabled?: boolean;
  supervisorEnabled?: boolean | null;
  storedMode?: DriveMode | null;
  ptySessionId?: string | null;
  tail?: TranscriptTail;
  /** Successive tails, one per read (the last repeats). Overrides `tail`. */
  tails?: TranscriptTail[];
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let turnEnds = 0;
let currentSetup: Setup = {};
const promotes: Record<string, unknown>[] = [];
const injected: string[] = [];
const tailReads: Record<string, unknown>[] = [];

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
    hasUnsentInput: () => false,
    onRecycle: () => "started",
    warn: () => {},
    record: () => {},
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
  promotes.length = 0;
  tailReads.length = 0;
  injected.length = 0;
  turnEnds = 0;
  currentSetup = setup;
  mockWindows("main");
  mockIPC(
    (cmd, args) => {
      if (cmd === "transcript_tail") {
        tailReads.push(args as Record<string, unknown>);
        if (setup.tails) {
          // The supervisor's own read and this read both hit `transcript_tail` once per turn
          // end, so advance by turn end, not by call.
          const i = Math.min(turnEnds - 1, setup.tails.length - 1);
          return setup.tails[Math.max(i, 0)];
        }
        return setup.tail ?? VH_TAIL;
      }
      if (cmd === "workspace_status_promote") {
        promotes.push(args as Record<string, unknown>);
        return true;
      }
      if (cmd === "wip_read") return { path: null, text: "" };
      if (cmd === "supervisor_adjudicate") return "PROCEED";
      if (cmd === "cc_input") {
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

async function rerender(over: Setup) {
  currentSetup = { ...currentSetup, ...over };
  await act(async () => root!.render(<Harness setup={currentSetup} />));
  await settle();
}

async function turnEnd(lastEventAt: number | null = 777, sessionId = "cc-1") {
  turnEnds += 1;
  await act(async () => {
    await emit(WORKSPACE_STATUS_EVENT, {
      workspace_id: "ws-1",
      state: "idle",
      is_turn_end: true,
      session_id: sessionId,
      ...(lastEventAt === null ? {} : { last_event_at: lastEventAt }),
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
});

describe("the turn-end handler promotes a verify-human pause (gate ON)", () => {
  it("promotes with the Stop's own last_event_at and the workspace id", async () => {
    await mount();
    await turnEnd(777);
    expect(promotes).toEqual([{ workspaceId: "ws-1", stopEventAt: 777 }]);
    // The read went to CC's session, scoped by the live PTY's profile.
    expect(tailReads.at(-1)).toEqual({
      projectPath: "/p",
      sessionId: "cc-1",
      ptySessionId: "pty-1",
    });
  });

  it.each([
    [
      "the supervisor toggled OFF for this project",
      { supervisorEnabled: false },
    ],
    ["no stored drive mode (unsupervised)", { storedMode: null }],
  ] as const)(
    "⚠️ still promotes with %s — the dot does not depend on supervision",
    async (_n, over) => {
      await mount(over);
      await turnEnd(777);
      expect(promotes).toEqual([{ workspaceId: "ws-1", stopEventAt: 777 }]);
    },
  );

  it("⚠️ not after a FIRE: a turn the supervisor chains on never flashes blue", async () => {
    // F5 fires `/feature-plan` in autopilot (the `activityFunnel` precedent). ⚠️ An edge OUT of
    // verify-human (F13) would NOT do: verify-human is the matrix's one conditional cell, whose
    // fallback is PAUSE (`arch/workflow-supervisor.md` §C), so no fire would happen and the test
    // would prove nothing. The last skill is still verify-human, so only the decision gates it.
    const fired: TranscriptTail = {
      path: "/t/a.jsonl",
      lines: [
        commandLine("feature-verify-human"),
        endTurn("Done.\n\nTRANSITION: F5"),
      ].map((l) => JSON.stringify(l)),
    };
    await mount({ tail: fired });
    await turnEnd(777);
    // Positive control: the fire really happened.
    expect(injected.length).toBe(1);
    expect(promotes).toEqual([]);
  });

  it("not when the session's last skill is something else", async () => {
    await mount({ tail: OTHER_TAIL });
    await turnEnd(777);
    expect(promotes).toEqual([]);
    // Positive control: the read happened, so the refusal is the skill check, not a skip.
    expect(tailReads.length).toBeGreaterThan(0);
  });

  it("not without a Stop timestamp (nothing for the backend to compare against)", async () => {
    await mount();
    await turnEnd(null);
    expect(promotes).toEqual([]);
  });

  it("not without a live CC session", async () => {
    await mount({ ptySessionId: null });
    await turnEnd(777);
    expect(promotes).toEqual([]);
  });

  it("a duplicate delivery of the same Stop promotes only once", async () => {
    await mount();
    await turnEnd(777);
    await turnEnd(777);
    expect(promotes).toEqual([{ workspaceId: "ws-1", stopEventAt: 777 }]);
  });
});

describe("⚠️ the gate-OFF invariant at the funnel", () => {
  it("with the M10.9 gate OFF nothing is read and nothing is promoted", async () => {
    await mount({ enabled: false });
    await turnEnd(777);
    expect(promotes).toEqual([]);
    expect(tailReads).toEqual([]);
  });
});

describe("SessionSkillMemo — the last invocation outlives the 512 KiB tail window", () => {
  it("a tail with no invocation falls back to the session's last one; a new one replaces it", () => {
    const memo = new SessionSkillMemo();
    expect(memo.resolve("s1", "feature-verify-human", true)).toBe(
      "feature-verify-human",
    );
    expect(memo.resolve("s1", null, true)).toBe("feature-verify-human");
    expect(memo.resolve("s1", "feature-verify-codify", true)).toBe(
      "feature-verify-codify",
    );
    expect(memo.resolve("s1", null, true)).toBe("feature-verify-codify");
  });

  it("⚠️ a window that misses the turn's own start forgets the memo (it could have lost a skill)", () => {
    const memo = new SessionSkillMemo();
    memo.resolve("s1", "feature-verify-human", true);
    expect(memo.resolve("s1", null, false)).toBeNull();
    // ...and it stays forgotten, even once the turn start is back in view.
    expect(memo.resolve("s1", null, true)).toBeNull();
  });

  it("is per session, and without a session id the tail alone decides", () => {
    const memo = new SessionSkillMemo();
    memo.resolve("s1", "feature-verify-human", true);
    expect(memo.resolve("s2", null, true)).toBeNull();
    expect(memo.resolve(null, null, true)).toBeNull();
    memo.clear();
    expect(memo.resolve("s1", null, true)).toBeNull();
  });
});

/** A turn whose tail holds no skill invocation: the checklist outgrew the window. */
const NO_INVOCATION_TAIL: TranscriptTail = {
  path: "/t/a.jsonl",
  lines: [prose("pass"), endTurn("Recorded. Item 2?")].map((l) =>
    JSON.stringify(l),
  ),
};

/** A huge turn: the window holds only its tail end, with no user prose and no invocation. */
const HUGE_TURN_TAIL: TranscriptTail = {
  path: "/t/a.jsonl",
  lines: [endTurn("Three agents are still running.")].map((l) =>
    JSON.stringify(l),
  ),
};

describe("the memo at the turn-end handler (live mount)", () => {
  it("⚠️ a turn too big for the window does NOT inherit an old verify-human (no false blue)", async () => {
    await mount({ tails: [VH_TAIL, HUGE_TURN_TAIL, NO_INVOCATION_TAIL] });
    await turnEnd(1);
    await turnEnd(2);
    await turnEnd(3);
    // Turn 2 forgot the memo, so turn 3 (start in view, no invocation) has nothing to inherit.
    expect(promotes).toEqual([{ workspaceId: "ws-1", stopEventAt: 1 }]);
  });

  it("⚠️ a checklist past the window still promotes, until another skill is invoked", async () => {
    await mount({ tails: [VH_TAIL, NO_INVOCATION_TAIL, OTHER_TAIL] });
    await turnEnd(1);
    await turnEnd(2);
    await turnEnd(3);
    expect(promotes).toEqual([
      { workspaceId: "ws-1", stopEventAt: 1 },
      { workspaceId: "ws-1", stopEventAt: 2 },
    ]);
  });

  it("does not carry across CC sessions", async () => {
    await mount({ tails: [VH_TAIL, NO_INVOCATION_TAIL] });
    await turnEnd(1, "cc-1");
    await turnEnd(2, "cc-2");
    expect(promotes).toEqual([{ workspaceId: "ws-1", stopEventAt: 1 }]);
  });

  it("the gate turning OFF forgets it, so a later window-less tail does not promote", async () => {
    await mount({ tails: [VH_TAIL, NO_INVOCATION_TAIL] });
    await turnEnd(1);
    await rerender({ enabled: false });
    await rerender({ enabled: true });
    await turnEnd(2);
    expect(promotes).toEqual([{ workspaceId: "ws-1", stopEventAt: 1 }]);
  });
});
