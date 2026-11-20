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
import type {
  RefreshOutcome,
  RemoteHostEntry,
} from "../../../state/remoteHosts";
import { resetHostSubstrateStoreForTests } from "../../../state/useHostSubstrate";

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

async function mountPanel(opts: {
  hosts: RemoteHostEntry[];
  refresh?: (host: string) => RefreshOutcome | Promise<RefreshOutcome>;
  highlightGroup?: string;
}): Promise<HTMLDivElement> {
  mockWindows("main");
  calls.length = 0;
  mockIPC(
    (cmd, args) => {
      calls.push({ cmd, args });
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
