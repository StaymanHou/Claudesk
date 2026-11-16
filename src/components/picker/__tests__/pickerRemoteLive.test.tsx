// @vitest-environment jsdom
// M17 WP2 Phase 3 — the remote row on the LIVE picker (the consuming surface): the real
// component, real clicks, mocked IPC. Pins what the pure helpers cannot: the row renders its
// remote path with a short-host marker and no profile line, BOTH open doors run the open check before
// `record_open` (WP3; WP2 refused them),
// the add form surfaces the backend's words and prepends the written row, and remove sends the
// row's `ssh://` key.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
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
      ipc: (cmd) => (cmd === "remote_open_check" ? { kind: "ok" } : undefined),
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

  it("an unreachable host opens nothing and offers NO Remove", async () => {
    const onOpen = vi.fn();
    const { el } = await mountPicker({
      projects: [REMOTE],
      onOpen,
      ipc: (cmd) =>
        cmd === "remote_open_check"
          ? {
              kind: "unreachable",
              message:
                "could not resolve hostname user@mini-host: is Tailscale running?",
            }
          : undefined,
    });
    await click(q(pickerRow(el, "tank"), "picker-recent"));
    expect(q(el, "picker-toast")?.textContent).toContain("Tailscale");
    expect(q(el, "picker-toast-action")).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
    expect(calls.map((c) => c.cmd)).not.toContain("record_open");
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
