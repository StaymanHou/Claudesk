import { describe, expect, it, vi, beforeEach } from "vitest";

// The N→1 collapse is the whole point of this seam, so it is asserted as BEHAVIOR rather than
// inferred from the source shape. `ensureStarted` is module-scoped, not React-scoped, so it can
// be driven directly — no component-render harness needed.
//
// ⚠️ What this can and cannot prove. It proves the fetch + subscribe happen exactly ONCE
// however many consumers arrive, and that a broadcast reaches every subscriber. It does NOT
// prove React re-renders on that update — that needs a live app, and the `pipEntryWiring`
// guard covers the component reading through `usePipMode()`.
// (`SURFACE-2026-06-27-QUALITY-WP5-PIPMODE-STATE-DUP-PER-WORKSPACE`.)

const invoke = vi.fn();
const listen = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listen(...args),
}));

/** Fresh module instance — the shared cache is module state, so it must be reset per test. */
async function freshSeam() {
  vi.resetModules();
  invoke.mockReset();
  listen.mockReset();
  invoke.mockResolvedValue("on");
  listen.mockResolvedValue(() => {});
  return import("../usePipMode");
}

describe("usePipMode — one fetch and one subscription for the whole app", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("N consumers trigger exactly ONE pip_get_mode and ONE listen", async () => {
    const seam = await freshSeam();
    // Ten workspaces' worth of consumers. Before this seam existed, each mounted
    // RightPanelHost ran its own fetch + listen, so this would have been 10 and 10.
    for (let i = 0; i < 10; i++) seam.__ensureStartedForTest();

    const getModeCalls = invoke.mock.calls.filter(
      (c) => c[0] === "pip_get_mode",
    );
    expect(
      getModeCalls,
      "the backend must be read once, not once per consumer",
    ).toHaveLength(1);

    const modeListens = listen.mock.calls.filter((c) => c[0] === "pip-mode");
    expect(
      modeListens,
      "one broadcast subscription serves every consumer",
    ).toHaveLength(1);
  });

  it("a broadcast reaches every subscriber, not just the one that clicked", async () => {
    const seam = await freshSeam();
    seam.__ensureStartedForTest();

    const seen: string[][] = [[], [], []];
    const unsubs = seen.map((bucket, i) =>
      seam.__subscribeForTest((m) => {
        seen[i] = [...bucket, m];
      }),
    );

    seam.setPipModeOptimistic("off");
    expect(
      seen.map((s) => s.at(-1)),
      "every workspace must reflect the change — the old per-instance state updated only the clicked one",
    ).toEqual(["off", "off", "off"]);

    unsubs.forEach((u) => u());
    seam.setPipModeOptimistic("auto");
    expect(
      seen.map((s) => s.at(-1)),
      "unsubscribed consumers must stop receiving updates",
    ).toEqual(["off", "off", "off"]);
  });

  it("a consumer arriving after the fetch resolves reads the resolved value", async () => {
    const seam = await freshSeam();
    seam.__ensureStartedForTest();
    await vi.waitFor(() => expect(seam.__currentForTest()).toBe("on"));
    // The late arrival's `useState` initializer reads this same cache, so it starts at "on"
    // rather than the "auto" default — which is why the hook seeds lazily instead of
    // re-syncing with a setState inside its effect (a cascading render this repo lints as an
    // error).
    expect(seam.__currentForTest()).toBe("on");
  });
});
