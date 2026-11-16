// M17 WP2 — the remote row's pure helpers and the filter's `user@host:path` match.
import { describe, expect, it } from "vitest";
import { matchesFilter, type RecentProject } from "../ProjectPicker";
import {
  isRemoteRow,
  pathLineFor,
  remoteOpenRefusal,
  shortHost,
} from "../remoteRow";

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

  it("refuses to open a remote row and lets a local row through", () => {
    expect(remoteOpenRefusal(remote)).toContain("user@mini-host");
    expect(remoteOpenRefusal(local)).toBeNull();
    expect(remoteOpenRefusal(undefined)).toBeNull();
  });

  it("the filter matches a remote row on user@host:path, which its key does not contain", () => {
    // Positive control: the `ssh://` key alone does not contain `host:/`.
    expect(remote.project_path.includes("mini-host:/Users")).toBe(false);
    expect(matchesFilter(remote, "mini-host:/Users")).toBe(true);
    expect(matchesFilter(remote, "MINI-HOST")).toBe(true);
    expect(matchesFilter(local, "mini-host")).toBe(false);
  });
});
