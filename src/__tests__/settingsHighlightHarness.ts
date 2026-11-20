// M18 WP5 (D8) — shared harness for the two `settingsHighlight*.test.tsx` files.
//
// Each file boots the REAL app (`src/main.tsx`, jsdom + mocked Tauri IPC, the `appBoot.test.tsx`
// pattern) and drives the ONE routed open it can reach: the first-run invite's "Show me in
// Settings", which sets App's `settingsHighlight`. The invite is one-shot, so each close path gets
// its own file (its own module graph, its own boot).
//
// ⚠️ Why the REOPEN is the picker gear and not ⌘,: the ⌘, toggle clears the highlight itself, so a
// ⌘, reopen would pass with the close path's clear deleted. The gear (`setShowSettings(true)`)
// clears nothing; it shows whatever the close left behind.
import { act } from "react";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** Mock IPC so App shows the invite: one project, the invite unresolved, the gate OFF. */
export function mockForInvite(): void {
  mockWindows("main");
  mockIPC(
    (cmd) => {
      switch (cmd) {
        case "prune_missing_projects":
          return [];
        case "list_projects":
          return [{ display_name: "HighlightProject", project_path: "/hl/p" }];
        case "picker_announce_actions":
          return {};
        case "profiles_list":
        case "profile_adoption_suggestions":
        case "remote_hosts":
          return [];
        default:
          // The invite read, the gate seed and every write: `null`.
          return null;
      }
    },
    { shouldMockEvents: true },
  );
}

export async function waitFor<T>(
  probe: () => T | null,
  what: string,
): Promise<T> {
  const deadline = Date.now() + 3000;
  for (;;) {
    const v = probe();
    if (v !== null) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

export const q = (sel: string) => document.querySelector<HTMLElement>(sel);
export const panel = () => q('[data-testid="settings-panel"]');
export const highlighted = () =>
  [...document.querySelectorAll('[data-highlighted="true"]')].map((e) =>
    e.getAttribute("data-testid"),
  );

/** Boot the real app, then take the invite's routed open; asserts the highlight shows. */
export async function bootAndRoutedOpen(): Promise<(string | null)[]> {
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
  await act(async () => {
    await import("../main");
  });
  const primary = await waitFor(
    () => q('[data-testid="workflow-invite-primary"]'),
    "the first-run invite",
  );
  await act(async () => primary.click());
  await waitFor(panel, "the Settings panel (routed)");
  return highlighted();
}

export async function pressCmdComma(): Promise<void> {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: ",",
        code: "Comma",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

/** Reopen Settings from the picker's gear (which clears nothing itself). */
export async function reopenFromGear(): Promise<(string | null)[]> {
  const gear = await waitFor(
    () => q('[data-testid="picker-open-settings"]'),
    "the picker gear",
  );
  await act(async () => gear.click());
  await waitFor(panel, "the Settings panel (gear)");
  return highlighted();
}
