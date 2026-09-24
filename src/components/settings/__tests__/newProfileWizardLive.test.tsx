// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { NewProfileWizard } from "../NewProfileWizard";
import type { Profile } from "../../../state/profiles";

// F-b Phase 5 — the New-profile wizard on a LIVE mount: the real component, real input events,
// IPC answered by `mockIPC`. Asserts the WIRING by value — which command is sent with which
// spec — and the one-Esc-one-layer property against an App-style document capture listener.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const calls: { cmd: string; args: Record<string, unknown> }[] = [];
let dirStatus = "absent";
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let closed = 0;
const created: Profile[] = [];

const DEFAULTS = {
  config_root: "/u/.config",
  permission_mode: "acceptEdits",
  cleanup_period_days: 99999,
  theme: "dark",
  status_line: { type: "command", command: "npx -y ccstatusline@latest" },
  themes: ["auto", "dark", "light"],
};

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

async function mount() {
  calls.length = 0;
  created.length = 0;
  closed = 0;
  mockWindows("main");
  mockIPC(
    (cmd, args) => {
      const a = (args ?? {}) as Record<string, unknown>;
      calls.push({ cmd, args: a });
      if (cmd === "profile_wizard_defaults") return DEFAULTS;
      if (cmd === "profile_dir_status") return dirStatus;
      if (cmd === "profile_create") {
        const spec = a.spec as { name: string; config_dir: string };
        return {
          name: spec.name,
          config_dir: spec.config_dir,
          provenance: "created",
        };
      }
      if (cmd === "profile_adopt")
        return {
          name: a.name,
          config_dir: a.configDir,
          provenance: "adopted",
        };
      return null;
    },
    { shouldMockEvents: true },
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <NewProfileWizard
        listedNames={["neo"]}
        onClose={() => closed++}
        onCreated={(p) => created.push(p)}
      />,
    ),
  );
  await settle();
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  dirStatus = "absent";
  clearMocks();
});

const q = <T extends Element = HTMLElement>(id: string) =>
  document.body.querySelector<T>(`[data-testid="${id}"]`);

async function setValue(id: string, value: string) {
  const el = q<HTMLInputElement | HTMLSelectElement>(id);
  if (!el) throw new Error(`no ${id}`);
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}

async function click(id: string) {
  const el = q(id);
  if (!el) throw new Error(`no ${id}`);
  await act(async () => el.click());
  await settle();
}

const stepText = () => q("profile-wizard-step")?.textContent ?? "";

describe("NewProfileWizard — live", () => {
  it("walks every step in order and creates with the exact spec (defaults kept)", async () => {
    await mount();
    // Portalled into <body>, not inside the host.
    expect(host?.querySelector('[data-testid="profile-wizard"]')).toBeNull();
    expect(q("profile-wizard")).not.toBeNull();

    const seen: string[] = [stepText()];
    await setValue("profile-wizard-name", "work");
    await click("profile-wizard-next");
    seen.push(stepText());
    // The dir is pre-filled from the name, per the boilerplate convention.
    expect(q<HTMLInputElement>("profile-wizard-dir")?.value).toBe(
      "/u/.config/claude-work",
    );
    await click("profile-wizard-next");
    seen.push(stepText());
    // The permission step always renders, with the default pre-selected.
    expect(q<HTMLSelectElement>("profile-wizard-permission")?.value).toBe(
      "acceptEdits",
    );
    await click("profile-wizard-next");
    seen.push(stepText());
    expect(q<HTMLInputElement>("profile-wizard-retention")?.value).toBe(
      "99999",
    );
    await click("profile-wizard-next");
    seen.push(stepText());
    await click("profile-wizard-next");
    seen.push(stepText());
    expect(q<HTMLSelectElement>("profile-wizard-theme")?.value).toBe("dark");
    // The status-line step shows the copied command text.
    expect(q("profile-wizard-status-line-text")?.textContent).toBe(
      "npx -y ccstatusline@latest",
    );
    expect(q<HTMLInputElement>("profile-wizard-status-line")?.checked).toBe(
      true,
    );
    await click("profile-wizard-next");
    seen.push(stepText());
    expect(q<HTMLInputElement>("profile-wizard-mouse")?.checked).toBe(false);
    expect(q<HTMLInputElement>("profile-wizard-copy-on-select")?.checked).toBe(
      false,
    );
    await click("profile-wizard-next");
    seen.push(stepText());

    expect(seen).toEqual([
      "1/8 · Name",
      "2/8 · Config directory",
      "3/8 · Permission mode",
      "4/8 · Log retention",
      "5/8 · Default model",
      "6/8 · Theme and status line",
      "7/8 · Mouse and selection",
      "8/8 · Confirm",
    ]);
    expect(calls.filter((c) => c.cmd === "profile_create")).toEqual([]);

    await click("profile-wizard-next");
    expect(calls.filter((c) => c.cmd === "profile_create")).toEqual([
      {
        cmd: "profile_create",
        args: {
          spec: {
            name: "work",
            config_dir: "/u/.config/claude-work",
            permission_mode: "acceptEdits",
            cleanup_period_days: 99999,
            model: null,
            theme: "dark",
            copy_status_line: true,
            mouse_tracking: false,
            copy_on_select: false,
          },
        },
      },
    ]);
    expect(created).toEqual([
      {
        name: "work",
        config_dir: "/u/.config/claude-work",
        provenance: "created",
      },
    ]);
  });

  it("carries the operator's changes into the spec", async () => {
    await mount();
    await setValue("profile-wizard-name", "work");
    await click("profile-wizard-next");
    await click("profile-wizard-next");
    await setValue("profile-wizard-permission", "plan");
    await click("profile-wizard-next");
    await click("profile-wizard-next");
    await setValue("profile-wizard-model", "opus");
    await click("profile-wizard-next");
    await setValue("profile-wizard-theme", "light");
    await click("profile-wizard-status-line");
    await click("profile-wizard-next");
    await click("profile-wizard-mouse");
    await click("profile-wizard-next");
    await click("profile-wizard-next");
    const spec = calls.find((c) => c.cmd === "profile_create")?.args.spec;
    expect(spec).toMatchObject({
      permission_mode: "plan",
      model: "opus",
      theme: "light",
      copy_status_line: false,
      mouse_tracking: true,
      copy_on_select: false,
    });
  });

  it("a name colliding with a listed profile is rejected at the name step (D.19)", async () => {
    await mount();
    await setValue("profile-wizard-name", "neo");
    await click("profile-wizard-next");
    expect(stepText()).toBe("1/8 · Name");
    expect(q("profile-wizard-error")?.textContent).toContain("already exists");
  });

  it("a non-empty dir is refused with 'add it instead', which ADOPTS and never creates (D.19)", async () => {
    await mount();
    dirStatus = "nonEmpty";
    await setValue("profile-wizard-name", "work");
    await click("profile-wizard-next");
    await click("profile-wizard-next");
    expect(stepText()).toBe("2/8 · Config directory");
    expect(q("profile-wizard-error")?.textContent).toContain(
      "already has files",
    );
    await click("profile-wizard-adopt-instead");
    expect(calls.filter((c) => c.cmd === "profile_adopt")).toEqual([
      {
        cmd: "profile_adopt",
        args: { configDir: "/u/.config/claude-work", name: "work" },
      },
    ]);
    expect(calls.some((c) => c.cmd === "profile_create")).toBe(false);
    expect(created.map((p) => p.provenance)).toEqual(["adopted"]);
  });

  it("one Esc closes the wizard and never reaches App's document capture listener", async () => {
    // App.tsx closes Settings from a DOCUMENT capture listener; the wizard must win the race.
    let appSaw = 0;
    const app = (e: KeyboardEvent) => {
      if (e.key === "Escape") appSaw++;
    };
    document.addEventListener("keydown", app, true);
    try {
      await mount();
      await act(async () => {
        q("profile-wizard-name")?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      });
      expect(closed).toBe(1);
      expect(appSaw).toBe(0);
    } finally {
      document.removeEventListener("keydown", app, true);
    }
  });
});
