// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { WORKFLOW_FEATURES_ENABLED_EVENT } from "../../../state/workflowGate";
import { ProjectPicker } from "../ProjectPicker";

// Paydown 2026-11-04 WP13 — each row's gate decision, on a live mount of the real picker.
//
// Since WP13 the picker computes `isWorkflowApplicable(gateOn, row.profile)` and hands the row
// the result as a prop. Nothing pinned that value end to end: replacing it with a constant
// `true` passed all 632 picker/state tests (and the inline form at HEAD had the same hole). The
// `/session-restore` arm is the gated one (`armAvailable` in announceRow.ts), so a row
// announcing it is the observable: with the gate OFF no row may show it, and with the gate ON
// only a DEFAULT-profile row may (F-b ruling 4: another profile's sessions are not the
// workflow's). The `--continue` arm is ungated and is the control that the row renders at all.
//
// ⚠️ The gate is moved through the seam's broadcast, never by answering its seed command by
// name (offInvariantGuard; the `gateOffClearWiring.test.tsx` precedent).

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  clearMocks();
});

async function mount(gateOn: boolean) {
  mockWindows("main");
  mockIPC(
    (cmd) => {
      switch (cmd) {
        case "prune_missing_projects":
          return [];
        case "list_projects":
          return [
            {
              project_path: "/p/plain",
              display_name: "plain",
              last_opened_at: 3,
            },
            {
              project_path: "/p/on-neo",
              display_name: "on-neo",
              last_opened_at: 2,
              profile: "neo",
            },
            {
              project_path: "/p/crashed",
              display_name: "crashed",
              last_opened_at: 1,
            },
          ];
        case "picker_announce_actions":
          return {
            "/p/plain": "restore",
            "/p/on-neo": "restore",
            "/p/crashed": "continue",
          };
        case "profiles_list":
          return [
            {
              name: "neo",
              config_dir: "/u/.config/claude-neo",
              provenance: "adopted",
            },
          ];
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
    root!.render(<ProjectPicker onOpen={() => {}} />);
    await new Promise((r) => setTimeout(r, 25));
  });
  if (gateOn) {
    await act(async () => {
      await emit(WORKFLOW_FEATURES_ENABLED_EVENT, true);
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}

/** Each row's name → its announcement text (`null` when it announces nothing). */
function announcements(): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const button of host!.querySelectorAll(
    '[data-testid="picker-recent"]',
  )) {
    const name = button.querySelector(".picker-recent-name")!.textContent!;
    out[name] =
      button.querySelector('[data-testid="picker-recent-announce"]')
        ?.textContent ?? null;
  }
  return out;
}

describe("the picker hands each row ITS OWN gate decision", () => {
  it("gate OFF: no row offers /session-restore; the ungated continue still shows", async () => {
    await mount(false);
    expect(announcements()).toEqual({
      plain: null,
      "on-neo": null,
      crashed: "↻ continue",
    });
  });

  it("gate ON: only the DEFAULT-profile row offers /session-restore", async () => {
    await mount(true);
    expect(announcements()).toEqual({
      plain: "↻ /session-restore",
      "on-neo": null,
      crashed: "↻ continue",
    });
  });
});
