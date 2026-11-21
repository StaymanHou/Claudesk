// @vitest-environment jsdom
//
// M18 WP5 — Settings → Remote hosts (`arch/claude-substrate.md` §R.4, §R.5).
//
// The readout's text is asserted as VALUES (`hostReadoutLines`); the group's behaviour on a live
// mount of the REAL panel (createRoot + act + mockIPC, the settingsPanelGroupsRender pattern):
// when it exists, where it sits, which hosts it asks, and that closing the panel drops a refresh
// still in flight (task 5.3, prior `background-work-only-for-what-is-on-screen`).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import SettingsPanel from "../SettingsPanel";
import { hostReadoutLines } from "../RemoteHostsSettings";
import { remoteRunOffers } from "../RemoteHostsSettings";
import { resultTitle } from "../RemoteRunPanel";
import type {
  RefreshOutcome,
  RemoteHostEntry,
} from "../../../state/remoteHosts";
import { resetHostSubstrateStoreForTests } from "../../../state/useHostSubstrate";
import { emit } from "@tauri-apps/api/event";
import {
  FINISHING_LABEL,
  REMOTE_CONSENT_ITEMS,
  REMOTE_UNINSTALL_INTRO,
  REMOTE_UNINSTALL_NOTE,
  REMOTE_UPDATE_ITEMS,
} from "../../../state/remoteRun";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const A = "a".repeat(40);
const B = "b".repeat(40);
const DEV = { state: "developer", root: "/Users/me/repo", head: A } as const;

describe("hostReadoutLines — the readout's words, as values", () => {
  it("Developer, up to date: the state, the short HEAD, the verdict", () => {
    expect(
      hostReadoutLines(DEV, true, {
        outcome: "checked",
        substrate: DEV,
        drift: { drift: "up_to_date", head: A, remote: A },
      }),
    ).toEqual({
      state: "Developer",
      stateDetail: "installed by hand; Claudesk doesn't manage it",
      head: "HEAD aaaaaaa",
      root: "/Users/me/repo",
      drift: "Up to date with GitHub.",
    });
  });

  it("differs: both short SHAs, the host's first", () => {
    expect(
      hostReadoutLines(DEV, true, {
        outcome: "checked",
        substrate: DEV,
        drift: { drift: "differs", head: A, remote: B },
      }).drift,
    ).toBe("Behind GitHub: this host is at aaaaaaa, GitHub at bbbbbbb.");
  });

  it("every no-verdict case says why", () => {
    expect(hostReadoutLines(DEV, true, { outcome: "checking" }).drift).toBe(
      "Checking GitHub…",
    );
    expect(
      hostReadoutLines(DEV, true, { outcome: "failed", reason: "timed out" })
        .drift,
    ).toBe("Can't check: timed out");
    expect(
      hostReadoutLines(DEV, true, {
        outcome: "checked",
        substrate: DEV,
        drift: {
          drift: "cant_check",
          reason: "the install has no `origin` remote",
        },
      }).drift,
    ).toBe("Can't check: the install has no `origin` remote");
  });

  it("a link that is down (or went down) says how to get an answer, never a guess", () => {
    const want = "Connect a workspace on this host to check.";
    expect(hostReadoutLines(DEV, false, undefined).drift).toBe(want);
    expect(hostReadoutLines(DEV, true, { outcome: "link_down" }).drift).toBe(
      want,
    );
  });

  it("Absent and Unknown carry no HEAD and no drift", () => {
    const absent = hostReadoutLines({ state: "absent" }, true, {
      outcome: "checked",
      substrate: { state: "absent" },
      drift: null,
    });
    expect([absent.state, absent.head, absent.drift]).toEqual([
      "Absent",
      null,
      null,
    ]);
    expect(
      hostReadoutLines({ state: "unknown" }, true, undefined),
    ).toMatchObject({
      state: "Unknown",
      stateDetail: "not checked yet",
      head: null,
    });
  });
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const calls: { cmd: string; args: unknown }[] = [];

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  clearMocks();
  resetHostSubstrateStoreForTests();
  vi.restoreAllMocks();
  // jsdom has no `scrollIntoView`; the two highlight tests install one.
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

/** Install a recording `scrollIntoView` (jsdom has none). */
function recordScrolls(): Element[] {
  const scrolled: Element[] = [];
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this);
  };
  return scrolled;
}

async function settle(ms = 30) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

type MockInvoke = (
  cmd: string,
  args: unknown,
  opts?: unknown,
) => Promise<unknown>;

async function mountPanel(opts: {
  hosts: RemoteHostEntry[];
  refresh?: (host: string) => RefreshOutcome | Promise<RefreshOutcome>;
  highlightGroup?: string;
  /** M18 WP6: answer a command before the defaults (return `undefined` to fall through). */
  onCmd?: (cmd: string, args: unknown) => unknown;
  /** M18 WP8: wrap the mocked IPC (e.g. to hold back `listen` replies as a slow backend would). */
  wrapInvoke?: (inv: MockInvoke) => MockInvoke;
}): Promise<HTMLDivElement> {
  mockWindows("main");
  calls.length = 0;
  mockIPC(
    (cmd, args) => {
      calls.push({ cmd, args });
      const own = opts.onCmd?.(cmd, args);
      if (own !== undefined) return own;
      switch (cmd) {
        case "remote_hosts":
          return opts.hosts;
        case "remote_substrate_refresh":
          return opts.refresh?.((args as { host: string }).host) ?? null;
        case "remote_host_substrates":
          return {};
        case "profiles_list":
        case "profile_adoption_suggestions":
          return [];
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
  if (opts.wrapInvoke) {
    const internals = (
      window as unknown as { __TAURI_INTERNALS__: { invoke: MockInvoke } }
    ).__TAURI_INTERNALS__;
    internals.invoke = opts.wrapInvoke(internals.invoke);
  }
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <SettingsPanel onClose={() => {}} highlightGroup={opts.highlightGroup} />,
    );
  });
  await settle();
  return host;
}

const GROUP = '[data-testid="settings-group-remote-hosts"]';
const refreshCalls = () =>
  calls
    .filter((c) => c.cmd === "remote_substrate_refresh")
    .map((c) => (c.args as { host: string }).host);

describe("the Remote hosts group, on the real panel", () => {
  it("does not exist without a remote row, and asks nothing", async () => {
    const panel = await mountPanel({ hosts: [] });
    expect(panel.querySelector(GROUP)).toBeNull();
    expect(refreshCalls()).toEqual([]);
    // Anti-vacuity: the panel did render, and did ask for the list.
    expect(
      panel.querySelector('[data-testid="settings-group-workflow-features"]'),
    ).not.toBeNull();
    expect(calls.some((c) => c.cmd === "remote_hosts")).toBe(true);
  });

  it("sits right after Workflow features; a host with a live link is refreshed, a down one is not asked", async () => {
    const panel = await mountPanel({
      hosts: [
        { host: "me@up-host", link_up: true, substrate: DEV },
        {
          host: "me@down-host",
          link_up: false,
          substrate: { state: "absent" },
        },
      ],
      refresh: () => ({
        outcome: "checked",
        substrate: DEV,
        drift: { drift: "differs", head: A, remote: B },
      }),
    });
    const group = panel.querySelector(GROUP);
    expect(group).not.toBeNull();
    expect(group!.previousElementSibling?.getAttribute("data-testid")).toBe(
      "settings-group-workflow-features",
    );
    expect(group!.querySelector(".settings-group-title")?.textContent).toBe(
      "Remote hosts",
    );
    expect(refreshCalls()).toEqual(["me@up-host"]);

    const up = group!.querySelector('[data-testid="remote-host-me@up-host"]')!;
    expect(
      up.querySelector('[data-testid="remote-host-state"]')?.textContent,
    ).toBe("Developer");
    expect(up.querySelector("code")?.textContent).toBe("HEAD aaaaaaa");
    expect(
      up.querySelector('[data-testid="remote-host-drift"]')?.textContent,
    ).toBe("Behind GitHub: this host is at aaaaaaa, GitHub at bbbbbbb.");
    const down = group!.querySelector(
      '[data-testid="remote-host-me@down-host"]',
    )!;
    expect(
      down.querySelector('[data-testid="remote-host-state"]')?.textContent,
    ).toBe("Absent");
    expect(
      down.querySelector('[data-testid="remote-host-drift"]')?.textContent,
    ).toBe("Connect a workspace on this host to check.");
  });

  // ⚠️ A late `setChecks` after unmount is NOT observable here: React 19 drops it without the old
  // warning, so a `console.error` assertion would pass with the cancel guard deleted (mutation-run
  // at WP5 Phase 2 build). What IS observable, and is the 5.3 property, is WORK started after the
  // panel closed: the next test.
  it("a refresh in flight when the panel closes is not repeated", async () => {
    let resolve: (o: RefreshOutcome) => void = () => {};
    const pending = new Promise<RefreshOutcome>((r) => (resolve = r));
    const panel = await mountPanel({
      hosts: [{ host: "me@up-host", link_up: true, substrate: DEV }],
      refresh: () => pending,
    });
    expect(
      panel.querySelector('[data-testid="remote-host-drift"]')?.textContent,
    ).toBe("Checking GitHub…");
    await act(async () => root!.unmount());
    root = null;
    await act(async () => {
      resolve({
        outcome: "checked",
        substrate: DEV,
        drift: { drift: "up_to_date", head: A, remote: A },
      });
      await pending;
    });
    await settle(50);
    expect(refreshCalls()).toEqual(["me@up-host"]);
  });

  it("closing the panel before the host list arrives starts no refresh at all", async () => {
    let resolveHosts: (h: RemoteHostEntry[]) => void = () => {};
    const hostsPending = new Promise<RemoteHostEntry[]>(
      (r) => (resolveHosts = r),
    );
    mockWindows("main");
    calls.length = 0;
    mockIPC(
      (cmd, args) => {
        calls.push({ cmd, args });
        if (cmd === "remote_hosts") return hostsPending;
        if (cmd === "remote_substrate_refresh") return { outcome: "link_down" };
        if (cmd === "profiles_list" || cmd === "profile_adoption_suggestions")
          return [];
        return null;
      },
      { shouldMockEvents: true },
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<SettingsPanel onClose={() => {}} />);
    });
    await settle();
    expect(calls.some((c) => c.cmd === "remote_hosts")).toBe(true);
    await act(async () => root!.unmount());
    root = null;
    await act(async () => {
      resolveHosts([{ host: "me@up-host", link_up: true, substrate: DEV }]);
      await hostsPending;
    });
    await settle(50);
    expect(refreshCalls()).toEqual([]);
  });

  it("a routed open highlights the group and scrolls it into view", async () => {
    const scrolled = recordScrolls();
    const panel = await mountPanel({
      hosts: [{ host: "me@up-host", link_up: false, substrate: DEV }],
      highlightGroup: "remote-hosts",
    });
    const group = panel.querySelector(GROUP)!;
    expect(group.getAttribute("data-highlighted")).toBe("true");
    expect(scrolled).toEqual([group]);
  });

  it("an ordinary open highlights and scrolls nothing", async () => {
    const scrolled = recordScrolls();
    const panel = await mountPanel({
      hosts: [{ host: "me@up-host", link_up: false, substrate: DEV }],
    });
    expect(panel.querySelector('[data-highlighted="true"]')).toBeNull();
    expect(scrolled).toEqual([]);
  });
});

// M18 WP6 — Install on an Absent host (§R.3, §R.5). The backend's events are emitted by hand
// (`shouldMockEvents`), in the order the real run sends them.
describe("Install on a remote host, from its entry", () => {
  const UP_ABSENT = {
    host: "me@up-host",
    link_up: true,
    substrate: { state: "absent" },
  } as const;
  const entry = (panel: HTMLElement, h = "me@up-host") =>
    panel.querySelector(`[data-testid="remote-host-${h}"]`)!;
  const q = (el: Element, id: string) =>
    el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click = async (el: HTMLElement | null) => {
    expect(el).not.toBeNull();
    await act(async () => el!.click());
    await settle();
  };
  const fire = async (event: string, payload: unknown) => {
    await act(async () => {
      await emit(event, payload);
    });
    await settle();
  };
  const cmds = (name: string) => calls.filter((c) => c.cmd === name);
  /** What the real backend answers for an Absent host (it never answers `null`). */
  const absent = (): RefreshOutcome => ({
    outcome: "checked",
    substrate: { state: "absent" },
    drift: null,
  });

  it("is offered only on an Absent host whose link is Up", async () => {
    const panel = await mountPanel({
      hosts: [
        UP_ABSENT,
        {
          host: "me@down-absent",
          link_up: false,
          substrate: { state: "absent" },
        },
        { host: "me@up-dev", link_up: true, substrate: DEV },
        {
          host: "me@up-unknown",
          link_up: true,
          substrate: { state: "unknown" },
        },
      ],
      refresh: (h) =>
        h === "me@up-dev"
          ? { outcome: "checked", substrate: DEV, drift: null }
          : h === "me@up-host"
            ? {
                outcome: "checked",
                substrate: { state: "absent" },
                drift: null,
              }
            : { outcome: "failed", reason: "x" },
    });
    expect(q(entry(panel), "remote-install-open")?.textContent).toBe(
      "Install…",
    );
    for (const h of ["me@down-absent", "me@up-dev", "me@up-unknown"]) {
      expect(q(entry(panel, h), "remote-install-open"), h).toBeNull();
    }
  });

  it("asks first, then starts THIS host's install and streams its output", async () => {
    const panel = await mountPanel({
      hosts: [UP_ABSENT],
      refresh: () => ({
        outcome: "checked",
        substrate: { state: "absent" },
        drift: null,
      }),
    });
    await click(q(entry(panel), "remote-install-open"));
    const consent = q(entry(panel), "remote-run")!;
    expect(consent.textContent).toContain("me@up-host");
    for (const item of REMOTE_CONSENT_ITEMS)
      expect(consent.textContent).toContain(item);
    expect(cmds("workflow_remote_install_start")).toEqual([]);

    await click(q(entry(panel), "remote-run-confirm"));
    expect(cmds("workflow_remote_install_start").map((c) => c.args)).toEqual([
      { host: "me@up-host" },
    ]);
    await fire("remote-run-phase", {
      op: "install",
      host: "me@up-host",
      phase: "clone",
    });
    await fire("remote-run-output", {
      host: "me@up-host",
      op: "install",
      line: "Cloning into 'x'...",
    });
    await fire("remote-run-output", {
      host: "me@up-host",
      op: "install",
      line: "[ok] feature-build",
    });
    expect(q(entry(panel), "remote-run-log")?.textContent).toBe(
      "Cloning into 'x'...\n[ok] feature-build",
    );
    const cancel = q(entry(panel), "remote-run-cancel") as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
    expect(cancel.textContent).toBe("Cancel");
  });

  it("Cancel is honoured during the clone and disabled once install.sh starts", async () => {
    const panel = await mountPanel({ hosts: [UP_ABSENT], refresh: absent });
    await click(q(entry(panel), "remote-install-open"));
    await click(q(entry(panel), "remote-run-confirm"));
    await fire("remote-run-phase", {
      op: "install",
      host: "me@up-host",
      phase: "clone",
    });
    await click(q(entry(panel), "remote-run-cancel"));
    expect(cmds("workflow_remote_run_cancel").length).toBe(1);
    expect(q(entry(panel), "remote-run-cancel")!.textContent).toBe(
      "Cancelling…",
    );

    const panel2 = panel;
    await fire("remote-run-phase", {
      op: "install",
      host: "me@up-host",
      phase: "install",
    });
    const cancel = q(entry(panel2), "remote-run-cancel") as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    expect(cancel.textContent).toBe(FINISHING_LABEL.install);
    expect(entry(panel2).textContent).toContain("it finishes");
  });

  it("a Cancel the backend refuses as too late says so", async () => {
    const panel = await mountPanel({
      hosts: [UP_ABSENT],
      refresh: absent,
      onCmd: (cmd) =>
        cmd === "workflow_remote_run_cancel"
          ? Promise.reject("Too late to cancel: install.sh is running")
          : undefined,
    });
    await click(q(entry(panel), "remote-install-open"));
    await click(q(entry(panel), "remote-run-confirm"));
    await click(q(entry(panel), "remote-run-cancel"));
    expect(entry(panel).textContent).toContain("Too late to cancel");
    expect(q(entry(panel), "remote-run-cancel")!.textContent).toBe("Cancel");
  });

  it("a success: the entry reads Managed through the store, re-checks the host, and the result says Installed", async () => {
    const MANAGED = {
      state: "managed",
      root: "/Users/me/.claudesk/vendor/my-claude-code-customization",
      head: A,
      record: {
        clone_path: "/Users/me/.claudesk/vendor/my-claude-code-customization",
        installed_at: "t",
        origin_url: "https://x",
      },
    } as const;
    let installed = false;
    const panel = await mountPanel({
      hosts: [UP_ABSENT],
      refresh: () =>
        installed
          ? {
              outcome: "checked",
              substrate: MANAGED,
              drift: { drift: "up_to_date", head: A, remote: A },
            }
          : { outcome: "checked", substrate: { state: "absent" }, drift: null },
    });
    expect(refreshCalls()).toEqual(["me@up-host"]);
    await click(q(entry(panel), "remote-install-open"));
    await click(q(entry(panel), "remote-run-confirm"));
    await fire("remote-run-phase", {
      op: "install",
      host: "me@up-host",
      phase: "install",
    });
    // The backend's re-probe writes the cache (this event) BEFORE it sends the finished event.
    installed = true;
    await fire("remote-substrate", { host: "me@up-host", substrate: MANAGED });
    expect(q(entry(panel), "remote-host-state")?.textContent).toBe("Managed");
    expect(
      q(entry(panel), "remote-run"),
      "the panel stays to show the result",
    ).not.toBeNull();
    await fire("remote-run-finished", {
      op: "install",
      host: "me@up-host",
      ok: true,
      cancelled: false,
      message: null,
    });
    expect(q(entry(panel), "remote-run-result")?.textContent).toBe("Installed");
    expect(q(entry(panel), "remote-run-message")).toBeNull();
    expect(refreshCalls()).toEqual(["me@up-host", "me@up-host"]);
    expect(q(entry(panel), "remote-host-drift")?.textContent).toBe(
      "Up to date with GitHub.",
    );
    expect(entry(panel).querySelector("code")?.textContent).toBe(
      "HEAD aaaaaaa",
    );
    await click(q(entry(panel), "remote-run-close"));
    expect(q(entry(panel), "remote-run")).toBeNull();
    expect(
      q(entry(panel), "remote-install-open"),
      "Managed: no Install",
    ).toBeNull();
  });

  it("a failure or a cancel shows the backend's words, and Close offers Install again", async () => {
    const panel = await mountPanel({ hosts: [UP_ABSENT], refresh: absent });
    for (const [finished, title] of [
      [
        { ok: false, cancelled: false, message: "git clone failed (exit 128)" },
        "Install failed",
      ],
      [
        {
          ok: false,
          cancelled: true,
          message: "Cancelled. Nothing was installed.",
        },
        "Cancelled",
      ],
    ] as const) {
      await click(q(entry(panel), "remote-install-open"));
      await click(q(entry(panel), "remote-run-confirm"));
      await fire("remote-run-finished", {
        op: "install",
        host: "me@up-host",
        ...finished,
      });
      expect(q(entry(panel), "remote-run-result")?.textContent).toBe(title);
      expect(q(entry(panel), "remote-run-message")?.textContent).toBe(
        finished.message,
      );
      await click(q(entry(panel), "remote-run-close"));
      expect(q(entry(panel), "remote-install-open")).not.toBeNull();
    }
    expect(refreshCalls()).toEqual(["me@up-host"]);
  });

  it("an open consent step closes when the host stops being Absent (another run installed it)", async () => {
    const panel = await mountPanel({ hosts: [UP_ABSENT], refresh: absent });
    await click(q(entry(panel), "remote-install-open"));
    expect(q(entry(panel), "remote-run-confirm")).not.toBeNull();
    await fire("remote-substrate", {
      host: "me@up-host",
      substrate: {
        state: "managed",
        root: null,
        head: null,
        record: {
          clone_path: "/x",
          installed_at: "t",
          origin_url: "https://x",
        },
      },
    });
    expect(q(entry(panel), "remote-host-state")?.textContent).toBe("Managed");
    expect(
      q(entry(panel), "remote-run"),
      "no stale consent on a Managed host",
    ).toBeNull();
    expect(q(entry(panel), "remote-install-open")).toBeNull();
  });

  it("a start refused AFTER the host stopped being Absent does not reopen the consent step", async () => {
    let reject: (reason: string) => void = () => {};
    const panel = await mountPanel({
      hosts: [UP_ABSENT],
      refresh: absent,
      onCmd: (cmd) =>
        cmd === "workflow_remote_install_start"
          ? new Promise((_, r) => (reject = r))
          : undefined,
    });
    await click(q(entry(panel), "remote-install-open"));
    await click(q(entry(panel), "remote-run-confirm"));
    await fire("remote-substrate", {
      host: "me@up-host",
      substrate: {
        state: "managed",
        root: null,
        head: null,
        record: {
          clone_path: "/x",
          installed_at: "t",
          origin_url: "https://x",
        },
      },
    });
    await act(async () =>
      reject("a workflow-system install or uninstall is already running"),
    );
    await settle();
    expect(q(entry(panel), "remote-host-state")?.textContent).toBe("Managed");
    expect(
      q(entry(panel), "remote-run"),
      "no consent on a Managed host",
    ).toBeNull();
    expect(q(entry(panel), "remote-run-confirm")).toBeNull();
  });

  it("a consent step hidden by a late refusal does not come back by itself when the host is offered again", async () => {
    let reject: (reason: string) => void = () => {};
    const panel = await mountPanel({
      hosts: [UP_ABSENT],
      refresh: absent,
      onCmd: (cmd) =>
        cmd === "workflow_remote_install_start"
          ? new Promise((_, r) => (reject = r))
          : undefined,
    });
    await click(q(entry(panel), "remote-install-open"));
    await click(q(entry(panel), "remote-run-confirm"));
    // The host stops being offered while the start is pending, the start is refused, then the host
    // is offered again (e.g. a link that dropped and came back).
    await fire("remote-substrate", {
      host: "me@up-host",
      substrate: { state: "unknown" },
    });
    await act(async () =>
      reject("Claudesk isn't connected to me@up-host right now."),
    );
    await settle();
    await fire("remote-substrate", {
      host: "me@up-host",
      substrate: { state: "absent" },
    });
    expect(
      q(entry(panel), "remote-run"),
      "no consent reopened by itself",
    ).toBeNull();
    expect(q(entry(panel), "remote-install-open")?.textContent).toBe(
      "Install…",
    );
    // And opening it again shows no stale reason.
    await click(q(entry(panel), "remote-install-open"));
    expect(q(entry(panel), "remote-run-start-error")).toBeNull();
  });

  it("a host that is Managed from the start offers no Install", async () => {
    const panel = await mountPanel({
      hosts: [
        {
          host: "me@up-host",
          link_up: true,
          substrate: {
            state: "managed",
            root: "/r",
            head: A,
            record: {
              clone_path: "/r",
              installed_at: "t",
              origin_url: "https://x",
            },
          },
        },
      ],
      refresh: () => ({ outcome: "failed", reason: "x" }),
    });
    expect(q(entry(panel), "remote-host-state")?.textContent).toBe("Managed");
    expect(q(entry(panel), "remote-install-open")).toBeNull();
  });

  it("a refused start returns to the consent step with the reason; another host's events are ignored", async () => {
    let refuse = true;
    const panel = await mountPanel({
      hosts: [UP_ABSENT],
      refresh: absent,
      onCmd: (cmd) =>
        cmd === "workflow_remote_install_start" && refuse
          ? Promise.reject("Claudesk isn't connected to me@up-host right now.")
          : undefined,
    });
    await click(q(entry(panel), "remote-install-open"));
    await click(q(entry(panel), "remote-run-confirm"));
    expect(q(entry(panel), "remote-run-start-error")?.textContent).toContain(
      "isn't connected",
    );
    expect(q(entry(panel), "remote-run-confirm")).not.toBeNull();

    refuse = false;
    await click(q(entry(panel), "remote-run-confirm"));
    await fire("remote-run-finished", {
      op: "install",
      host: "me@other-host",
      ok: true,
      cancelled: false,
      message: null,
    });
    await fire("remote-run-phase", {
      op: "install",
      host: "me@other-host",
      phase: "install",
    });
    expect(
      q(entry(panel), "remote-run-result"),
      "another host's end",
    ).toBeNull();
    expect(
      (q(entry(panel), "remote-run-cancel") as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

// M18 WP7 — which runs an entry offers (D12), as values.
describe("remoteRunOffers — the buttons per state", () => {
  const MAN = {
    state: "managed",
    root: "/r",
    head: A,
    record: { clone_path: "/c", installed_at: "t", origin_url: "u" },
  } as const;
  const checked = (drift: "up_to_date" | "differs"): RefreshOutcome => ({
    outcome: "checked",
    substrate: MAN,
    drift:
      drift === "differs"
        ? { drift, head: A, remote: B }
        : { drift, head: A, remote: A },
  });
  const none = { install: false, update: false, uninstall: false };

  it("Absent + link Up: Install only", () => {
    expect(remoteRunOffers({ state: "absent" }, true, undefined)).toEqual({
      ...none,
      install: true,
    });
  });

  it("Managed + Up + behind: Update and Uninstall; any other drift: Uninstall only", () => {
    expect(remoteRunOffers(MAN, true, checked("differs"))).toEqual({
      ...none,
      update: true,
      uninstall: true,
    });
    for (const check of [
      checked("up_to_date"),
      { outcome: "checking" } as const,
      { outcome: "failed", reason: "x" } as const,
      {
        outcome: "checked",
        substrate: MAN,
        drift: { drift: "cant_check", reason: "x" },
      } as const,
      undefined,
    ]) {
      expect(remoteRunOffers(MAN, true, check), JSON.stringify(check)).toEqual({
        ...none,
        uninstall: true,
      });
    }
  });

  it("a link that is down offers nothing; Developer and Unknown are never offered anything", () => {
    expect(remoteRunOffers(MAN, false, checked("differs"))).toEqual(none);
    expect(remoteRunOffers({ state: "absent" }, false, undefined)).toEqual(
      none,
    );
    for (const sub of [DEV, { state: "unknown" } as const]) {
      expect(remoteRunOffers(sub, true, undefined)).toEqual(none);
    }
  });
});

describe("Update and Uninstall on a Managed host, from its entry", () => {
  const MAN = {
    state: "managed",
    root: "/Users/me/.claudesk/vendor/my-claude-code-customization",
    head: A,
    record: {
      clone_path: "/Users/me/.claudesk/vendor/my-claude-code-customization",
      installed_at: "t",
      origin_url: "https://x",
    },
  } as const;
  const UP_MANAGED = {
    host: "me@up-host",
    link_up: true,
    substrate: MAN,
  } as const;
  const behind = (): RefreshOutcome => ({
    outcome: "checked",
    substrate: MAN,
    drift: { drift: "differs", head: A, remote: B },
  });
  const entry = (panel: HTMLElement, h = "me@up-host") =>
    panel.querySelector(`[data-testid="remote-host-${h}"]`)!;
  const q = (el: Element, id: string) =>
    el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click = async (el: HTMLElement | null) => {
    expect(el).not.toBeNull();
    await act(async () => el!.click());
    await settle();
  };
  const fire = async (event: string, payload: unknown) => {
    await act(async () => {
      await emit(event, payload);
    });
    await settle();
  };
  const cmds = (name: string) => calls.filter((c) => c.cmd === name);

  it("a behind Managed host offers Update and Uninstall; an up-to-date one only Uninstall; the live account (Developer) nothing", async () => {
    const panel = await mountPanel({
      hosts: [
        UP_MANAGED,
        { host: "me@current", link_up: true, substrate: MAN },
        { host: "me@up-dev", link_up: true, substrate: DEV },
      ],
      refresh: (h) =>
        h === "me@up-host"
          ? behind()
          : h === "me@current"
            ? {
                outcome: "checked",
                substrate: MAN,
                drift: { drift: "up_to_date", head: A, remote: A },
              }
            : { outcome: "checked", substrate: DEV, drift: null },
    });
    expect(q(entry(panel), "remote-update-open")?.textContent).toBe("Update…");
    expect(q(entry(panel), "remote-uninstall-open")?.textContent).toBe(
      "Uninstall…",
    );
    expect(q(entry(panel), "remote-install-open")).toBeNull();
    expect(q(entry(panel, "me@current"), "remote-update-open")).toBeNull();
    expect(
      q(entry(panel, "me@current"), "remote-uninstall-open"),
    ).not.toBeNull();
    const dev = entry(panel, "me@up-dev");
    for (const op of ["install", "update", "uninstall"]) {
      expect(q(dev, `remote-${op}-open`), op).toBeNull();
    }
    expect(dev.querySelector("button")).toBeNull();
  });

  it("Update: confirm, then THIS host's run; Cancel during the fetch, Finishing once install.sh runs; the result says Updated", async () => {
    const panel = await mountPanel({ hosts: [UP_MANAGED], refresh: behind });
    await click(q(entry(panel), "remote-update-open"));
    expect(q(entry(panel), "remote-run")!.textContent).toContain(
      "Fast-forwards the clone",
    );
    expect(cmds("workflow_remote_update_start")).toEqual([]);
    await click(q(entry(panel), "remote-run-confirm"));
    expect(cmds("workflow_remote_update_start").map((c) => c.args)).toEqual([
      { host: "me@up-host" },
    ]);
    await fire("remote-run-phase", {
      host: "me@up-host",
      op: "update",
      phase: "fetch",
    });
    await fire("remote-run-output", {
      host: "me@up-host",
      op: "update",
      line: "Fast-forward",
    });
    // Another op's line (an install elsewhere is impossible, but the filter keys on both).
    await fire("remote-run-output", {
      host: "me@up-host",
      op: "install",
      line: "not mine",
    });
    expect(q(entry(panel), "remote-run-log")?.textContent).toBe("Fast-forward");
    const cancel = q(entry(panel), "remote-run-cancel") as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
    await fire("remote-run-phase", {
      host: "me@up-host",
      op: "update",
      phase: "install",
    });
    const finishing = q(entry(panel), "remote-run-cancel") as HTMLButtonElement;
    expect(finishing.textContent).toBe("Finishing the update…");
    expect(finishing.disabled, "no Cancel once install.sh runs").toBe(true);
    await fire("remote-run-finished", {
      host: "me@up-host",
      op: "update",
      ok: true,
      cancelled: false,
      message: null,
    });
    expect(q(entry(panel), "remote-run-result")?.textContent).toBe("Updated");
    expect(
      cmds("remote_substrate_refresh").length,
      "a success re-checks the entry",
    ).toBe(2);
  });

  it("Uninstall: the confirm IS the host's dry run and the approved clone; confirm runs it, with no Cancel", async () => {
    const panel = await mountPanel({
      hosts: [UP_MANAGED],
      refresh: behind,
      onCmd: (cmd) =>
        cmd === "workflow_remote_uninstall_preview"
          ? {
              host: "me@up-host",
              clone_dir:
                "/Users/me/.claudesk/vendor/my-claude-code-customization",
              preview: "  [remove] skills/feature-build (dry-run)",
            }
          : undefined,
    });
    await click(q(entry(panel), "remote-uninstall-open"));
    expect(
      cmds("workflow_remote_uninstall_preview").map((c) => c.args),
    ).toEqual([{ host: "me@up-host" }]);
    expect(q(entry(panel), "remote-uninstall-preview")?.textContent).toBe(
      "  [remove] skills/feature-build (dry-run)",
    );
    expect(q(entry(panel), "remote-uninstall-clone")?.textContent).toBe(
      "/Users/me/.claudesk/vendor/my-claude-code-customization",
    );
    expect(cmds("workflow_remote_uninstall_start")).toEqual([]);
    await click(q(entry(panel), "remote-run-confirm"));
    expect(cmds("workflow_remote_uninstall_start").length).toBe(1);
    expect(q(entry(panel), "remote-run-cancel"), "no Cancel").toBeNull();
    expect(entry(panel).textContent).toContain("Uninstall can't be cancelled");
    await fire("remote-run-finished", {
      host: "me@up-host",
      op: "uninstall",
      ok: true,
      cancelled: false,
      message: null,
    });
    expect(q(entry(panel), "remote-run-result")?.textContent).toBe(
      "Uninstalled",
    );
  });

  it("a preview the guard refuses shows its plain words and offers no Uninstall button", async () => {
    const panel = await mountPanel({
      hosts: [UP_MANAGED],
      refresh: behind,
      onCmd: (cmd) =>
        cmd === "workflow_remote_uninstall_preview"
          ? Promise.reject(
              "Claudesk has no record of installing this workflow system, so it will not remove it.",
            )
          : undefined,
    });
    await click(q(entry(panel), "remote-uninstall-open"));
    expect(q(entry(panel), "remote-uninstall-refused")?.textContent).toContain(
      "will not remove it",
    );
    expect(q(entry(panel), "remote-run-confirm")).toBeNull();
    expect(q(entry(panel), "remote-uninstall-preview")).toBeNull();
    await click(q(entry(panel), "remote-run-dismiss"));
    expect(q(entry(panel), "remote-uninstall-open")).not.toBeNull();
  });

  it("Settings reopened mid-run shows THIS host's run and its end, not a button the backend would refuse", async () => {
    const panel = await mountPanel({
      hosts: [
        { host: "me@up-host", link_up: true, substrate: { state: "absent" } },
        { host: "me@other", link_up: true, substrate: { state: "absent" } },
      ],
      refresh: () => ({
        outcome: "checked",
        substrate: { state: "absent" },
        drift: null,
      }),
      onCmd: (cmd) =>
        cmd === "workflow_remote_run_state"
          ? { host: "me@up-host", op: "install", phase: "clone" }
          : undefined,
    });
    expect(q(entry(panel), "remote-install-open")).toBeNull();
    expect(q(entry(panel), "remote-run-reattached")).not.toBeNull();
    expect(
      (q(entry(panel), "remote-run-cancel") as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      q(entry(panel, "me@other"), "remote-install-open"),
      "another host's entry is unaffected",
    ).not.toBeNull();
    await fire("remote-run-output", {
      host: "me@up-host",
      op: "install",
      line: "[ok] feature-build",
    });
    await fire("remote-run-finished", {
      host: "me@up-host",
      op: "install",
      ok: true,
      cancelled: false,
      message: null,
    });
    expect(q(entry(panel), "remote-run-result")?.textContent).toBe("Installed");
  });

  // WP8 P1.2 (`SURFACE-2026-11-20-QUALITY-REATTACH-RACES-ITS-LISTENERS`). A slow backend: the
  // three `listen` replies are held back, then the run finishes while the run-state question is
  // still unanswered, and the answer names the run as it was when the backend read it.
  it("a run that ends while a reopened panel is still asking shows its end, not a stuck run", async () => {
    let releaseListens!: () => void;
    const listensHeld = new Promise<void>((r) => (releaseListens = r));
    let answer!: (v: unknown) => void;
    const panel = await mountPanel({
      hosts: [UP_MANAGED],
      refresh: behind,
      onCmd: (cmd) =>
        cmd === "workflow_remote_run_state"
          ? new Promise((r) => (answer = r))
          : undefined,
      wrapInvoke: (inv) => async (cmd, args, o) => {
        // The handler registers now (the mock does it synchronously); only the reply waits.
        const reply = inv(cmd, args, o);
        if (cmd === "plugin:event|listen") await listensHeld;
        return reply;
      },
    });
    expect(
      cmds("workflow_remote_run_state"),
      "subscribe, then query: no question while the listens are unanswered",
    ).toHaveLength(0);
    await act(async () => releaseListens());
    await settle();
    expect(cmds("workflow_remote_run_state")).toHaveLength(1);
    await fire("remote-run-finished", {
      host: "me@up-host",
      op: "update",
      ok: true,
      cancelled: false,
      message: null,
    });
    await act(async () =>
      answer({ host: "me@up-host", op: "update", phase: "fetch" }),
    );
    await settle();
    expect(q(entry(panel), "remote-run-result")?.textContent).toBe("Updated");
    expect(q(entry(panel), "remote-run-cancel"), "no live Cancel").toBeNull();
    expect(entry(panel).textContent).not.toContain("Updating this host");
  });
});

// M18 WP6 — the copy the operator approved at P3.verify-human.2–4 (2026-11-20), pinned by LITERAL.
// The render tests loop over the constants, so a reworded constant would pass them; these do not.
describe("the remote install's approved words, as values", () => {
  it("the consent step lists exactly what changes on the host", () => {
    expect(REMOTE_CONSENT_ITEMS).toEqual([
      "Clones the companion repository (public HTTPS) to ~/.claudesk/vendor/my-claude-code-customization on that host.",
      "Runs its own install.sh there, which links its skills and agents into ~/.claude/ and adds a workflow block to ~/.claude/CLAUDE.md, for that host account only.",
      "Writes a small record (~/.claudesk/install-record.json) so Claudesk knows it installed this and can offer Uninstall later.",
      "Changes nothing on this Mac, and nothing in that account's ~/.claude/settings.json.",
      "Cancel works while the repository is cloning; once install.sh starts (about a second), the run finishes.",
    ]);
  });

  // M18 WP7 — the Update and Uninstall copy the operator approved at P4.verify-human.1–4
  // (2026-11-20), pinned by LITERAL as the install's is.
  it("Update's confirm lists exactly what it does on the host", () => {
    expect(REMOTE_UPDATE_ITEMS).toEqual([
      "Fetches the latest version from GitHub into the clone at ~/.claudesk/vendor/my-claude-code-customization.",
      "Fast-forwards the clone. If it has local changes or commits of its own, nothing is changed and you are told why.",
      "Runs install.sh again, which refreshes the links in ~/.claude/ and the workflow block in ~/.claude/CLAUDE.md.",
      "Cancel works while fetching; once install.sh starts, the run finishes.",
    ]);
  });

  it("Uninstall's confirm frames the host's own dry run", () => {
    expect(REMOTE_UNINSTALL_INTRO).toBe(
      "Claudesk will run the host's own uninstall.sh, then delete the clone and the install record. Here is what uninstall.sh says it will remove:",
    );
    expect(REMOTE_UNINSTALL_NOTE).toBe(
      "It doesn't edit that account's ~/.claude/settings.json, and changes nothing on this Mac. Uninstall can't be cancelled once it starts; it takes about a second.",
    );
  });

  it("each op's result heading", () => {
    const t = (op: "install" | "update" | "uninstall", ok: boolean) =>
      resultTitle({ host: "h", op, ok, cancelled: false, message: null });
    expect([t("update", true), t("update", false)]).toEqual([
      "Updated",
      "Update failed",
    ]);
    expect([t("uninstall", true), t("uninstall", false)]).toEqual([
      "Uninstalled",
      "Uninstall failed",
    ]);
  });

  it("Cancel says the install is finishing once install.sh started", () => {
    expect(FINISHING_LABEL).toEqual({
      install: "Finishing the install…",
      update: "Finishing the update…",
    });
  });

  it("the result's heading: Installed / Install failed / Cancelled", () => {
    const r = (ok: boolean, cancelled: boolean) =>
      resultTitle({ host: "h", op: "install", ok, cancelled, message: null });
    expect([r(true, false), r(false, false), r(false, true)]).toEqual([
      "Installed",
      "Install failed",
      "Cancelled",
    ]);
  });
});
