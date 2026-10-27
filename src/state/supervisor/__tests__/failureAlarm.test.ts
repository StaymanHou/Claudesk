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
  publishActivity,
  resetActivityFeed,
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

  it("⚠️ re-publishing the SAME record (the mount seed) does not count it twice", () => {
    const a = record("transcript-incomplete");
    const b = record("transcript-incomplete");
    publishActivity(a);
    publishActivity(b);
    publishActivity(b);
    publishActivity(b);
    expect(activityAlarm("/p")).toBeNull();
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

describe("workspaceSupervisorReadout — the alarm marker", () => {
  it("names the transcript format, leads the tooltip, and shows the glyph", () => {
    const r = workspaceSupervisorReadout(
      true,
      true,
      "proj",
      false,
      null,
      null,
      {
        kind: "transcript-format",
        count: 4,
      },
    );
    expect(r?.alarm?.text).toBe("!");
    expect(r?.alarm?.title).toContain("transcript-incomplete");
    expect(r?.alarm?.title).toContain("last 4 turn ends");
    expect(r?.title.startsWith(r?.alarm?.title ?? "∅")).toBe(true);
  });

  it("names the adjudicator for the adjudicator axis", () => {
    const r = workspaceSupervisorReadout(
      true,
      true,
      "proj",
      false,
      null,
      null,
      {
        kind: "adjudicator",
        count: 3,
      },
    );
    expect(r?.alarm?.title).toContain("adjudicator-failed");
  });

  it("is null with no alarm, and the whole readout is null with the gate OFF", () => {
    expect(workspaceSupervisorReadout(true, true, "proj")?.alarm).toBeNull();
    expect(
      workspaceSupervisorReadout(true, false, "proj", false, null, null, {
        kind: "adjudicator",
        count: 9,
      }),
    ).toBeNull();
  });
});
