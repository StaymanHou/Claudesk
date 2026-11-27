// M17 WP2 — the remote row's pure helpers and the filter's `user@host:path` match.
import { describe, expect, it } from "vitest";
import { matchesFilter, type RecentProject } from "../ProjectPicker";
import {
  isRemoteRow,
  pathLineFor,
  remoteAskSpec,
  remoteOpenPlan,
  startAnnounced,
} from "../remoteRow";
import { shortHost } from "../../../state/workspaceSurfaces";

const remote: RecentProject = {
  project_path: "ssh://user@mini-host/Users/user/tank",
  display_name: "tank",
  remote: { host: "user@mini-host", path: "/Users/user/tank" },
};
const local: RecentProject = {
  project_path: "/Users/me/tank",
  display_name: "tank",
};

describe("remote rows (M17 WP2)", () => {
  // Operator ruling P3.verify-human.2: the path line is the REMOTE path; the host goes on the marker.
  it("shows the remote path for a remote row and the path for a local one", () => {
    expect(isRemoteRow(remote)).toBe(true);
    expect(isRemoteRow(local)).toBe(false);
    expect(isRemoteRow({ remote: null })).toBe(false);
    expect(pathLineFor(remote)).toBe("/Users/user/tank");
    expect(pathLineFor(local)).toBe("/Users/me/tank");
  });

  it("shortens the host for the marker: no user@, cut at the first dot, IPs whole", () => {
    expect(shortHost("user@mini-host.tail0000.ts.net")).toBe("mini-host");
    expect(shortHost("mini-host.local")).toBe("mini-host");
    expect(shortHost("mini")).toBe("mini");
    expect(shortHost("a@b@c.d")).toBe("c");
    expect(shortHost("user@10.0.0.5")).toBe("10.0.0.5");
    expect(shortHost("user@[fe80::1%en0]")).toBe("[fe80::1%en0]");
  });

  // M17 WP3 — the open check replaced WP2's stub refusal; M17 WP5 — it decides the open.
  it("starts or reconnects; a missing folder offers Remove; an unreachable or invalid row never does", () => {
    const K = remote.project_path;
    expect(
      remoteOpenPlan(K, {
        kind: "start",
        uncleanFlag: false,
        sessionMd: false,
        trusted: true,
        hostSubstrate: null,
      }),
    ).toEqual({ open: "start", announce: {} });
    expect(remoteOpenPlan(K, { kind: "reconnect", mode: "fsd" })).toEqual({
      open: "reconnect",
    });
    expect(
      remoteOpenPlan(K, { kind: "folder-missing", message: "gone" }),
    ).toEqual({
      open: null,
      message: "gone",
      offerRemove: true,
      offerRetry: false,
    });
    // M17 WP5 (AC-5.4): an unreachable host offers Retry, never Remove.
    expect(
      remoteOpenPlan(K, { kind: "unreachable", message: "no route" }),
    ).toEqual({
      open: null,
      message: "no route",
      offerRemove: false,
      offerRetry: true,
    });
    expect(remoteOpenPlan(K, { kind: "invalid", message: "bad host" })).toEqual(
      {
        open: null,
        message: "bad host",
        offerRemove: false,
        offerRetry: false,
      },
    );
  });

  // M17 WP5 (R-4) — a live session Claudesk did not leave running is never joined (A8) or ended
  // without an answer: the plan asks, with the check's own words.
  it("a live session Claudesk did not leave running asks first", () => {
    expect(
      remoteOpenPlan(remote.project_path, {
        kind: "ask-end-pending",
        message: "It is running.",
      }),
    ).toEqual({ open: "ask", kind: "end-pending", message: "It is running." });
    expect(
      remoteOpenPlan(remote.project_path, {
        kind: "ask-unrecorded",
        message: "It is running.",
      }),
    ).toEqual({ open: "ask", kind: "unrecorded", message: "It is running." });
  });

  it("dialog A defaults to ending it, dialog B to reconnecting; Esc cancels both", () => {
    const a = remoteAskSpec("end-pending", "m");
    expect(a.buttons.map((b) => [b.label, b.value, b.variant ?? null])).toEqual(
      [
        ["End it and open", "end", "primary"],
        ["Reconnect", "reconnect", null],
        ["Cancel", "cancel", null],
      ],
    );
    const b = remoteAskSpec("unrecorded", "m");
    expect(b.buttons.map((x) => [x.label, x.value, x.variant ?? null])).toEqual(
      [
        ["Reconnect", "reconnect", "primary"],
        ["End it and start fresh", "end", "danger"],
        ["Cancel", "cancel", null],
      ],
    );
    for (const spec of [a, b]) {
      expect(spec.escValue).toBe("cancel");
      expect(spec.message).toBe("m");
    }
  });

  // M17 WP5 Phase 2 (AC-3.3) — a dead session's start resolves through `predictAction` from the
  // check's REMOTE signals: the flag wins; then the remote `.session.md`, manual when untrusted.
  it("a remote start resolves the two-signal rule from the check's signals", () => {
    const s = (uncleanFlag: boolean, sessionMd: boolean, trusted: boolean) =>
      startAnnounced({ uncleanFlag, sessionMd, trusted, hostSubstrate: null });
    expect(s(true, true, true)).toBe("continue");
    expect(s(true, false, false)).toBe("continue");
    expect(s(false, true, true)).toBe("restore");
    expect(s(false, true, false)).toBe("restore-manual");
    expect(s(false, false, true)).toBeUndefined();
    expect(s(false, false, false)).toBeUndefined();
    // The plan carries it as a one-row map keyed by the row's own key.
    expect(
      remoteOpenPlan(remote.project_path, {
        kind: "start",
        uncleanFlag: false,
        sessionMd: true,
        trusted: true,
        hostSubstrate: null,
      }),
    ).toEqual({
      open: "start",
      announce: { [remote.project_path]: "restore" },
    });
  });

  it("the filter matches a remote row on user@host:path, which its key does not contain", () => {
    // Positive control: the `ssh://` key alone does not contain `host:/`.
    expect(remote.project_path.includes("mini-host:/Users")).toBe(false);
    expect(matchesFilter(remote, "mini-host:/Users")).toBe(true);
    expect(matchesFilter(remote, "MINI-HOST")).toBe(true);
    expect(matchesFilter(local, "mini-host")).toBe(false);
  });
});
