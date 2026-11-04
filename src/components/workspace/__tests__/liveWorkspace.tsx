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
// The IPC lifecycle lives here ONCE (`bootIpc` / `teardownIpc`), including the teardown order
// (unmount → settle → clearMocks) that an App-level test would otherwise copy and let drift.
// The pane stub records per WORKSPACE (`paneFor(id)`), so a tree with several workspaces never
// reads whichever pane rendered last.
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
import type { TurnNavView } from "../XtermPane";
import type { SupervisorOrigin } from "../../../state/supervisor/turnOrigin";
import type { Workspace as WorkspaceModel } from "../../../state/workspace";
import { RESPAWN_INTENT_HOLD_MS } from "../applyDriveMode";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

export const AT_REST: TurnNavView = {
  canPrev: false,
  canNext: false,
  ordinal: 0,
  total: 0,
  origin: null,
};

/** The props the stub pane records: the callbacks `Workspace` hands the real pane. */
interface StubPaneProps {
  workspaceId?: string;
  onTurnStartRecorded?: (nav: TurnNavView) => void;
  onInputForwarded?: (chunk: string) => void;
  claimTurnOrigin?: () => SupervisorOrigin | null;
}

/** What one workspace's stub pane saw and what it will answer. */
export interface PaneRecord {
  steps: ("prev" | "next")[];
  /** Returned by `turnNavState()`, i.e. what the pane reports after a step. */
  navAfterStep: TurnNavView;
  props: null | StubPaneProps;
  /** How many times `Workspace` called `relaunch()` (a drive-mode apply's respawn). */
  relaunches: number;
}

/** The workspace id `mountWorkspace` mounts. */
export const MOUNTED_ID = "ws-1";

/** Every stub pane's record, keyed by the `workspaceId` prop `Workspace` passes it. */
const panes = new Map<string, PaneRecord>();

function recordFor(workspaceId: string): PaneRecord {
  let rec = panes.get(workspaceId);
  if (!rec) {
    rec = { steps: [], navAfterStep: AT_REST, props: null, relaunches: 0 };
    panes.set(workspaceId, rec);
  }
  return rec;
}

/** The record of the pane `Workspace` rendered for `workspaceId`. Throws if none rendered. */
export function paneFor(workspaceId: string): PaneRecord {
  const rec = panes.get(workspaceId);
  if (!rec)
    throw new Error(`no stub pane rendered for workspace ${workspaceId}`);
  return rec;
}

/**
 * The single mounted workspace's pane (`MOUNTED_ID`), for `mountWorkspace` tests. It is the same
 * object `paneFor(MOUNTED_ID)` returns: `mountWorkspace` resets it and registers it before render.
 */
export const pane: PaneRecord = {
  steps: [],
  navAfterStep: AT_REST,
  props: null,
  relaunches: 0,
};

function XtermPaneStub(props: StubPaneProps, ref: Ref<unknown>) {
  const id = props.workspaceId ?? "(no workspaceId prop)";
  // In an effect, not during render: react-hooks rejects a render-time write to shared state.
  // The record is looked up by id at each use rather than held in a local, which the
  // react-hooks immutability rule would reject as a post-render mutation.
  useEffect(() => {
    recordFor(id).props = props;
  });
  useImperativeHandle(ref, () => ({
    focus() {},
    refit() {},
    setFontSize() {},
    relaunch() {
      recordFor(id).relaunches += 1;
    },
    stepTurn(dir: "prev" | "next") {
      recordFor(id).steps.push(dir);
    },
    turnNavState: () => recordFor(id).navAfterStep,
  }));
  return <div data-testid="xterm-stub" />;
}

export const xtermPaneModule = { XtermPane: forwardRef(XtermPaneStub) };
const gate = { enabled: false };
export const gateModule = { useWorkflowFeaturesEnabled: () => gate.enabled };

/** What the stubbed `RightPanelHost` was last rendered with (F-b: the profile it received). */
export const rightPanel = {
  props: null as null | { workspaceProfile?: string | null },
};

function RightPanelHostStub(props: { workspaceProfile?: string | null }) {
  useEffect(() => {
    rightPanel.props = props;
  });
  return <div data-testid="right-panel-stub" />;
}

export const rightPanelModule = { RightPanelHost: RightPanelHostStub };

/** Every IPC call the mounted tree made, in order. */
export const ipcCalls: { cmd: string; args: Record<string, unknown> }[] = [];

/** A throw inside a DOM listener is swallowed under Vitest jsdom unless this is tapped. */
export const uncaught: unknown[] = [];
const onError = (e: ErrorEvent) => uncaught.push(e.error ?? e.message);

/**
 * Install the IPC mocks for one test: the call log, the listener-throw tap, the window and
 * `mockIPC` with events. `handler` answers each command; `null` for anything it does not know.
 * Pair every call with `teardownIpc`.
 */
export function bootIpc(
  handler: (cmd: string, args: Record<string, unknown>) => unknown,
) {
  panes.clear();
  ipcCalls.length = 0;
  uncaught.length = 0;
  window.addEventListener("error", onError);
  mockWindows("main");
  mockIPC(
    (cmd, args) => {
      const a = (args ?? {}) as Record<string, unknown>;
      ipcCalls.push({ cmd, args: a });
      return handler(cmd, a);
    },
    { shouldMockEvents: true },
  );
}

/**
 * Unmount `root`, then drop the mocks, in the ONE order that works: the listeners' unlisten runs
 * on a resolved promise, so it must land (the settle) before `clearMocks` removes the event
 * plumbing it calls into.
 */
export async function teardownIpc(r: Root | null, h: HTMLElement | null) {
  // ⚠️ A drive-mode apply's respawn ends in a fire-and-forget `RESPAWN_INTENT_HOLD_MS` sleep
  // that then sets state. Unmounting before it fires leaks the timer past the test, and under a
  // loaded full-suite run it fired after the file's jsdom was gone ("window is not defined",
  // an unhandled rejection; paydown 2026-11-04 WP3). Wait it out while still mounted. The
  // production fix (a ref instead of the sleep) is sweep WP12.
  if ([...panes.values()].some((p) => p.relaunches > 0))
    await act(async () => {
      await new Promise((res) => setTimeout(res, RESPAWN_INTENT_HOLD_MS + 50));
    });
  await act(async () => r?.unmount());
  await settle();
  h?.remove();
  window.removeEventListener("error", onError);
  clearMocks();
}

export interface MountOptions {
  gate: boolean;
  storedDriveMode?: string | null;
  statusState?: "idle" | "running" | "unknown";
  /** M16.5 WP4 — the header dot's display state (the verify-human overlay), if any. */
  statusDisplayState?: "awaiting_input";
  /** F-b — the profile both `project_get_profile` and `cc_session_profile` answer with. */
  profile?: string | null;
  /** Extra IPC answers by command name, for commands the harness does not otherwise stub. */
  ipcAnswers?: Record<string, unknown>;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export async function mountWorkspace(opts: MountOptions) {
  if (root)
    throw new Error(
      "mountWorkspace: a previous mount is still live (missing unmountWorkspace?)",
    );
  const { Workspace } = await import("../Workspace");
  rightPanel.props = null;
  gate.enabled = opts.gate;
  bootIpc((cmd) => {
    if (cmd === "project_get_default_drive_mode")
      return opts.storedDriveMode ?? null;
    if (cmd === "picker_announce_actions") return {};
    if (cmd === "project_get_profile" || cmd === "cc_session_profile")
      return opts.profile ?? null;
    if (opts.ipcAnswers && cmd in opts.ipcAnswers) return opts.ipcAnswers[cmd];
    return null;
  });
  pane.steps = [];
  pane.navAfterStep = AT_REST;
  pane.props = null;
  pane.relaunches = 0;
  panes.set(MOUNTED_ID, pane);
  const model = {
    id: MOUNTED_ID,
    project_path: "/tmp/scratch/scratch-a",
    cc_session_id: "cc-1",
    display_name: "scratch-a",
    pending_action: null,
    open_intent: "fire",
  } as WorkspaceModel;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <Workspace
        workspace={model}
        visible
        statusState={opts.statusState ?? "idle"}
        statusDisplayState={opts.statusDisplayState}
      />,
    ),
  );
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
  await teardownIpc(root, host);
  root = null;
  host = null;
}

export async function click(el: Element | null | undefined) {
  if (!el) throw new Error("click target not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

/** Push a turn-start from the pane, the way the real `XtermPane` does on every recorded turn. */
export async function pushTurnStart(
  nav: TurnNavState,
  workspaceId: string = MOUNTED_ID,
) {
  const cb = paneFor(workspaceId).props?.onTurnStartRecorded;
  if (!cb)
    throw new Error("Workspace passed no onTurnStartRecorded to the pane");
  await act(async () => cb({ origin: null, ...nav }));
}

/**
 * Turn attribution — push a turn start the way the real pane records one: it asks `Workspace`'s
 * `claimTurnOrigin` whether the supervisor started this turn, then reports the nav state with
 * whatever came back. ⚠️ The pane side of this contract (claim at the marker, one builder for push
 * and pull) is pinned structurally in `turnNavWiring.test.ts`; this helper drives the PARENT side.
 */
export async function pushClaimedTurnStart(
  nav: TurnNavState,
  workspaceId: string = MOUNTED_ID,
) {
  const p = paneFor(workspaceId);
  const claim = p.props?.claimTurnOrigin;
  if (!claim)
    throw new Error("Workspace passed no claimTurnOrigin to the pane");
  const cb = p.props?.onTurnStartRecorded;
  if (!cb)
    throw new Error("Workspace passed no onTurnStartRecorded to the pane");
  await act(async () => cb({ ...nav, origin: claim() }));
}

/** Forward a chunk from the pane, as the real pane does for every `onData`. */
export async function forwardInput(
  chunk: string,
  workspaceId: string = MOUNTED_ID,
) {
  const cb = paneFor(workspaceId).props?.onInputForwarded;
  if (!cb) throw new Error("Workspace passed no onInputForwarded to the pane");
  await act(async () => cb(chunk));
}
