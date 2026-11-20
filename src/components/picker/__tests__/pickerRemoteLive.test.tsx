// @vitest-environment jsdom
// M17 WP2 Phase 3 — the remote row on the LIVE picker (the consuming surface): the real
// component, real clicks, mocked IPC. Pins what the pure helpers cannot: the row renders its
// remote path with a short-host marker and no profile line, BOTH open doors run the open check before
// `record_open` (WP3; WP2 refused them),
// the add form surfaces the backend's words and prepends the written row, and remove sends the
// row's `ssh://` key.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { emit } from "@tauri-apps/api/event";
import { HOST_SUBSTRATE_EVENT } from "../../../state/hostSubstrate";
import {
  calls,
  mountPicker,
  pickerRow,
  setNativeValue,
  settle,
  teardownLive,
} from "./livePicker";

const KEY = "ssh://user@mini-host.tail0000.ts.net/Users/user/tank";
const REMOTE = {
  project_path: KEY,
  display_name: "tank",
  remote: { host: "user@mini-host.tail0000.ts.net", path: "/Users/user/tank" },
};
const LOCAL = { project_path: "/tmp/scratch/local", display_name: "local" };
/** M18 WP4 — a host that has the workflow system (the open check's observed substrate). */
const DEV = { state: "developer", root: null, head: null } as const;

afterEach(async () => {
  await teardownLive();
});

const q = (el: ParentNode, id: string) =>
  el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function click(node: HTMLElement | null) {
  if (node === null) throw new Error("click: element not found");
  await act(async () => node.click());
  await settle();
}

describe("remote rows on the live picker (M17 WP2)", () => {
  // Operator ruling P3.verify-human.2: path line = the remote path, never cut by a long host; the
  // marker names the SHORT host, with the full user@host in its tooltip.
  it("renders the remote path, a short-host marker, and no profile line; the local row keeps its profile line", async () => {
    const { el } = await mountPicker({ projects: [REMOTE, LOCAL] });
    const row = pickerRow(el, "tank");
    expect(row.dataset.remote).toBe("true");
    expect(row.querySelector(".picker-recent-path")?.textContent).toBe(
      "/Users/user/tank",
    );
    expect(row.textContent).not.toContain("ssh://");
    expect(row.textContent).not.toContain("tail0000");
    const marker = q(row, "picker-recent-remote");
    expect(marker?.textContent).toBe("⇄ mini-host");
    expect(marker?.title).toBe(
      "Runs on user@mini-host.tail0000.ts.net over SSH",
    );
    expect(q(row, "project-profile-line")).toBeNull();
    // The model + drive-mode cell is still there (they apply to the remote session).
    expect(q(row, "picker-recent-model")).not.toBeNull();
    // Positive control: a local row has its profile line and no marker.
    const localRow = pickerRow(el, "local");
    expect(q(localRow, "project-profile-line")).not.toBeNull();
    expect(q(localRow, "picker-recent-remote")).toBeNull();
    expect(localRow.dataset.remote).toBeUndefined();
  });

  // M17 WP3 — the open check (`remote_open_check`) replaced WP2's stub refusal. It runs in the
  // funnel both doors share, BEFORE `record_open`.
  it("BOTH open doors open a remote row whose check passes, passing its ssh:// key", async () => {
    const onOpen = vi.fn();
    const { el } = await mountPicker({
      projects: [REMOTE],
      announce: { [KEY]: "continue" },
      onOpen,
      ipc: (cmd) =>
        cmd === "remote_open_check"
          ? {
              kind: "start",
              uncleanFlag: true,
              sessionMd: false,
              trusted: true,
            }
          : undefined,
    });
    const row = pickerRow(el, "tank");
    await click(q(row, "picker-recent"));
    await click(q(row, "picker-recent-nofire"));
    expect(calls.filter((c) => c.cmd === "remote_open_check")).toEqual([
      { cmd: "remote_open_check", args: { projectPath: KEY } },
      { cmd: "remote_open_check", args: { projectPath: KEY } },
    ]);
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen.mock.calls.map((c) => c[0])).toEqual([KEY, KEY]);
    expect(onOpen.mock.calls.map((c) => c[2])).toEqual(["fire", "no-fire"]);
    // The check comes BEFORE the recency stamp.
    const cmds = calls.map((c) => c.cmd);
    expect(cmds.indexOf("remote_open_check")).toBeLessThan(
      cmds.indexOf("record_open"),
    );
  });

  // M17 WP5 (R-2, AC-2) — the label comes from the local record; the click's check decides.
  it("a row labelled reconnect, whose check finds the session live, opens through the reconnect door", async () => {
    const onOpen = vi.fn();
    const { el } = await mountPicker({
      projects: [REMOTE],
      announce: { [KEY]: "reconnect" },
      onOpen,
      ipc: (cmd) =>
        cmd === "remote_open_check"
          ? { kind: "reconnect", mode: "autopilot" }
          : undefined,
    });
    const row = pickerRow(el, "tank");
    expect(q(row, "picker-recent-announce")?.textContent).toContain(
      "reconnect",
    );
    expect(q(row, "picker-recent-nofire")).toBeNull();
    await click(q(row, "picker-recent"));
    expect(onOpen.mock.calls).toEqual([[KEY, null, "reconnect"]]);
    const cmds = calls.map((c) => c.cmd);
    expect(cmds.indexOf("remote_open_check")).toBeLessThan(
      cmds.indexOf("record_open"),
    );
  });

  // M17 WP5 Phase 2 (AC-3.3) — a remote START takes its action from the check's signals (read over
  // the link at click time), never from the picker's map: the row's label comes from the LOCAL
  // record and cannot know the remote `.session.md`.
  it.each([
    {
      name: "the flag → continue, though the row was labelled reconnect",
      label: "reconnect",
      signals: {
        uncleanFlag: true,
        sessionMd: true,
        trusted: true,
        hostSubstrate: DEV,
      },
      gateOn: true,
      action: { kind: "argv", flag: "--continue" },
    },
    {
      name: "remote .session.md, trusted, gate ON → /session-restore, though the row had no label",
      label: undefined,
      signals: {
        uncleanFlag: false,
        sessionMd: true,
        trusted: true,
        hostSubstrate: DEV,
      },
      gateOn: true,
      action: { kind: "inject", command: "/session-restore" },
    },
    {
      name: "remote .session.md with the gate OFF → nothing (the restore arm is gated)",
      label: undefined,
      signals: {
        uncleanFlag: false,
        sessionMd: true,
        trusted: true,
        hostSubstrate: DEV,
      },
      gateOn: false,
      action: null,
    },
    // M18 WP4 — the funnel's host input is the substrate the CHECK observed (`hostFromOpenCheck`),
    // not the picker's cached map (empty here: no host was ever probed in this picker).
    {
      name: "remote .session.md, gate ON, but the check found the host ABSENT → nothing",
      label: undefined,
      signals: {
        uncleanFlag: false,
        sessionMd: true,
        trusted: true,
        hostSubstrate: { state: "absent" },
      },
      gateOn: true,
      action: null,
    },
    {
      name: "remote .session.md, gate ON, the check did not probe → nothing (closed)",
      label: undefined,
      signals: {
        uncleanFlag: false,
        sessionMd: true,
        trusted: true,
        hostSubstrate: null,
      },
      gateOn: true,
      action: null,
    },
    {
      name: "no signal → nothing, though the row was labelled continue",
      label: "continue",
      signals: {
        uncleanFlag: false,
        sessionMd: false,
        trusted: true,
        hostSubstrate: DEV,
      },
      gateOn: true,
      action: null,
    },
  ] as const)(
    "a remote start: $name",
    async ({ label, signals, gateOn, action }) => {
      const onOpen = vi.fn();
      const { el } = await mountPicker({
        projects: [REMOTE],
        announce: label === undefined ? {} : { [KEY]: label },
        onOpen,
        gateOn,
        ipc: (cmd) =>
          cmd === "remote_open_check"
            ? { kind: "start", ...signals }
            : undefined,
      });
      await click(q(pickerRow(el, "tank"), "picker-recent"));
      expect(onOpen.mock.calls).toEqual([[KEY, action, "fire"]]);
    },
  );

  // M18 WP4 — D9, operator ruling A (2026-11-20): a remote row's drive-mode line is a workflow
  // surface, so it follows the funnel's host input. Until the row's host has been open-checked in
  // this app session it is unknown, so the line is ABSENT (fail closed); it appears when the host
  // reads present and goes again when it reads absent. The local row is the positive control.
  it("a remote row's drive-mode line appears only once its host is known to have the workflow system", async () => {
    const { el } = await mountPicker({
      projects: [REMOTE, LOCAL],
      gateOn: true,
      ipc: (cmd) => (cmd === "remote_host_substrates" ? {} : undefined),
    });
    const modeLine = (name: string) =>
      q(pickerRow(el, name), "picker-recent-mode-line");
    expect(modeLine("local")).not.toBeNull();
    expect(modeLine("tank")).toBeNull();
    const hostIs = async (substrate: unknown) => {
      await act(async () => {
        await emit(HOST_SUBSTRATE_EVENT, {
          host: REMOTE.remote.host,
          substrate,
        });
      });
      await settle();
    };
    await hostIs(DEV);
    expect(modeLine("tank")).not.toBeNull();
    await hostIs({ state: "absent" });
    expect(modeLine("tank")).toBeNull();
    // Another host's answer is not this row's.
    await act(async () => {
      await emit(HOST_SUBSTRATE_EVENT, { host: "x@elsewhere", substrate: DEV });
    });
    await settle();
    expect(modeLine("tank")).toBeNull();
  });

  // An untrusted remote folder: the action is still the inject arm (the fire-time trust read,
  // answered for a remote key from this same check, is what withholds it), as for a local row.
  it("a remote start into an untrusted folder carries the inject arm for the fire-time read to withhold", async () => {
    const onOpen = vi.fn();
    const { el } = await mountPicker({
      projects: [REMOTE],
      onOpen,
      gateOn: true,
      ipc: (cmd) =>
        cmd === "remote_open_check"
          ? {
              kind: "start",
              uncleanFlag: false,
              sessionMd: true,
              trusted: false,
              hostSubstrate: DEV,
            }
          : undefined,
    });
    await click(q(pickerRow(el, "tank"), "picker-recent"));
    expect(onOpen.mock.calls).toEqual([
      [KEY, { kind: "inject", command: "/session-restore" }, "fire"],
    ]);
  });

  // M17 WP5 (R-4, AC-5.1/5.2) — the live session Claudesk did not leave running: a dialog, nothing
  // opened until the operator answers.
  const askCheck = (kind: string) => ({
    kind,
    message: "Its Claude Code session is still running on mini-host.",
  });

  it.each([
    ["ask-end-pending", "End it and open"],
    ["ask-unrecorded", "Reconnect"],
  ])(
    "a %s check opens its dialog, with %s as the default, and nothing opens yet",
    async (kind, primary) => {
      const onOpen = vi.fn();
      const { el } = await mountPicker({
        projects: [REMOTE],
        onOpen,
        ipc: (cmd) =>
          cmd === "remote_open_check" ? askCheck(kind) : undefined,
      });
      await click(q(pickerRow(el, "tank"), "picker-recent"));
      const dialog = q(el, "confirm-dialog");
      expect(dialog?.textContent).toContain("still running on mini-host");
      expect(
        dialog?.querySelector(".confirm-dialog-btn-primary")?.textContent,
      ).toBe(primary);
      expect(onOpen).not.toHaveBeenCalled();
      expect(calls.map((c) => c.cmd)).not.toContain("record_open");
    },
  );

  it.each(["ask-end-pending", "ask-unrecorded"])(
    "%s → Reconnect attaches through the reconnect door",
    async (kind) => {
      const onOpen = vi.fn();
      const { el } = await mountPicker({
        projects: [REMOTE],
        onOpen,
        ipc: (cmd) =>
          cmd === "remote_open_check" ? askCheck(kind) : undefined,
      });
      await click(q(pickerRow(el, "tank"), "picker-recent"));
      await click(q(el, "confirm-remote-ask-reconnect"));
      expect(q(el, "confirm-dialog")).toBeNull();
      expect(onOpen.mock.calls).toEqual([[KEY, null, "reconnect"]]);
      expect(calls.map((c) => c.cmd)).not.toContain("remote_end_session");
    },
  );

  it.each(["ask-end-pending", "ask-unrecorded"])(
    "%s → End ends the session, then runs the open again, which starts through the same door",
    async (kind) => {
      const onOpen = vi.fn();
      let checks = 0;
      const { el } = await mountPicker({
        projects: [REMOTE],
        onOpen,
        ipc: (cmd) => {
          if (cmd !== "remote_open_check") return undefined;
          checks += 1;
          // First check: live. After the end: a dead session with the flag set.
          return checks === 1
            ? askCheck(kind)
            : {
                kind: "start",
                uncleanFlag: true,
                sessionMd: false,
                trusted: true,
              };
        },
      });
      await click(q(pickerRow(el, "tank"), "picker-recent"));
      await click(q(el, "confirm-remote-ask-end"));
      const cmds = calls.map((c) => c.cmd);
      expect(calls.filter((c) => c.cmd === "remote_end_session")).toEqual([
        { cmd: "remote_end_session", args: { projectPath: KEY } },
      ]);
      // end → the check again → the open.
      const end = cmds.indexOf("remote_end_session");
      expect(cmds.indexOf("remote_open_check", end)).toBeGreaterThan(end);
      expect(onOpen.mock.calls).toEqual([
        [KEY, { kind: "argv", flag: "--continue" }, "fire"],
      ]);
    },
  );

  it("Cancel opens nothing and ends nothing", async () => {
    const onOpen = vi.fn();
    const { el } = await mountPicker({
      projects: [REMOTE],
      onOpen,
      ipc: (cmd) =>
        cmd === "remote_open_check" ? askCheck("ask-end-pending") : undefined,
    });
    await click(q(pickerRow(el, "tank"), "picker-recent"));
    await click(q(el, "confirm-remote-ask-cancel"));
    expect(q(el, "confirm-dialog")).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
    const cmds = calls.map((c) => c.cmd);
    expect(cmds).not.toContain("remote_end_session");
    expect(cmds).not.toContain("record_open");
  });

  it("a failed End opens nothing and says why", async () => {
    const onOpen = vi.fn();
    const { el } = await mountPicker({
      projects: [REMOTE],
      onOpen,
      ipc: (cmd) => {
        if (cmd === "remote_open_check") return askCheck("ask-unrecorded");
        if (cmd === "remote_end_session")
          throw "could not end the Claude Code session: the link is not up, so nothing was sent";
        return undefined;
      },
    });
    await click(q(pickerRow(el, "tank"), "picker-recent"));
    await click(q(el, "confirm-remote-ask-end"));
    expect(q(el, "picker-toast")?.textContent).toContain(
      "could not end the Claude Code session",
    );
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("a missing folder opens nothing and OFFERS Remove; Remove sends the row's key", async () => {
    const onOpen = vi.fn();
    const { el } = await mountPicker({
      projects: [REMOTE, LOCAL],
      onOpen,
      ipc: (cmd) =>
        cmd === "remote_open_check"
          ? {
              kind: "folder-missing",
              message: "/Users/user/tank no longer exists on user@mini-host",
            }
          : undefined,
    });
    await click(q(pickerRow(el, "tank"), "picker-recent"));
    expect(q(el, "picker-toast")?.textContent).toContain(
      "no longer exists on user@mini-host",
    );
    expect(onOpen).not.toHaveBeenCalled();
    expect(calls.map((c) => c.cmd)).not.toContain("record_open");
    // Nothing was removed by itself: the row is still listed until the operator clicks Remove.
    expect(calls.map((c) => c.cmd)).not.toContain("remove_project");
    expect(el.querySelectorAll("li.picker-recent-row")).toHaveLength(2);
    await click(q(el, "picker-toast-action"));
    expect(calls.filter((c) => c.cmd === "remove_project")).toEqual([
      { cmd: "remove_project", args: { path: KEY } },
    ]);
    expect(el.querySelectorAll("li.picker-recent-row")).toHaveLength(1);
  });

  it("an unreachable host opens nothing, offers Retry (never Remove), and Retry checks again", async () => {
    const onOpen = vi.fn();
    let checks = 0;
    const { el } = await mountPicker({
      projects: [REMOTE],
      onOpen,
      ipc: (cmd) => {
        if (cmd !== "remote_open_check") return undefined;
        checks += 1;
        return checks === 1
          ? {
              kind: "unreachable",
              message:
                "could not resolve hostname user@mini-host: is Tailscale running?",
            }
          : {
              kind: "start",
              uncleanFlag: false,
              sessionMd: false,
              trusted: true,
            };
      },
    });
    await click(q(pickerRow(el, "tank"), "picker-recent"));
    expect(q(el, "picker-toast")?.textContent).toContain("Tailscale");
    expect(q(el, "picker-toast-action")?.textContent).toBe("Retry");
    expect(onOpen).not.toHaveBeenCalled();
    expect(calls.map((c) => c.cmd)).not.toContain("record_open");
    await click(q(el, "picker-toast-action"));
    expect(checks).toBe(2);
    expect(onOpen.mock.calls).toEqual([[KEY, null, "fire"]]);
  });

  it("positive control: a local row still opens", async () => {
    const onOpen = vi.fn();
    const { el } = await mountPicker({ projects: [LOCAL], onOpen });
    await click(q(pickerRow(el, "local"), "picker-recent"));
    expect(calls.map((c) => c.cmd)).toContain("record_open");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("the add form shows the backend's failure words, then prepends the row it wrote", async () => {
    let fail = true;
    const { el } = await mountPicker({
      projects: [LOCAL],
      ipc: (cmd) => {
        if (cmd !== "add_remote_project") return undefined;
        if (fail)
          throw "could not resolve hostname mini: is Tailscale running?";
        return REMOTE;
      },
    });
    expect(q(el, "picker-remote-form")).toBeNull();
    await click(q(el, "picker-add-remote"));
    const add = q(el, "picker-remote-add") as HTMLButtonElement;
    expect(add.disabled).toBe(true); // both fields empty
    await act(async () => {
      setNativeValue(q(el, "picker-remote-host"), "mini");
      setNativeValue(q(el, "picker-remote-path"), "~/tank");
    });
    expect(add.disabled).toBe(false);
    await click(add);
    expect(q(el, "picker-remote-error")?.textContent).toBe(
      "could not resolve hostname mini: is Tailscale running?",
    );
    expect(el.querySelectorAll("li.picker-recent-row")).toHaveLength(1);
    // The inputs survive a failure, so one field can be fixed and retried.
    expect((q(el, "picker-remote-path") as HTMLInputElement).value).toBe(
      "~/tank",
    );
    expect(calls.filter((c) => c.cmd === "add_remote_project")).toEqual([
      { cmd: "add_remote_project", args: { host: "mini", path: "~/tank" } },
    ]);

    fail = false;
    await click(q(el, "picker-remote-add"));
    expect(q(el, "picker-remote-form")).toBeNull();
    const names = [...el.querySelectorAll(".picker-recent-name")].map(
      (n) => n.textContent,
    );
    expect(names[0]).toBe("tank");
    expect(q(el, "picker-toast")?.textContent).toContain(
      "Added tank on user@mini-host.tail0000.ts.net",
    );
  });

  it("remove sends the row's ssh:// key and drops the row", async () => {
    const { el } = await mountPicker({ projects: [REMOTE, LOCAL] });
    await click(q(pickerRow(el, "tank"), "picker-recent-remove"));
    expect(calls.filter((c) => c.cmd === "remove_project")).toEqual([
      { cmd: "remove_project", args: { path: KEY } },
    ]);
    expect(() => pickerRow(el, "tank")).toThrow();
    expect(pickerRow(el, "local")).toBeTruthy();
  });

  it("while the preflight runs: 'Checking…', inputs locked, a status line naming the host", async () => {
    let release: (v: unknown) => void = () => {};
    const { el } = await mountPicker({
      projects: [LOCAL],
      ipc: (cmd) =>
        cmd === "add_remote_project"
          ? new Promise((r) => {
              release = r;
            })
          : undefined,
    });
    await click(q(el, "picker-add-remote"));
    await act(async () => {
      setNativeValue(q(el, "picker-remote-host"), "mini");
      setNativeValue(q(el, "picker-remote-path"), "~/tank");
    });
    await click(q(el, "picker-remote-add"));
    const add = q(el, "picker-remote-add") as HTMLButtonElement;
    expect(add.textContent).toBe("Checking…");
    expect(add.disabled).toBe(true);
    expect((q(el, "picker-remote-host") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect((q(el, "picker-remote-path") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(q(el, "picker-remote-status")?.textContent).toContain(
      "Checking mini",
    );
    await act(async () => release(REMOTE));
    await settle();
    expect(q(el, "picker-remote-form")).toBeNull();
    expect(q(el, "picker-remote-status")).toBeNull();
  });
});
