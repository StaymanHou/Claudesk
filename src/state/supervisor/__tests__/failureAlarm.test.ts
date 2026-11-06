// M16.5 WP3 3.2 / 3.6 — the structural-failure alarm, end to end through the feed and readout.

import { afterEach, describe, expect, it } from "vitest";
import {
  ALARM_THRESHOLD,
  alarmFor,
  nextAlarmState,
  NO_FAILURES,
  type AlarmState,
} from "../failureAlarm";
import {
  activityAlarm,
  latestActivity,
  publishActivity,
  resetActivityFeed,
  seedActivity,
} from "../activityFeed";
import { buildRecord, type SupervisorReason } from "../activityRecord";
import { workspaceSupervisorReadout } from "../../../cc/workspaceSupervisor";

const fold = (reasons: readonly (SupervisorReason | null)[]): AlarmState =>
  reasons.reduce<AlarmState>(
    (s, reason) => nextAlarmState(s, { reason }),
    NO_FAILURES,
  );

let ts = 0;
const record = (reason: SupervisorReason | null, projectPath = "/p") =>
  buildRecord({
    ts: ++ts,
    appVersion: null,
    workspaceId: "ws-1",
    projectPath,
    sessionId: null,
    outcome: reason === null ? "fired" : "withheld",
    reason,
  });

afterEach(() => {
  resetActivityFeed();
});

describe("nextAlarmState / alarmFor — the transcript-format axis", () => {
  it("raises at exactly the threshold of consecutive `transcript-incomplete`", () => {
    expect(ALARM_THRESHOLD).toBe(3);
    const two = fold(["transcript-incomplete", "transcript-incomplete"]);
    expect(alarmFor(two)).toBeNull();
    const three = nextAlarmState(two, { reason: "transcript-incomplete" });
    expect(alarmFor(three)).toEqual({ kind: "transcript-format", count: 3 });
  });

  it("clears on the next turn that read a complete transcript, whatever its verdict", () => {
    for (const clearing of [
      "no-verdict",
      "policy-not-auto",
      "workflow-not-supervised",
      null,
    ] as const) {
      const s = fold([
        "transcript-incomplete",
        "transcript-incomplete",
        "transcript-incomplete",
        clearing,
      ]);
      expect(alarmFor(s), String(clearing)).toBeNull();
    }
  });

  it("⚠️ an exit BEFORE the read neither counts nor clears", () => {
    // A toggled-off or duplicate turn end says nothing about the transcript format.
    const s = fold([
      "transcript-incomplete",
      "transcript-incomplete",
      "supervisor-toggled-off",
      "duplicate-turn-end",
      "no-pty-session",
      "transcript-incomplete",
    ]);
    expect(alarmFor(s)).toEqual({ kind: "transcript-format", count: 3 });
  });
});

describe("nextAlarmState / alarmFor — the adjudicator axis", () => {
  it("⚠️ counts failures across interleaved turns that never reached the adjudicator", () => {
    // The real shape: most turns end with no token, and those must not break the run.
    const s = fold([
      "adjudicator-failed",
      "no-verdict",
      "policy-not-auto",
      "adjudicator-failed",
      "no-verdict",
      "adjudicator-failed",
    ]);
    expect(alarmFor(s)).toEqual({ kind: "adjudicator", count: 3 });
  });

  it("clears when the adjudicator answers, or a turn gets past it", () => {
    for (const clearing of [
      null,
      "adjudicator-says-awaiting",
      "unsent-input-present",
      "inject-failed",
      "context-pressure-recycle",
    ] as const) {
      const s = fold([
        "adjudicator-failed",
        "adjudicator-failed",
        "adjudicator-failed",
        clearing,
      ]);
      expect(alarmFor(s), String(clearing)).toBeNull();
    }
  });

  it("an unknown reason (a newer build's record) is neutral, not a clear", () => {
    const s = fold(["adjudicator-failed", "adjudicator-failed"]);
    const after = nextAlarmState(s, {
      reason: "some-future-reason" as SupervisorReason,
    });
    expect(after).toEqual(s);
  });
});

describe("the feed folds every published record once", () => {
  it("raises the project's alarm, and only that project's", () => {
    for (let i = 0; i < 3; i++)
      publishActivity(record("transcript-incomplete"));
    publishActivity(record("transcript-incomplete", "/other"));
    expect(activityAlarm("/p")).toEqual({
      kind: "transcript-format",
      count: 3,
    });
    expect(activityAlarm("/other")).toBeNull();
  });

  it("an OLDER record arriving late folds nothing", () => {
    const old = record("transcript-incomplete");
    const newer = record("no-verdict");
    publishActivity(newer);
    publishActivity(old);
    publishActivity(record("transcript-incomplete"));
    publishActivity(record("transcript-incomplete"));
    expect(activityAlarm("/p")).toBeNull();
  });
});

// Paydown 2026-11-04 WP8. The mount seed is ASYNC (it reads the file over IPC), so a live
// decision can be published before the replay lands. The old seed re-published each replayed
// record, and `publishActivity` dropped every one as older than the live record, so the alarm the
// log showed silently restarted from zero.
describe("the mount seed folds the file replay IN FRONT of live records", () => {
  const failingRun = () => [
    record("transcript-incomplete"),
    record("transcript-incomplete"),
    record("transcript-incomplete"),
  ];

  it("⚠️ a live record published BEFORE the replay lands keeps the replay's alarm", () => {
    const replay = failingRun();
    // The live decision comes after the replayed ones in time, and is itself neutral on the
    // transcript axis, so the run of 3 must survive it.
    publishActivity(record("no-pty-session"));
    expect(activityAlarm("/p")).toBeNull();
    seedActivity("/p", replay);
    expect(activityAlarm("/p")).toEqual({
      kind: "transcript-format",
      count: 3,
    });
  });

  it("a live record that CLEARS the run still clears it after the seed", () => {
    const replay = failingRun();
    publishActivity(record("no-verdict")); // a complete read: clears the transcript axis
    seedActivity("/p", replay);
    expect(activityAlarm("/p")).toBeNull();
  });

  it("the newest decision held is the newer of the replay and the live records", () => {
    const replay = failingRun();
    const live = record("no-pty-session");
    publishActivity(live);
    seedActivity("/p", replay);
    expect(latestActivity("/p")).toBe(live);
  });

  it("a live record that is ALSO in the replay (already on disk) is folded once", () => {
    const a = record("transcript-incomplete");
    const b = record("transcript-incomplete");
    publishActivity(a);
    publishActivity(b);
    // The file read returns the same two decisions, as different objects.
    seedActivity("/p", [{ ...a }, { ...b }]);
    expect(activityAlarm("/p")).toBeNull(); // 2, not 4
  });

  it("⚠️ two DISTINCT records in the same millisecond are both folded", () => {
    // Three workspaces on one project, each ending a turn in the same millisecond.
    const first = record("transcript-incomplete");
    const sameMs = (workspaceId: string) => ({
      ...record("transcript-incomplete"),
      ts: first.ts,
      workspaceId,
    });
    seedActivity("/p", [first, sameMs("ws-2"), sameMs("ws-3")]);
    expect(activityAlarm("/p")).toEqual({
      kind: "transcript-format",
      count: 3,
    });
  });

  it("a second seed for the same project (another workspace) folds nothing", () => {
    const replay = failingRun();
    seedActivity("/p", replay);
    // A live decision since the first seed clears the run. A second workspace mounting now
    // replays the same file; re-folding it would resurrect the cleared alarm.
    publishActivity(record("no-verdict"));
    seedActivity("/p", replay);
    expect(activityAlarm("/p")).toBeNull();
  });

  it("records published AFTER the seed fold live, on top of it", () => {
    seedActivity("/p", [
      record("transcript-incomplete"),
      record("transcript-incomplete"),
    ]);
    expect(activityAlarm("/p")).toBeNull();
    publishActivity(record("transcript-incomplete"));
    expect(activityAlarm("/p")).toEqual({
      kind: "transcript-format",
      count: 3,
    });
  });
});

describe("workspaceSupervisorReadout — the alarm marker", () => {
  it("names the transcript format, leads the tooltip, and shows the glyph", () => {
    const r = workspaceSupervisorReadout(true, true, "proj", {
      failure: {
        kind: "transcript-format",
        count: 4,
      },
    });
    expect(r?.alarm?.text).toBe("!");
    expect(r?.alarm?.title).toContain("transcript-incomplete");
    expect(r?.alarm?.title).toContain("last 4 turn ends");
    expect(r?.title.startsWith(r?.alarm?.title ?? "∅")).toBe(true);
  });

  it("names the adjudicator for the adjudicator axis", () => {
    const r = workspaceSupervisorReadout(true, true, "proj", {
      failure: {
        kind: "adjudicator",
        count: 3,
      },
    });
    expect(r?.alarm?.title).toContain("adjudicator-failed");
  });

  it("is null with no alarm, and the whole readout is null with the gate OFF", () => {
    expect(workspaceSupervisorReadout(true, true, "proj")?.alarm).toBeNull();
    expect(
      workspaceSupervisorReadout(true, false, "proj", {
        failure: {
          kind: "adjudicator",
          count: 9,
        },
      }),
    ).toBeNull();
  });
});
