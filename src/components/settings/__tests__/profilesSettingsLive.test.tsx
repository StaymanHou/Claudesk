// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { ProfilesSettings } from "../ProfilesSettings";

// F-b P4.3 — the Settings "Profiles" group on a LIVE mount: the real component, real clicks,
// IPC answered by `mockIPC` (the `liveWorkspace.tsx` approach). Asserts the WIRING — which
// command each control sends, with which argument — by value.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const calls: { cmd: string; args: Record<string, unknown> }[] = [];
const INITIAL = [
  { name: "neo", config_dir: "/u/.config/claude-neo", provenance: "adopted" },
  { name: "work", config_dir: "/u/.config/claude-work", provenance: "created" },
];
let listed = [...INITIAL];
let root: Root | null = null;
let host: HTMLDivElement | null = null;
const errors: string[] = [];

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

async function mount() {
  calls.length = 0;
  errors.length = 0;
  mockWindows("main");
  mockIPC(
    (cmd, args) => {
      calls.push({ cmd, args: (args ?? {}) as Record<string, unknown> });
      if (cmd === "profiles_list") return listed;
      if (cmd === "profile_adoption_suggestions")
        return ["/u/.config/claude-eos"];
      if (cmd === "profile_remove") {
        listed = listed.filter(
          (p) => p.name !== (args as { name: string }).name,
        );
        return null;
      }
      if (cmd === "profile_adopt") return null;
      if (cmd === "profile_delete") {
        listed = listed.filter(
          (p) => p.name !== (args as { name: string }).name,
        );
        return null;
      }
      if (cmd === "profile_wizard_defaults")
        return {
          config_root: "/u/.config",
          permission_mode: "default",
          cleanup_period_days: 99999,
          theme: "dark",
          status_line: null,
          themes: ["dark"],
        };
      return null;
    },
    { shouldMockEvents: true },
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(<ProfilesSettings onError={(m) => errors.push(m)} />),
  );
  await settle();
  return host;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  clearMocks();
  listed = [...INITIAL];
  // Portalled dialogs live in <body>, outside the host.
  document.body
    .querySelectorAll('[data-testid="profile-wizard"], .profile-dialog-layer')
    .forEach((n) => n.remove());
});

const inBody = (id: string) =>
  document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function click(el: Element | null) {
  if (!el) throw new Error("click target not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

describe("ProfilesSettings — live", () => {
  it("lists the built-in default and each listed profile with its dir", async () => {
    const el = await mount();
    expect(
      el.querySelector('[data-testid="profiles-item-default"]'),
    ).not.toBeNull();
    const neo = el.querySelector('[data-testid="profiles-item-neo"]');
    expect(neo?.textContent).toContain("/u/.config/claude-neo");
    // The built-in profile has NO remove control (spec A.1: it cannot be removed).
    expect(
      el.querySelector('[data-testid="profiles-item-default"] button'),
    ).toBeNull();
  });

  it("Remove sends profile_remove for THAT profile, and the row goes away", async () => {
    const el = await mount();
    await click(el.querySelector('[data-testid="profiles-remove-neo"]'));
    expect(calls.filter((c) => c.cmd === "profile_remove")).toEqual([
      { cmd: "profile_remove", args: { name: "neo" } },
    ]);
    expect(el.querySelector('[data-testid="profiles-item-neo"]')).toBeNull();
    expect(errors).toEqual([]);
  });

  it("a suggestion adopts THAT directory", async () => {
    const el = await mount();
    const s = el.querySelector('[data-testid="profiles-suggestion"]');
    expect(s?.textContent).toBe("/u/.config/claude-eos");
    await click(s);
    expect(calls.filter((c) => c.cmd === "profile_adopt")).toEqual([
      {
        cmd: "profile_adopt",
        args: { configDir: "/u/.config/claude-eos", name: null },
      },
    ]);
  });

  it("Delete is offered ONLY for a created profile — an adopted one has none in the DOM (D.24)", async () => {
    const el = await mount();
    expect(
      el.querySelector('[data-testid="profiles-delete-work"]'),
    ).not.toBeNull();
    expect(el.querySelector('[data-testid="profiles-delete-neo"]')).toBeNull();
    // Remove stays available for both.
    expect(
      el.querySelector('[data-testid="profiles-remove-work"]'),
    ).not.toBeNull();
  });

  it("Delete opens a confirm naming the dir; Cancel sends nothing", async () => {
    const el = await mount();
    await click(el.querySelector('[data-testid="profiles-delete-work"]'));
    const dialog = inBody("confirm-dialog");
    expect(dialog?.textContent).toContain("/u/.config/claude-work");
    expect(dialog?.textContent).toContain("history");
    await click(inBody("confirm-cancel"));
    expect(calls.some((c) => c.cmd === "profile_delete")).toBe(false);
    expect(inBody("confirm-dialog")).toBeNull();
  });

  it("confirming sends profile_delete for THAT profile, and the row goes away", async () => {
    const el = await mount();
    await click(el.querySelector('[data-testid="profiles-delete-work"]'));
    await click(inBody("confirm-delete"));
    expect(calls.filter((c) => c.cmd === "profile_delete")).toEqual([
      { cmd: "profile_delete", args: { name: "work" } },
    ]);
    expect(el.querySelector('[data-testid="profiles-item-work"]')).toBeNull();
    expect(errors).toEqual([]);
  });

  it("New profile… opens the wizard", async () => {
    const el = await mount();
    expect(inBody("profile-wizard")).toBeNull();
    await click(el.querySelector('[data-testid="profiles-new"]'));
    expect(inBody("profile-wizard")).not.toBeNull();
  });

  it("one Esc cancels the Delete confirm, sends nothing, and never reaches App's document capture listener", async () => {
    // App.tsx closes Settings from a DOCUMENT capture listener; the confirm must win the race.
    let appSaw = 0;
    const app = (e: KeyboardEvent) => {
      if (e.key === "Escape") appSaw++;
    };
    document.addEventListener("keydown", app, true);
    try {
      const el = await mount();
      await click(el.querySelector('[data-testid="profiles-delete-work"]'));
      await act(async () => {
        inBody("confirm-cancel")?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      });
      await settle();
      expect(inBody("confirm-dialog")).toBeNull();
      expect(appSaw).toBe(0);
      expect(calls.some((c) => c.cmd === "profile_delete")).toBe(false);
    } finally {
      document.removeEventListener("keydown", app, true);
    }
  });
});
