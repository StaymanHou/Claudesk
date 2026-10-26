// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { WORKFLOW_FEATURES_ENABLED_EVENT } from "../state/workflowGate";

// M16.5 WP4 Phase 3 — the gate-OFF clear, driven through the REAL `App` and the REAL gate seam
// (`useWorkflowFeaturesEnabled`, NOT stubbed here, unlike `closeWiring.test.tsx`). The hook's own
// edge logic is pinned in `useClearAttentionOnGateOff.test.tsx`. What this file adds is that
// `App` actually calls it with the live gate value: delete the call in `App.tsx`, or feed it a
// constant, and every hook test stays green.

const calls: string[] = [];
const uncaught: unknown[] = [];
const onError = (e: ErrorEvent) => uncaught.push(e.error ?? e.message);
let root: Root | null = null;
let host: HTMLDivElement | null = null;

// ⚠️ The gate's seed command is deliberately NOT answered by name: `offInvariantGuard` allows
// only the seam's own files to name it. The seed reads `null` (falsy, the pre-seed OFF), and the
// gate is moved through the seam's broadcast event instead, which is the path a real flip takes.
function boot() {
  mockWindows("main");
  mockIPC(
    (cmd) => {
      calls.push(cmd);
      if (cmd === "list_projects" || cmd === "prune_missing_projects")
        return [];
      if (cmd === "picker_announce_actions") return {};
      if (cmd === "workspace_status_clear_attention") return 0;
      return null;
    },
    { shouldMockEvents: true },
  );
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

async function mountApp() {
  const { default: App } = await import("../App");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<App />));
  await settle();
}

async function setGate(enabled: boolean) {
  await act(async () => {
    await emit(WORKFLOW_FEATURES_ENABLED_EVENT, enabled);
  });
  await settle();
}

const clears = () =>
  calls.filter((c) => c === "workspace_status_clear_attention");

beforeEach(() => {
  calls.length = 0;
  uncaught.length = 0;
  window.addEventListener("error", onError);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  await settle();
  host?.remove();
  root = null;
  host = null;
  window.removeEventListener("error", onError);
  clearMocks();
  expect(uncaught).toEqual([]);
});

describe("the gate-OFF clear on the real App", () => {
  it("turning the gate OFF clears the overlays exactly once", async () => {
    boot();
    await mountApp();
    await setGate(true);
    // Turning it ON sends nothing, so the one clear below belongs to the OFF edge.
    expect(clears()).toEqual([]);

    await setGate(false);
    expect(clears()).toHaveLength(1);
  });

  it("booting with the gate OFF, then turning it ON, sends nothing", async () => {
    boot();
    await mountApp();
    await setGate(true);
    expect(clears()).toEqual([]);
  });
});
