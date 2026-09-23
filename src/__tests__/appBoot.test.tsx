// @vitest-environment jsdom
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";

// Boot render smoke (paydown 2026-09-23 WP3): import each REAL webview entry
// (`src/main.tsx`, `src/pip/main.tsx`) into a jsdom page, with Tauri IPC mocked,
// and assert the surface it should mount actually appears.
//
// ⚠️ What this catches: a throw during module EVALUATION anywhere on an entry's
// static import graph, and a throw during the first MOUNT of the boot path.
// Both leave the root empty, which is what the webview shows as a blank window.
//
// ⚠️ What it does NOT catch: a deleted export. Under Vitest an import never fails
// because a consumer names a missing binding; the module runner reads it as
// `undefined` (docs/lessons/source-text-guards.md entry 19). That failure class
// is `pnpm check:link`'s job, and this test must not be cited for it.

const calls: string[] = [];
const uncaught: unknown[] = [];
const onError = (e: ErrorEvent) => uncaught.push(e.error ?? e.message);
window.addEventListener("error", onError);

mockWindows("main");
mockIPC(
  (cmd) => {
    calls.push(cmd);
    switch (cmd) {
      case "prune_missing_projects":
        return [];
      case "list_projects":
        return [
          { display_name: "BootSmokeProject", project_path: "/boot/smoke" },
        ];
      case "picker_announce_actions":
        return {};
      case "pip_get_layout":
        return "grid";
      default:
        return null;
    }
  },
  { shouldMockEvents: true },
);

afterAll(() => {
  window.removeEventListener("error", onError);
  clearMocks();
});

async function waitFor<T>(probe: () => T | null, what: string): Promise<T> {
  const deadline = Date.now() + 3000;
  for (;;) {
    const v = probe();
    if (v !== null) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("boot render smoke — each real webview entry mounts its surface", () => {
  // Each entry is judged on its OWN errors: a throw from one boot must not fail the other.
  beforeEach(() => {
    uncaught.length = 0;
  });

  it("src/main.tsx mounts the picker and renders a project from list_projects", async () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);

    await import("../main");

    // Identity, not length: this row exists only if the picker mounted AND its
    // boot effect's list_projects reply reached the DOM.
    const name = await waitFor(
      () => root.querySelector(".picker-recent-name"),
      "the seeded project row",
    );
    expect(name.textContent).toBe("BootSmokeProject");
    expect(root.querySelector('[data-testid="picker"]')).not.toBeNull();
    expect(calls).toContain("list_projects");
    expect(uncaught).toEqual([]);
  });

  it("src/pip/main.tsx mounts the PiP surface", async () => {
    const root = document.createElement("div");
    root.id = "pip-root";
    document.body.appendChild(root);

    await import("../pip/main");

    await waitFor(
      () => root.querySelector('[data-testid="pip-empty"]'),
      "the PiP empty state",
    );
    expect(root.querySelector('[data-testid="pip-root"]')).not.toBeNull();
    expect(calls).toContain("pip_get_layout");
    expect(uncaught).toEqual([]);
  });
});
