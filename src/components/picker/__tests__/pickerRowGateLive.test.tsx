// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mountPicker, teardownLive } from "./livePicker";

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

afterEach(teardownLive);

async function mount(gateOn: boolean) {
  const { el } = await mountPicker({
    projects: [
      { project_path: "/p/plain", display_name: "plain", last_opened_at: 3 },
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
    ],
    announce: {
      "/p/plain": "restore",
      "/p/on-neo": "restore",
      "/p/crashed": "continue",
    },
    profiles: [
      {
        name: "neo",
        config_dir: "/u/.config/claude-neo",
        provenance: "adopted",
      },
    ],
    gateOn,
  });
  return el;
}

/** Each row's name → its announcement text (`null` when it announces nothing). */
function announcements(el: ParentNode): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const button of el.querySelectorAll('[data-testid="picker-recent"]')) {
    const name = button.querySelector(".picker-recent-name")!.textContent!;
    out[name] =
      button.querySelector('[data-testid="picker-recent-announce"]')
        ?.textContent ?? null;
  }
  return out;
}

describe("the picker hands each row ITS OWN gate decision", () => {
  it("gate OFF: no row offers /session-restore; the ungated continue still shows", async () => {
    const el = await mount(false);
    expect(announcements(el)).toEqual({
      plain: null,
      "on-neo": null,
      crashed: "↻ continue",
    });
  });

  it("gate ON: only the DEFAULT-profile row offers /session-restore", async () => {
    const el = await mount(true);
    expect(announcements(el)).toEqual({
      plain: "↻ /session-restore",
      "on-neo": null,
      crashed: "↻ continue",
    });
  });
});
