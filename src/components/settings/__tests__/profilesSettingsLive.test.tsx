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
let listed = [
  { name: "neo", config_dir: "/u/.config/claude-neo", provenance: "adopted" },
];
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
  listed = [
    { name: "neo", config_dir: "/u/.config/claude-neo", provenance: "adopted" },
  ];
});

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
});
