// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  click,
  ipcCalls,
  mountWorkspace,
  uncaught,
  unmountWorkspace,
} from "./liveWorkspace";
import { slashCommandPayload } from "../autoResumeFire";
import { CLEAR_TESTID, showClearButton } from "../clearButton";

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

// The `clear` button on a LIVE mount. Order and presence are asserted by IDENTITY (testids in
// DOM order), never by a count: a count of seven would pass with `clear` after `restore`.

afterEach(async () => {
  await unmountWorkspace();
});

/** The header's injecting buttons, by testid, in DOM order. */
function headerButtons(el: Element): string[] {
  return [
    ...el.querySelectorAll<HTMLElement>(
      `[data-testid^="workspace-skill-"]:not([data-testid="workspace-skill-row"]), [data-testid="${CLEAR_TESTID}"]`,
    ),
  ].map((b) => b.dataset.testid ?? "");
}

describe("the clear button", () => {
  it("gate ON: renders INSIDE the skill row, immediately before restore", async () => {
    const el = await mountWorkspace({ gate: true, profile: null });
    const row = el.querySelector('[data-testid="workspace-skill-row"]');
    expect(row, "positive control: the gated row is present").not.toBeNull();
    expect(
      row?.querySelector(`[data-testid="${CLEAR_TESTID}"]`),
    ).not.toBeNull();
    const order = headerButtons(el);
    expect(order.slice(0, 3)).toEqual([
      "workspace-skill-session-start",
      CLEAR_TESTID,
      "workspace-skill-session-restore",
    ]);
    // Exactly one — the standalone placement must not ALSO render while the row is present.
    expect(el.querySelectorAll(`[data-testid="${CLEAR_TESTID}"]`)).toHaveLength(
      1,
    );
    expect(uncaught).toEqual([]);
  });

  it("gate OFF: the row is absent but clear SURVIVES — it is a stock CC command", async () => {
    const el = await mountWorkspace({ gate: false, profile: null });
    expect(el.querySelector('[data-testid="workspace-skill-row"]')).toBeNull();
    expect(el.querySelectorAll(`[data-testid="${CLEAR_TESTID}"]`)).toHaveLength(
      1,
    );
    expect(uncaught).toEqual([]);
  });

  it("gate ON, non-default profile: the workflow row is absent, clear still renders", async () => {
    const el = await mountWorkspace({ gate: true, profile: "neo" });
    expect(el.querySelector('[data-testid="workspace-skill-row"]')).toBeNull();
    expect(el.querySelectorAll(`[data-testid="${CLEAR_TESTID}"]`)).toHaveLength(
      1,
    );
  });

  it.each([true, false])(
    "a click sends exactly /clear⏎ to THIS workspace's session (gate %s)",
    async (gate) => {
      const el = await mountWorkspace({ gate, profile: null });
      ipcCalls.length = 0;
      await click(el.querySelector(`[data-testid="${CLEAR_TESTID}"]`));
      const sends = ipcCalls.filter((c) => c.cmd === "cc_input");
      expect(sends).toEqual([
        {
          cmd: "cc_input",
          args: { sessionId: "cc-1", data: slashCommandPayload("/clear") },
        },
      ]);
    },
  );

  it("the predicate takes no gate: only a live session id decides", () => {
    expect(showClearButton({ ccSessionId: "cc-1" })).toBe(true);
    expect(showClearButton({ ccSessionId: null })).toBe(false);
  });
});
