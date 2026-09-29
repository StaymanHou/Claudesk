// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import GlobalDashboard from "../GlobalDashboard";

// The analytics dashboard's OPEN, on a live mount: the real component, the real seed/fetch
// effects, mocked Tauri IPC. Pins two things a source guard cannot see:
//   1. it opens on the WEEK view and fetches only that (operator ask, 2026-09-28);
//   2. an UNRESOLVED tracking seed never renders the "Time tracking is off" empty state — the
//      operator saw that false claim flash for ~0.5 s on every open while tracking was ON.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const OFF_TEXT = "Time tracking is off";

const WEEK_PAYLOAD = {
  kind: "week",
  label: "WEEK 40 · SEP 28 — OCT 04",
  days: ["MON 28", "TUE 29", "WED 30", "THU 01", "FRI 02", "SAT 03", "SUN 04"],
  projects: [],
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const queries: { window: { kind: string } }[] = [];

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 25));
  });
}

/** Mount with a tracking seed the test resolves by hand (`resolveSeed`). */
async function mount() {
  queries.length = 0;
  let resolveSeed: (v: boolean) => void = () => {};
  const seed = new Promise<boolean>((r) => {
    resolveSeed = r;
  });
  mockWindows("main");
  mockIPC(
    async (cmd, args) => {
      switch (cmd) {
        case "time_get_tracking_enabled":
          return seed;
        case "time_analytics_query":
          queries.push(args as { window: { kind: string } });
          return WEEK_PAYLOAD;
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
    root!.render(<GlobalDashboard onClose={() => {}} />);
  });
  await settle();
  return {
    resolveSeed: async (v: boolean) => {
      await act(async () => resolveSeed(v));
      await settle();
    },
  };
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  clearMocks();
});

describe("GlobalDashboard open", () => {
  it("opens on the Week view and fetches only the week", async () => {
    const { resolveSeed } = await mount();
    await resolveSeed(true);
    expect(queries.map((q) => q.window.kind)).toEqual(["week"]);
    const active = [
      ...host!.querySelectorAll(
        '[aria-pressed="true"],[aria-selected="true"],[aria-checked="true"]',
      ),
    ].map((el) => el.textContent?.trim());
    expect(active).toContain("Week");
  });

  it("never claims tracking is off while the seed is unresolved", async () => {
    const { resolveSeed } = await mount();
    expect(host!.textContent).not.toContain(OFF_TEXT);
    await resolveSeed(true);
    expect(host!.textContent).not.toContain(OFF_TEXT);
  });

  it("does show the off state once the seed says tracking is OFF (positive control)", async () => {
    const { resolveSeed } = await mount();
    await resolveSeed(false);
    expect(host!.textContent).toContain(OFF_TEXT);
    expect(queries).toEqual([]);
  });
});
