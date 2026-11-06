// @vitest-environment jsdom
//
// Paydown 2026-11-04 WP13 — each group BODY renders inside its OWN group shell.
//
// SettingsPanel.tsx is the shell (group order, ids, titles, hints) and each body is a module
// beside it. The source guards that used to check "this control sits inside that group" did it
// by splicing one file's source between two `id="…"` markers. Once the body moved to its own
// file that question stopped being about source text, so it is asserted here on a live mount
// of the real panel (createRoot + act + mockIPC, the `profilesSettingsLive.test.tsx` pattern).
//
// ⚠️ Each placement is asserted as IDENTITY, not presence: the control must be found inside its
// group AND be the only element with that testid in the panel. A bare "the group contains it"
// would pass on a panel that rendered a body twice.
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { WORKFLOW_FEATURES_ENABLED_EVENT } from "../../../state/workflowGate";
import SettingsPanel from "../SettingsPanel";
import { visibleChords } from "../../workspace/chordRegistry";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
/** Every IPC call the mounted panel made, in order. */
const calls: { cmd: string; args: unknown }[] = [];

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  clearMocks();
});

async function mountPanel(): Promise<HTMLDivElement> {
  mockWindows("main");
  calls.length = 0;
  mockIPC(
    (cmd, args) => {
      calls.push({ cmd, args });
      switch (cmd) {
        // A Claudesk-managed substrate, so every arm this file checks renders. ⚠️ The gate's
        // seed command is deliberately NOT answered by name (offInvariantGuard allows only the
        // seam's own files to name it); it reads null (OFF) and is turned ON through the seam's
        // broadcast below, the `gateOffClearWiring.test.tsx` precedent.
        case "workflow_substrate_installed":
          return true;
        case "workflow_install_state":
          return "managed";
        case "cc_get_permission_mode":
          return "bypassPermissions";
        case "time_get_tracking_enabled":
          return false;
        case "updater_get_notifications_enabled":
          return true;
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
      <SettingsPanel onClose={() => {}} onCheckForUpdates={() => {}} />,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  await act(async () => {
    await emit(WORKFLOW_FEATURES_ENABLED_EVENT, true);
    await new Promise((r) => setTimeout(r, 10));
  });
  // Anti-vacuity: the gate really is ON, or the gate-dependent arms below prove nothing.
  expect(
    host.querySelector<HTMLInputElement>(
      '[data-testid="settings-workflow-features"]',
    )?.checked,
  ).toBe(true);
  return host;
}

/** The ONE element with `testid` in the panel, asserted to be inside group `groupId`. */
function expectOnlyInGroup(
  panel: HTMLElement,
  groupId: string,
  testid: string,
) {
  const all = panel.querySelectorAll(`[data-testid="${testid}"]`);
  expect(all, `exactly one ${testid} in the panel`).toHaveLength(1);
  const group = panel.querySelector(
    `[data-testid="settings-group-${groupId}"]`,
  );
  expect(group, `group ${groupId} renders`).not.toBeNull();
  expect(
    group!.contains(all[0]),
    `${testid} must render inside the ${groupId} group`,
  ).toBe(true);
}

describe("SettingsPanel — each body renders inside its own group", () => {
  it("claude-code: the permission-mode select and its profile note", async () => {
    const panel = await mountPanel();
    expectOnlyInGroup(panel, "claude-code", "settings-permission-mode");
    // F-b (operator ruling 2026-09-23): without this note the app-global control reads as
    // broken for a workspace on another profile.
    expectOnlyInGroup(
      panel,
      "claude-code",
      "settings-permission-mode-profile-note",
    );
  });

  it("workflow-features: the gate checkbox and the substrate block", async () => {
    const panel = await mountPanel();
    expectOnlyInGroup(panel, "workflow-features", "settings-workflow-features");
    expectOnlyInGroup(panel, "workflow-features", "substrate-info-installed");
    // `managed` provenance → the uninstall affordance, in the same slot.
    expectOnlyInGroup(panel, "workflow-features", "substrate-uninstall-button");
  });

  it("analytics: the time-tracking toggle, under the label the dashboard advertises", async () => {
    const panel = await mountPanel();
    expectOnlyInGroup(panel, "analytics", "settings-time-tracking");
    // The dashboard tells the user to turn on "Time tracking" in Settings
    // (settingsTimeTrackingCopyPromise.test.ts). That is only true if THIS checkbox carries
    // that label — not some other element of the same name.
    const label = panel
      .querySelector('[data-testid="settings-time-tracking"]')!
      .closest("label");
    expect(label?.textContent).toBe("Time tracking");
  });

  it("updates: the notification toggle and the manual check", async () => {
    const panel = await mountPanel();
    expectOnlyInGroup(panel, "updates", "settings-update-notifications");
    expectOnlyInGroup(panel, "updates", "settings-check-updates");
  });

  it("hotkeys: every hotkey row, and none elsewhere", async () => {
    const panel = await mountPanel();
    const rows = panel.querySelectorAll('[data-testid^="hotkey-row-"]');
    const group = panel.querySelector(
      '[data-testid="settings-group-hotkeys"]',
    )!;
    expect(rows.length).toBeGreaterThan(0);
    expect([...rows].every((r) => group.contains(r))).toBe(true);
  });

  it("hotkeys: the list follows the panel's LIVE gate control (gate ON shows the gated chords)", async () => {
    // The panel passes its own gate control's value down (HotkeySettings.tsx header). With the
    // gate flipped ON by the broadcast, the rows must be exactly `visibleChords(true)` — the
    // ids, not a count, and distinct from the gate-OFF set so the check discriminates.
    const panel = await mountPanel();
    const ids = [...panel.querySelectorAll('[data-testid^="hotkey-row-"]')].map(
      (r) => r.getAttribute("data-testid")!.replace("hotkey-row-", ""),
    );
    const on = visibleChords(true).map((c) => c.id);
    const off = visibleChords(false).map((c) => c.id);
    expect(on).not.toEqual(off);
    expect(ids).toEqual(on);
  });
});

describe("SettingsPanel — each moved control still writes its OWN setting", () => {
  // The bodies moved into their own modules, each with its own `useSettingControl`. A body
  // wired to the wrong spec would still render in the right group, so the placement tests
  // above cannot see it; this drives each control with a real change on the mounted panel
  // and asserts the write it sends, by value.
  async function writesAfter(fire: (panel: HTMLElement) => void) {
    const panel = await mountPanel();
    const before = calls.length;
    await act(async () => {
      fire(panel);
      await new Promise((r) => setTimeout(r, 10));
    });
    return calls
      .slice(before)
      .filter((c) => c.cmd.includes("_set_"))
      .map((c) => ({ cmd: c.cmd, args: c.args }));
  }

  it("Time tracking → time_set_tracking_enabled { enabled: true }", async () => {
    const writes = await writesAfter((p) =>
      p
        .querySelector<HTMLInputElement>(
          '[data-testid="settings-time-tracking"]',
        )!
        .click(),
    );
    expect(writes).toEqual([
      { cmd: "time_set_tracking_enabled", args: { enabled: true } },
    ]);
  });

  it("Update notifications → updater_set_notifications_enabled { enabled: false }", async () => {
    const writes = await writesAfter((p) =>
      p
        .querySelector<HTMLInputElement>(
          '[data-testid="settings-update-notifications"]',
        )!
        .click(),
    );
    expect(writes).toEqual([
      { cmd: "updater_set_notifications_enabled", args: { enabled: false } },
    ]);
  });

  it("Permission mode → cc_set_permission_mode { mode }", async () => {
    const writes = await writesAfter((p) => {
      const select = p.querySelector<HTMLSelectElement>(
        '[data-testid="settings-permission-mode"]',
      )!;
      select.value = "acceptEdits";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(writes).toEqual([
      { cmd: "cc_set_permission_mode", args: { mode: "acceptEdits" } },
    ]);
  });
});
