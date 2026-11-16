// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  click,
  ipcCalls,
  mountWorkspace,
  rightPanel,
  settle,
  uncaught,
  unmountWorkspace,
} from "./liveWorkspace";
import { act } from "react";
import {
  promptInjectFailure,
  recycleInjectFailure,
  skillInjectFailure,
} from "../injectFailure";

vi.mock(
  "../XtermPane",
  async () => (await import("./liveWorkspace")).xtermPaneModule,
);
vi.mock(
  "../RightPanelHost",
  async () => (await import("./liveWorkspace")).rightPanelModule,
);
vi.mock(
  "../../../state/useWorkflowFeaturesEnabled",
  async () => (await import("./liveWorkspace")).gateModule,
);

// M17 WP3 P4.verify-human.2 (operator decision A, 2026-11-16) — a REFUSED injection shows a
// plain-words toast on a LIVE Workspace mount. `cc_inject` refuses when a remote pane never gets
// ready; before this, the refusal reached only `console.warn`.
//
// ⚠️ The rejection is driven at the IPC edge (`mockIPC` throws the backend's string), so the REAL
// `fireSkillCommand` → REAL `injectCommand` → REAL toast state runs; no funnel is mocked.

const NOT_READY =
  "Claude Code on host.example isn't ready for input yet (waited 15s)";

afterEach(async () => {
  vi.restoreAllMocks();
  await unmountWorkspace();
});

const toastOf = (el: Element) =>
  el.querySelector<HTMLElement>('[data-testid="workspace-inject-toast"]');

describe("the not-sent toast", () => {
  it("a skill button whose cc_inject is refused shows the backend's reason", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = await mountWorkspace({
      gate: true,
      ipcRejects: { cc_inject: NOT_READY },
    });
    expect(toastOf(el)).toBeNull(); // positive control: no toast before the click
    await click(
      el.querySelector('[data-testid="workspace-skill-session-restore"]'),
    );
    await settle();
    // The injection really crossed the IPC edge (and was refused there).
    expect(ipcCalls.some((c) => c.cmd === "cc_inject")).toBe(true);
    const toast = toastOf(el);
    expect(toast?.getAttribute("role")).toBe("alert");
    expect(toast?.textContent).toContain(
      skillInjectFailure("/session-restore", NOT_READY),
    );
    expect(uncaught).toEqual([]);
  });

  it("× dismisses it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = await mountWorkspace({
      gate: true,
      ipcRejects: { cc_inject: NOT_READY },
    });
    await click(
      el.querySelector('[data-testid="workspace-skill-session-restore"]'),
    );
    await settle();
    expect(toastOf(el)).not.toBeNull();
    await click(toastOf(el)?.querySelector('button[aria-label="Dismiss"]'));
    expect(toastOf(el)).toBeNull();
  });

  it("a skill button whose cc_inject succeeds shows NO toast", async () => {
    const el = await mountWorkspace({ gate: true });
    await click(
      el.querySelector('[data-testid="workspace-skill-session-restore"]'),
    );
    await settle();
    expect(ipcCalls.some((c) => c.cmd === "cc_inject")).toBe(true);
    expect(toastOf(el)).toBeNull();
  });

  it("the Prompt panel's failure handler is wired to the same toast", async () => {
    // RightPanelHost is stubbed here; `promptSendWiring.test.tsx` proves the real panel calls
    // `onSendFailure` with `promptInjectFailure(reason)`. This proves Workspace hands the panel
    // a setter that RENDERS.
    const el = await mountWorkspace({ gate: false });
    const report = rightPanel.props?.onInjectFailure;
    expect(report).toBeTypeOf("function");
    await act(async () => report!(promptInjectFailure(NOT_READY)));
    expect(toastOf(el)?.textContent).toContain(promptInjectFailure(NOT_READY));
  });

  it("a Recycle whose handoff is refused shows the recycle toast at once (P4.6)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = await mountWorkspace({
      gate: true,
      ipcRejects: { cc_inject: NOT_READY },
    });
    await click(el.querySelector('[data-testid="workspace-recycle"]'));
    await settle();
    expect(toastOf(el)?.textContent).toContain(
      recycleInjectFailure("handoff", NOT_READY),
    );
  });
});
