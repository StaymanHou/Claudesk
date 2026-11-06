import { describe, expect, it } from "vitest";
import {
  classifyNext,
  isAdjudicatorSession,
  isScratchSlug,
  mineTranscript,
  parseIndexed,
  projectClassOf,
  type FileStats,
} from "./corpus";

const op = (text: string, ts = "2026-10-01T00:00:10.000Z") =>
  JSON.stringify({
    type: "user",
    timestamp: ts,
    message: { role: "user", content: text },
  });
const meta = (text: string) =>
  JSON.stringify({ type: "user", isMeta: true, message: { content: text } });
const say = (text: string, stop: string | null = "end_turn") =>
  JSON.stringify({
    type: "assistant",
    timestamp: "2026-10-01T00:00:00.000Z",
    message: {
      role: "assistant",
      stop_reason: stop,
      content: [{ type: "text", text }],
    },
  });
const skill = (name: string) =>
  JSON.stringify({
    type: "assistant",
    message: {
      stop_reason: "tool_use",
      content: [{ type: "tool_use", name: "Skill", input: { skill: name } }],
    },
  });

function mine(
  rawLines: string[],
  fired: { sessionId: string; ts: number }[] = [],
) {
  const stats: FileStats = { turnsRead: 0, incomplete: 0 };
  const out = mineTranscript({
    project: "-Users-stayman-Personal-projects-claudesk",
    session: "s1",
    rawLines,
    fired: fired.map((f) => ({ ...f, command: null })),
    stats,
  });
  return { out, stats };
}

describe("projectClassOf", () => {
  it("keeps claudesk, work and personal apart", () => {
    expect(
      projectClassOf("-Users-stayman-Personal-projects-claudesk-src-tauri"),
    ).toBe("claudesk");
    expect(projectClassOf("-Users-stayman-Work-Kenosis-ops-data-hub")).toBe(
      "work",
    );
    expect(projectClassOf("-Users-stayman-Personal-bluecg-maps")).toBe(
      "personal",
    );
    expect(projectClassOf("-")).toBe("other");
  });

  it("⚠️ keeps tails only for the exact claudesk slugs, never a sibling claudesk-* dir", () => {
    expect(projectClassOf("-Users-stayman-Personal-projects-claudesk")).toBe(
      "claudesk",
    );
    for (const sibling of [
      "-Users-stayman-Personal-projects-claudesk-scratch-scratch-a",
      "-Users-stayman-Personal-projects-claudesk-worktree",
      "-Users-stayman-Personal-projects-claudeskfork",
    ])
      expect(projectClassOf(sibling)).toBe("personal");
  });
});

describe("isScratchSlug", () => {
  it("matches the agent-driven scratch workspaces and nothing else", () => {
    expect(
      isScratchSlug(
        "-Users-stayman-Personal-projects-claudesk-tmp-scratch-scratch-b",
      ),
    ).toBe(true);
    expect(
      isScratchSlug(
        "-Users-stayman-Personal-projects-claudesk-tmp-scratch-m15-probe",
      ),
    ).toBe(true);
    expect(isScratchSlug("-Users-stayman-Personal-projects-claudesk")).toBe(
      false,
    );
  });
});

describe("classifyNext", () => {
  it.each([
    [null, "no-reply"],
    ["continue", "prod-text"],
    ["Next.", "prod-text"],
    ["so? not autopiloting?", "prod-complaint"],
    ["just chain it! Why returning control?", "prod-complaint"],
    ["ok", "ack"],
    ["yes", "ack"],
    ["use option B, the narrow one", "reply"],
    ["<task-notification>\n<task-id>x</task-id>", "task-notification"],
    ["[Request interrupted by user]", "interrupted"],
    [
      "<command-name>/feature-verify-auto</command-name>\n<command-args></command-args>",
      "prod-command",
    ],
    [
      "<command-name>/feature-verify-auto</command-name>\n<command-args>phase 2 only</command-args>",
      "other-command",
    ],
    ["<command-name>/session-handoff</command-name>", "other-command"],
  ])("%j → %s", (text, kind) => {
    expect(classifyNext(text, "feature-verify-auto")).toBe(kind);
  });

  it("does not read a long autopilot mention as a prod", () => {
    const long = `switch to autopilot, then ${"x ".repeat(100)}`;
    expect(classifyNext(long, "feature-verify-auto")).toBe("reply");
  });
});

describe("isAdjudicatorSession", () => {
  const prompt =
    "You are judging one thing about the end of an AI assistant's turn.\n\nQ";
  it("matches a session whose FIRST prompt is the adjudicator's", () => {
    expect(isAdjudicatorSession(parseIndexed([op(prompt)]))).toBe(true);
    const queued = JSON.stringify({ type: "queue-operation", content: prompt });
    expect(isAdjudicatorSession(parseIndexed([queued, op(prompt)]))).toBe(true);
  });
  it("does not match a session that merely QUOTES the prompt later", () => {
    expect(isAdjudicatorSession(parseIndexed([op("hi"), op(prompt)]))).toBe(
      false,
    );
    expect(
      isAdjudicatorSession(parseIndexed([op(`look at this: ${prompt}`)])),
    ).toBe(false);
  });
});

describe("mineTranscript", () => {
  const fireTurn = [op("go"), say("Built.\n\nTRANSITION: F8")];

  it("labels a fire candidate followed by a content-free prod BREAK", () => {
    const { out } = mine([...fireTurn, op("continue")]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      edgeId: "F8",
      skill: "feature-verify-auto",
      turnIndex: 1,
      turnStart: 0,
      nextKind: "prod-text",
      truth: "BREAK",
    });
    expect(out[0].tail).toContain("TRANSITION: F8");
  });

  it("sends a substantive reply to the residual", () => {
    const { out } = mine([...fireTurn, op("wait, use the other approach")]);
    expect(out[0]).toMatchObject({ truth: null, truthBasis: "reply" });
  });

  it("sends a supervisor-fired turn to the residual even when it reads like a prod", () => {
    const fireTs = Date.parse("2026-10-01T00:00:04.000Z");
    const { out } = mine(
      [
        ...fireTurn,
        op(
          "<command-name>/feature-verify-auto</command-name>\n<command-args></command-args>",
        ),
      ],
      [{ sessionId: "s1", ts: fireTs }],
    );
    expect(out[0]).toMatchObject({
      nextKind: "prod-command",
      supervisorFired: true,
      truth: null,
      truthBasis: "supervisor-fired",
    });
  });

  it("ignores a fire record from another session", () => {
    const fireTs = Date.parse("2026-10-01T00:00:04.000Z");
    const { out } = mine(
      [...fireTurn, op("continue")],
      [{ sessionId: "s2", ts: fireTs }],
    );
    expect(out[0].supervisorFired).toBe(false);
  });

  it("yields nothing for a turn that already chained", () => {
    const { out } = mine([
      op("go"),
      say("TRANSITION: F8", "tool_use"),
      skill("feature-verify-auto"),
      meta("skill body"),
      say("Verified."),
      op("continue"),
    ]);
    expect(out).toHaveLength(0);
  });

  it("still reads a closed turn that a `/exit` caveat line follows", () => {
    const caveat = meta(
      "<local-command-caveat>Caveat: …</local-command-caveat>",
    );
    const exit = op(
      "<command-name>/exit</command-name>\n<command-args></command-args>",
    );
    const { out } = mine([...fireTurn, caveat, exit]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      edgeId: "F8",
      nextKind: "other-command",
      truth: null,
    });
  });

  it("skips an incomplete turn, as production does", () => {
    const { out, stats } = mine([op("go"), say("TRANSITION: F8", null)]);
    expect(out).toHaveLength(0);
    expect(stats.incomplete).toBe(1);
  });

  it("yields nothing for a PAUSE edge", () => {
    // F12 leaves verify-human, whose row is the one conditional cell: skip-skill or pause, never auto.
    const { out } = mine([op("go"), say("TRANSITION: F12"), op("continue")]);
    expect(out).toHaveLength(0);
  });
});
