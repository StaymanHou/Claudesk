import { afterEach, describe, expect, it } from "vitest";
import {
  buildRecord,
  describeDecision,
  outcomeForReason,
  parseRecordLine,
  recentForProject,
  serializeRecord,
} from "../activityRecord";
import {
  latestActivity,
  publishActivity,
  resetActivityFeed,
} from "../activityFeed";

const base = {
  ts: 5,
  appVersion: "1.2.3",
  workspaceId: "ws-1",
  projectPath: "/p",
  sessionId: null,
  outcome: "withheld" as const,
  reason: "no-verdict" as const,
};

describe("buildRecord", () => {
  it("fills every absent optional field with null, so every line has the full schema", () => {
    expect(buildRecord(base)).toEqual({
      v: 1,
      ...base,
      transcriptPath: null,
      edgeId: null,
      mode: null,
      detail: null,
      command: null,
      tokens: null,
    });
  });
});

describe("serializeRecord", () => {
  it("⚠️ is ONE line even when a field contains a newline", () => {
    // Rust refuses a line containing a newline, and readers split on newlines, so a detail
    // with an embedded newline must be escaped, never written raw.
    const line = serializeRecord(
      buildRecord({ ...base, detail: "adjudicator (x):\nsecond line" }),
    );
    expect(line).not.toMatch(/[\r\n]/);
    expect(JSON.parse(line).detail).toBe("adjudicator (x):\nsecond line");
  });
});

describe("outcomeForReason", () => {
  it("maps the supervisor's own failures to error and every decision to withheld", () => {
    expect(outcomeForReason("sweep-threw")).toBe("error");
    expect(outcomeForReason("inject-failed")).toBe("error");
    expect(outcomeForReason("policy-not-auto")).toBe("withheld");
    expect(outcomeForReason("no-pty-session")).toBe("withheld");
  });
});

describe("describeDecision", () => {
  it.each([
    [
      { outcome: "fired", reason: null, command: "/feature-plan" },
      "fired /feature-plan",
    ],
    [
      { outcome: "withheld", reason: "policy-not-auto" },
      "withheld: policy-not-auto",
    ],
    [
      {
        outcome: "recycle-started",
        reason: "context-pressure-recycle",
        command: "/feature-plan",
      },
      "recycled, deferring /feature-plan",
    ],
    [
      {
        outcome: "recycle-declined",
        reason: "context-pressure-recycle",
        command: "/feature-plan",
      },
      "recycle declined (/feature-plan not run)",
    ],
    [{ outcome: "error", reason: "inject-failed" }, "error: inject-failed"],
  ] as const)("%o → %s", (over, text) => {
    expect(describeDecision(buildRecord({ ...base, ...over }))).toBe(text);
  });
});

describe("parseRecordLine / recentForProject", () => {
  const rec = (over: Partial<Parameters<typeof buildRecord>[0]>) =>
    serializeRecord(buildRecord({ ...base, ...over }));

  it("rejects a torn line and a non-v1 record instead of throwing", () => {
    expect(parseRecordLine('{"v":1,"ts":')).toBeNull();
    expect(
      parseRecordLine(
        JSON.stringify({ v: 2, ts: 1, projectPath: "/p", outcome: "fired" }),
      ),
    ).toBeNull();
    expect(parseRecordLine(rec({}))?.projectPath).toBe("/p");
  });

  it("⚠️ filters by PROJECT PATH, newest first, skipping bad lines", () => {
    const lines = [
      rec({ ts: 1, reason: "no-verdict" }),
      rec({ ts: 2, projectPath: "/other", workspaceId: "ws-1" }),
      "garbage",
      rec({ ts: 3, reason: "policy-not-auto" }),
    ];
    const got = recentForProject(lines, "/p", 10);
    expect(got.map((r) => r.ts)).toEqual([3, 1]);
    expect(recentForProject(lines, "/p", 1).map((r) => r.ts)).toEqual([3]);
  });
});

describe("activityFeed", () => {
  afterEach(() => resetActivityFeed());

  it("holds the newest record per project and never regresses to an older one", () => {
    publishActivity(buildRecord({ ...base, ts: 10 }));
    publishActivity(buildRecord({ ...base, ts: 5, reason: "policy-not-auto" }));
    expect(latestActivity("/p")?.ts).toBe(10);
    publishActivity(buildRecord({ ...base, ts: 20 }));
    expect(latestActivity("/p")?.ts).toBe(20);
    expect(latestActivity("/other")).toBeNull();
  });
});
