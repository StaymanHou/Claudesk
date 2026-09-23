// A LIVE mount of the real `Workspace` under jsdom, for tests that need effects, events and
// clicks rather than the resting DOM (paydown 2026-09-23 WP7, I1 + H4). The resting-DOM
// questions stay with `renderToStaticMarkup` (`workspaceDriveModeRender.test.tsx`).
//
// ⚠️ Two children and one hook are replaced, and nothing else:
//   - `XtermPane`, because the terminal's own behaviour is not under test and xterm.js cannot
//     measure cells in jsdom. The stub exposes the handle `Workspace` calls and captures the props
//     `Workspace` passes, so a test can push a turn-start exactly as the real pane does.
//   - `RightPanelHost`, which is a separate surface with its own IPC.
//   - `useWorkflowFeaturesEnabled`, the gate SEAM. The OFF-invariant guard allows exactly one door to
//     the gate setting, so the harness sets the gate through the seam rather than answering the raw
//     command (the seam's own seeding is covered by its own tests).
// `Workspace` itself, its other hooks, and every other IPC call run for real against `mockIPC`.
//
// Each test file must register the three mocks itself (`vi.mock` is hoisted per file):
//   vi.mock("../XtermPane", async () => (await import("./liveWorkspace")).xtermPaneModule);
//   vi.mock("../RightPanelHost", async () => (await import("./liveWorkspace")).rightPanelModule);
//   vi.mock("../../../state/useWorkflowFeaturesEnabled", async () =>
//     (await import("./liveWorkspace")).gateModule);
import {
  act,
  forwardRef,
  useEffect,
  useImperativeHandle,
  type Ref,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { TurnNavState } from "../turnMarkers";
import type { Workspace as WorkspaceModel } from "../../../state/workspace";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

export const AT_REST: TurnNavState = {
  canPrev: false,
  canNext: false,
  ordinal: 0,
  total: 0,
};

/** What the stub pane saw and what it will answer. Reset by `mountWorkspace`. */
export const pane = {
  steps: [] as ("prev" | "next")[],
  /** Returned by `turnNavState()`, i.e. what the pane reports after a step. */
  navAfterStep: AT_REST as TurnNavState,
  props: null as null | {
    onTurnStartRecorded?: (nav: TurnNavState) => void;
  },
};

function XtermPaneStub(
  props: { onTurnStartRecorded?: (nav: TurnNavState) => void },
  ref: Ref<unknown>,
) {
  // In an effect, not during render: react-hooks rejects a render-time write to shared state.
  useEffect(() => {
    pane.props = props;
  });
  useImperativeHandle(ref, () => ({
    focus() {},
    refit() {},
    setFontSize() {},
    relaunch() {},
    stepTurn(dir: "prev" | "next") {
      pane.steps.push(dir);
    },
    turnNavState: () => pane.navAfterStep,
  }));
  return <div data-testid="xterm-stub" />;
}

export const xtermPaneModule = { XtermPane: forwardRef(XtermPaneStub) };
const gate = { enabled: false };
export const gateModule = { useWorkflowFeaturesEnabled: () => gate.enabled };

export const rightPanelModule = {
  RightPanelHost: () => <div data-testid="right-panel-stub" />,
};

/** Every IPC call the mounted tree made, in order. */
export const ipcCalls: { cmd: string; args: Record<string, unknown> }[] = [];

/** A throw inside a DOM listener is swallowed under Vitest jsdom unless this is tapped. */
export const uncaught: unknown[] = [];
const onError = (e: ErrorEvent) => uncaught.push(e.error ?? e.message);

export interface MountOptions {
  gate: boolean;
  storedDriveMode?: string | null;
  projectPath?: string;
  statusState?: "idle" | "running" | "unknown";
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let rerender: ((opts: MountOptions) => void) | null = null;

export async function mountWorkspace(opts: MountOptions) {
  const { Workspace } = await import("../Workspace");
  pane.steps = [];
  pane.navAfterStep = AT_REST;
  pane.props = null;
  ipcCalls.length = 0;
  uncaught.length = 0;
  gate.enabled = opts.gate;
  window.addEventListener("error", onError);
  mockWindows("main");
  mockIPC(
    (cmd, args) => {
      ipcCalls.push({ cmd, args: (args ?? {}) as Record<string, unknown> });
      if (cmd === "project_get_default_drive_mode")
        return opts.storedDriveMode ?? null;
      if (cmd === "picker_announce_actions") return {};
      return null;
    },
    { shouldMockEvents: true },
  );
  const projectPath = opts.projectPath ?? "/tmp/scratch/scratch-a";
  const model = {
    id: "ws-1",
    project_path: projectPath,
    cc_session_id: "cc-1",
    display_name: "scratch-a",
    pending_action: null,
    open_intent: "fire",
  } as WorkspaceModel;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  rerender = (o) =>
    root!.render(
      <Workspace
        workspace={model}
        visible
        statusState={o.statusState ?? "idle"}
      />,
    );
  await act(async () => rerender!(opts));
  await settle();
  return host;
}

/** Let effects, IPC promises and event deliveries land. */
export async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

export async function unmountWorkspace() {
  await act(async () => root?.unmount());
  // The listeners' unlisten runs on a resolved promise, so it must land before the mocks go.
  await settle();
  host?.remove();
  root = null;
  host = null;
  rerender = null;
  window.removeEventListener("error", onError);
  clearMocks();
}

export async function click(el: Element | null | undefined) {
  if (!el) throw new Error("click target not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

/** Push a turn-start from the pane, the way the real `XtermPane` does on every recorded turn. */
export async function pushTurnStart(nav: TurnNavState) {
  const cb = pane.props?.onTurnStartRecorded;
  if (!cb)
    throw new Error("Workspace passed no onTurnStartRecorded to the pane");
  await act(async () => cb(nav));
}
