// A LIVE mount of picker components under jsdom: the real component, real clicks, and real
// (mocked) Tauri events. The picker's counterpart of `workspace/__tests__/liveWorkspace.tsx`.
//
// The IPC lifecycle lives here ONCE: `mountLive` boots `mockWindows` + `mockIPC` (with events)
// and renders; `teardownLive` unmounts, settles, removes the host and clears the mocks, in that
// order. Every IPC call is recorded in `calls`, which is reset on each mount.
//
// `mountPicker` answers the four commands every `ProjectPicker` mount makes (prune, list,
// announce, profiles) from a fixture and hands any other command to the test's own `ipc`.
//
// ⚠️ The gate moves through the seam's BROADCAST (`setGate`), never by answering its seed command
// by name: the OFF-invariant guard allows exactly one door to the gate setting.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { vi } from "vitest";
import { WORKFLOW_FEATURES_ENABLED_EVENT } from "../../../state/workflowGate";
import { ProjectPicker } from "../ProjectPicker";

export { setNativeValue } from "../../../test-support/setNativeValue";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

export interface IpcCall {
  cmd: string;
  args: Record<string, unknown>;
}

/** Answers one IPC command; `undefined` means "not mine" where a harness default exists. */
export type IpcHandler = (
  cmd: string,
  args: Record<string, unknown>,
) => unknown;

/** Every IPC call since the last mount, in order. */
export const calls: IpcCall[] = [];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

/** Let effects, IPC promises and timers run. */
export async function settle(ms = 20): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/** Boot the IPC mocks, render `node` into a fresh host, and let the first effects run. */
export async function mountLive(
  node: ReactNode,
  ipc: IpcHandler,
  settleMs = 25,
): Promise<HTMLDivElement> {
  calls.length = 0;
  mockWindows("main");
  mockIPC(
    (cmd, args) => {
      const a = (args ?? {}) as Record<string, unknown>;
      calls.push({ cmd, args: a });
      return ipc(cmd, a) ?? null;
    },
    { shouldMockEvents: true },
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  await settle(settleMs);
  return host;
}

/** Register in `afterEach`. Unmount → settle → remove → clearMocks. */
export async function teardownLive(): Promise<void> {
  await act(async () => root?.unmount());
  await settle(0);
  host?.remove();
  root = null;
  host = null;
  clearMocks();
}

/** Move the workflow gate the way the app does: through its broadcast. */
export async function setGate(on: boolean): Promise<void> {
  await act(async () => {
    await emit(WORKFLOW_FEATURES_ENABLED_EVENT, on);
  });
  await settle(15);
}

export interface PickerFixture {
  /** What `list_projects` returns (backend order). */
  projects: unknown[];
  /** What `picker_announce_actions` returns. */
  announce?: Record<string, string>;
  /** What `profiles_list` returns; a function is re-read on every call. */
  profiles?: unknown[] | (() => unknown[]);
  /** Any other command. */
  ipc?: IpcHandler;
  openProjectPaths?: string[];
  onOpen?: (...args: unknown[]) => void;
  /** Broadcast the gate ON after the first render. */
  gateOn?: boolean;
}

/** Mount the real `ProjectPicker` against a fixture. */
export async function mountPicker(f: PickerFixture) {
  const onOpen = f.onOpen ?? vi.fn();
  const el = await mountLive(
    <ProjectPicker onOpen={onOpen} openProjectPaths={f.openProjectPaths} />,
    (cmd, args) => {
      switch (cmd) {
        case "prune_missing_projects":
          return [];
        case "list_projects":
          return f.projects;
        case "picker_announce_actions":
          return f.announce ?? {};
        case "profiles_list":
          return typeof f.profiles === "function"
            ? f.profiles()
            : (f.profiles ?? []);
        default:
          return f.ipc?.(cmd, args);
      }
    },
  );
  if (f.gateOn) await setGate(true);
  return { el, onOpen };
}

/** The picker row whose name is `name`. Throws when absent, so a typo cannot pass silently. */
export function pickerRow(el: ParentNode, name: string): HTMLElement {
  const li = [...el.querySelectorAll<HTMLElement>("li.picker-recent-row")].find(
    (l) => l.querySelector(".picker-recent-name")?.textContent === name,
  );
  if (!li) throw new Error(`no picker row named ${name}`);
  return li;
}
