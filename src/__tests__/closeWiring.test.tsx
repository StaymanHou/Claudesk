// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { FILMSTRIP_COLLAPSED_KEY } from "../components/workspace/filmstripCollapse";
import { WORKSPACE_STATUS_EVENT } from "../state/workspaceStatus";

// The × / ⏸ close wiring, driven through the REAL `App` (paydown 2026-09-23 WP7, AA1).
//
// Until now only the pure layer was covered (the reducer, `dirtyDocCount`, `closeWorkspaceSpec`,
// `resolveCloseIntent`). The wiring between them had no test: `requestCloseWithIntent` reading the
// workspace list and the status map, `pendingClose` carrying the ⏸'s intent through the confirm,
// `resolveClose` clearing it, and the tile controls not leaking a click into the tile underneath.
// That is the part most likely to regress silently, because every piece it connects is green on
// its own.
//
// Workspaces open through App's DEV-only `window.__seedWorkspace` seam (the same `openWorkspace`
// reducer path the picker uses). "Busy" arrives the way it does in the app: a `workspace-status`
// event. A clean close is visible as the `session_state_mark_clean` IPC that `markSessionClean`
// issues. Its absence is what a ⏸ close must leave behind.
//
// Stubbed, and nothing else: `XtermPane` and `RightPanelHost` (see `liveWorkspace.tsx`), and the
// workflow gate seam (held OFF). The dirty-editor arm of the gate is not reachable here, because
// the editor panel is stubbed; `dirtyDocCount` and `closeWorkspaceSpec` cover it as pure functions.

vi.mock(
  "../components/workspace/XtermPane",
  async () =>
    (await import("../components/workspace/__tests__/liveWorkspace"))
      .xtermPaneModule,
);
vi.mock(
  "../components/workspace/RightPanelHost",
  async () =>
    (await import("../components/workspace/__tests__/liveWorkspace"))
      .rightPanelModule,
);
vi.mock(
  "../state/useWorkflowFeaturesEnabled",
  async () =>
    (await import("../components/workspace/__tests__/liveWorkspace"))
      .gateModule,
);

const A = "/tmp/scratch/scratch-a";
const B = "/tmp/scratch/scratch-b"; // opened second, so it is focused

// Workspace ids come from a module-level counter, so they differ per test. Tests address a
// workspace by its display name (the path basename) and resolve the id from the close control's
// label.
let ids: Record<"a" | "b", string> = { a: "", b: "" };

const calls: { cmd: string; args: Record<string, unknown> }[] = [];
const uncaught: unknown[] = [];
const onError = (e: ErrorEvent) => uncaught.push(e.error ?? e.message);
let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  uncaught.length = 0;
  window.addEventListener("error", onError);
  mockWindows("main");
  mockIPC(
    (cmd, args) => {
      calls.push({ cmd, args: (args ?? {}) as Record<string, unknown> });
      if (cmd === "list_projects" || cmd === "prune_missing_projects")
        return [];
      if (cmd === "picker_announce_actions") return {};
      return null;
    },
    { shouldMockEvents: true },
  );
});

afterEach(async () => {
  await act(async () => root?.unmount());
  await settle();
  host?.remove();
  root = null;
  host = null;
  window.removeEventListener("error", onError);
  clearMocks();
  expect(uncaught).toEqual([]);
});

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

/** Mount the real App and open A then B through the seed seam. */
async function mountWithTwo({ collapsed = false } = {}) {
  if (collapsed) localStorage.setItem(FILMSTRIP_COLLAPSED_KEY, "true");
  const { default: App } = await import("../App");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<App />));
  const seed = (window as { __seedWorkspace?: (p: string) => void })
    .__seedWorkspace!;
  await act(async () => seed(A));
  await act(async () => seed(B));
  await settle();
  ids = { a: idOf("scratch-a"), b: idOf("scratch-b") };
  // Positive control: both open, B focused. Every "still open" / "still focused" assertion below
  // is vacuous without it.
  expect(open()).toEqual(["a", "b"]);
  expect(focused()).toBe("b");
  return host;
}

function idOf(name: string): string {
  const el = host!.querySelector(`[aria-label="Close ${name}"]`);
  const id = el?.getAttribute("data-testid")?.replace("filmstrip-close-", "");
  if (!id) throw new Error(`no open workspace named ${name}`);
  return id;
}

const nameOf = (id: string | null) =>
  id === ids.a ? "a" : id === ids.b ? "b" : id;

/** The open workspaces, as "a" / "b". */
const open = () => openIds().map(nameOf).sort();
/** The focused workspace, as "a" / "b". */
const focused = () => nameOf(focusedId());

/** The open workspaces, read off the filmstrip's close controls (present on every tile/pill). */
function openIds(): string[] {
  return [...host!.querySelectorAll('[data-testid^="filmstrip-close-"]')]
    .map((e) => e.getAttribute("data-testid")!.replace("filmstrip-close-", ""))
    .sort();
}

/** The center-stage workspace: the tile/pill marked `aria-current`. */
function focusedId(): string | null {
  const cur = host!.querySelector('.filmstrip [aria-current="true"]');
  const close = cur?.querySelector('[data-testid^="filmstrip-close-"]');
  return (
    close?.getAttribute("data-testid")?.replace("filmstrip-close-", "") ?? null
  );
}

const control = (kind: "close" | "pause", which: "a" | "b") =>
  host!.querySelector<HTMLElement>(
    `[data-testid="filmstrip-${kind}-${ids[which]}"]`,
  );
const dialog = () => host!.querySelector('[data-testid="confirm-dialog"]');

async function click(el: Element | null) {
  if (!el) throw new Error("click target not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

async function press(el: Element | null, key: string) {
  if (!el) throw new Error("key target not found");
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
  await settle();
}

async function setStatus(which: "a" | "b", state: string) {
  await act(async () => {
    await emit(WORKSPACE_STATUS_EVENT, { workspace_id: ids[which], state });
  });
  await settle();
}

const markedClean = () =>
  calls
    .filter((c) => c.cmd === "session_state_mark_clean")
    .map((c) => c.args.projectPath);

describe("× on an IDLE workspace closes it at once", () => {
  it("closes a background workspace, marks it clean, and leaves the focus alone", async () => {
    await mountWithTwo();
    await click(control("close", "a"));
    expect(dialog()).toBeNull();
    expect(open()).toEqual(["b"]);
    expect(focused()).toBe("b");
    expect(markedClean()).toEqual([A]);
  });

  it("closing the FOCUSED workspace re-picks the focus onto the survivor", async () => {
    await mountWithTwo();
    await click(control("close", "b"));
    expect(open()).toEqual(["a"]);
    expect(focused()).toBe("a");
    expect(markedClean()).toEqual([B]);
  });

  it("the × answers Enter and Space as well as a click", async () => {
    await mountWithTwo();
    await press(control("close", "a"), "Enter");
    expect(open()).toEqual(["b"]);
    await press(control("close", "b"), " ");
    expect(open()).toEqual([]);
  });
});

describe("× on a BUSY workspace asks first", () => {
  it("opens the confirm, and Cancel keeps the workspace and dismisses the dialog", async () => {
    await mountWithTwo();
    await setStatus("a", "running");
    await click(control("close", "a"));
    expect(dialog()?.textContent).toContain("still working");
    expect(open()).toEqual(["a", "b"]);

    await click(host!.querySelector('[data-testid="confirm-cancel"]'));
    expect(dialog()).toBeNull();
    expect(open()).toEqual(["a", "b"]);
    expect(markedClean()).toEqual([]);
  });

  it("Close Anyway tears it down as a CLEAN close", async () => {
    await mountWithTwo();
    await setStatus("a", "running");
    await click(control("close", "a"));
    await click(host!.querySelector('[data-testid="confirm-close"]'));
    expect(dialog()).toBeNull();
    expect(open()).toEqual(["b"]);
    expect(markedClean()).toEqual([A]);
  });
});

describe("⏸ keeps the session marked UNFINISHED through the same gate", () => {
  it("an idle ⏸ closes without marking clean", async () => {
    await mountWithTwo();
    await click(control("pause", "a"));
    expect(open()).toEqual(["b"]);
    expect(markedClean()).toEqual([]);
  });

  it("⚠️ a BUSY ⏸ confirmed with Close Anyway is STILL unclean", async () => {
    // The intent must ride through `pendingClose`. If it were dropped, the confirm would resolve as
    // a clean close and clear the very flag the ⏸ exists to preserve, so the next open would offer
    // nothing instead of `--continue`.
    await mountWithTwo();
    await setStatus("a", "running");
    await click(control("pause", "a"));
    expect(dialog()).not.toBeNull();
    await click(host!.querySelector('[data-testid="confirm-close"]'));
    expect(open()).toEqual(["b"]);
    expect(markedClean()).toEqual([]);
  });
});

describe("the tile controls do not leak into the tile they sit on", () => {
  it("× on a collapsed pill does not also PROMOTE that workspace", async () => {
    // A collapsed pill is itself a <button> that promotes on click, and the × sits inside it. With
    // the target busy, the × opens a confirm and leaves the workspace open, so a leaked click would
    // show up as the focus jumping to it.
    await mountWithTwo({ collapsed: true });
    expect(host!.querySelector(".filmstrip--collapsed")).not.toBeNull();
    await setStatus("a", "running");
    await click(control("close", "a"));
    expect(dialog()).not.toBeNull();
    expect(focused()).toBe("b");
  });
});
