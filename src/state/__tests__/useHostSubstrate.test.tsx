// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import {
  resetHostSubstrateStoreForTests,
  useHostSubstrate,
  useHostSubstrates,
} from "../useHostSubstrate";
import {
  HOST_SUBSTRATE_EVENT,
  hostSubstrateFor,
  type HostInput,
  type HostSubstrate,
} from "../hostSubstrate";

// M18 WP4 (§R.2) — the host-substrate seam: a LOCAL key costs nothing (no listen, no invoke); a
// remote key reads closed until seeded, then tracks `remote-substrate` for ITS host only.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const REMOTE = "ssh://me@mini-host/Users/me/proj";
const DEV: HostSubstrate = { state: "developer", root: "/r", head: null };

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let seen: HostInput[] = [];

function Probe({ path }: { path: string }) {
  seen.push(useHostSubstrate(path));
  return null;
}

let mapSeen: Readonly<Record<string, HostSubstrate>>[] = [];
function MapProbe({ active }: { active: boolean }) {
  mapSeen.push(useHostSubstrates(active));
  return null;
}

async function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  await settle();
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  seen = [];
  mapSeen = [];
  resetHostSubstrateStoreForTests();
  clearMocks();
});

describe("useHostSubstrate", () => {
  it("answers a local key 'local' with no IPC at all (not even a listen)", async () => {
    const calls: string[] = [];
    mockWindows("main");
    // Events NOT mocked: a `listen` would reach this handler as `plugin:event|listen`.
    mockIPC((cmd) => {
      calls.push(cmd);
      return null;
    });
    await mount(<Probe path="/Users/me/proj" />);
    expect(seen.at(-1)).toBe("local");
    expect(calls).toEqual([]);
  });

  it("positive control: with events unmocked, a REMOTE key's listen does reach the handler", async () => {
    const calls: string[] = [];
    mockWindows("main");
    mockIPC((cmd) => {
      calls.push(cmd);
      return cmd === "remote_host_substrates" ? {} : 1;
    });
    await mount(<Probe path={REMOTE} />);
    expect(calls).toContain("plugin:event|listen");
    expect(calls).toContain("remote_host_substrates");
  });

  it("a failed listen does not latch the store: the next subscriber starts it again", async () => {
    // paydown-2026-11-27 WP5. Latched, every remote host would read closed all session.
    const calls: string[] = [];
    let listens = 0;
    mockWindows("main");
    mockIPC((cmd) => {
      calls.push(cmd);
      if (cmd === "plugin:event|listen") {
        listens += 1;
        if (listens === 1) throw new Error("listen refused");
        return 1;
      }
      return cmd === "remote_host_substrates" ? { "me@mini-host": DEV } : null;
    });
    const quiet = console.error;
    console.error = () => {};
    try {
      await mount(<Probe path={REMOTE} />);
      expect(listens).toBe(1);
      expect(calls).not.toContain("remote_host_substrates");
      await act(async () => root?.unmount());
      host?.remove();
      seen = [];
      await mount(<Probe path={REMOTE} />);
    } finally {
      console.error = quiet;
    }
    expect(listens).toBe(2);
    expect(calls).toContain("remote_host_substrates");
    expect(seen.at(-1)).toEqual(DEV);
  });

  it("a picker with no remote row touches nothing either", async () => {
    const calls: string[] = [];
    mockWindows("main");
    mockIPC((cmd) => {
      calls.push(cmd);
      return null;
    });
    await mount(<MapProbe active={false} />);
    expect(mapSeen.at(-1)).toEqual({});
    expect(calls).toEqual([]);
  });

  it("a remote key is closed until seeded, then tracks its own host's events", async () => {
    const calls: string[] = [];
    mockWindows("main");
    mockIPC(
      (cmd) => {
        calls.push(cmd);
        return cmd === "remote_host_substrates"
          ? { "me@mini-host": DEV }
          : null;
      },
      { shouldMockEvents: true },
    );
    await mount(<Probe path={REMOTE} />);
    expect(seen[0]).toBeUndefined();
    expect(seen.at(-1)).toEqual(DEV);
    expect(calls).toEqual(["remote_host_substrates"]);
    await act(async () =>
      emit(HOST_SUBSTRATE_EVENT, {
        host: "other@host",
        substrate: { state: "absent" },
      }),
    );
    await settle();
    expect(seen.at(-1)).toEqual(DEV);
    await act(async () =>
      emit(HOST_SUBSTRATE_EVENT, {
        host: "me@mini-host",
        substrate: { state: "absent" },
      }),
    );
    await settle();
    expect(seen.at(-1)).toEqual({ state: "absent" });
  });

  it("a host the seed does not name stays closed (undefined), never 'local'", async () => {
    mockWindows("main");
    mockIPC((cmd) => (cmd === "remote_host_substrates" ? {} : null), {
      shouldMockEvents: true,
    });
    await mount(<Probe path={REMOTE} />);
    expect(seen.at(-1)).toBeUndefined();
  });

  it("the picker map and hostSubstrateFor give each row its host's value", async () => {
    mockWindows("main");
    mockIPC(
      (cmd) =>
        cmd === "remote_host_substrates" ? { "me@mini-host": DEV } : null,
      { shouldMockEvents: true },
    );
    await mount(<MapProbe active={true} />);
    const map = mapSeen.at(-1)!;
    expect(hostSubstrateFor(REMOTE, map)).toEqual(DEV);
    expect(hostSubstrateFor("ssh://x@y/p", map)).toBeUndefined();
    expect(hostSubstrateFor("/Users/me/proj", map)).toBe("local");
  });
});
