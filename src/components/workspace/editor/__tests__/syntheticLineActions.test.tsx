// @vitest-environment jsdom
// M16.5 WP6 — SyntheticView's per-line buttons, on the REAL component under jsdom: they
// render on exactly the action lines, stay out of the buffer text, and a button click
// runs its action WITHOUT also firing the row's onLineClick (which would open the file).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SyntheticView, type SyntheticLineAction } from "../SyntheticView";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout; CM6 measures through these.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??=
  NoopResizeObserver;
const zeroRect = () =>
  ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
  }) as DOMRect;
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= zeroRect;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function render(
  content: string,
  lineActions: SyntheticLineAction[],
  onLineClick = vi.fn(),
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <SyntheticView
        content={content}
        lineActions={lineActions}
        onLineClick={onLineClick}
      />,
    ),
  );
  return onLineClick;
}

const CONTENT = ["title", "", "src/a.ts:", "   1:  foo", "   2:  foo"].join(
  "\n",
);

function action(
  line: number,
  testid: string,
  onClick = vi.fn(),
): SyntheticLineAction {
  return { line, label: `L${line}`, title: `do ${line}`, testid, onClick };
}

/** The `.cm-line` each button sits in, by 0-based line index. */
function lineIndexOf(el: Element): number {
  const lines = [...host!.querySelectorAll(".cm-line")];
  return lines.indexOf(el.closest(".cm-line")!);
}

describe("SyntheticView line actions (M16.5 WP6, live)", () => {
  it("renders one button per action, on that action's line", async () => {
    await render(CONTENT, [
      action(3, "find-replace-file"),
      action(5, "find-replace-match"),
    ]);
    const buttons = [
      ...host!.querySelectorAll("button.cm-synthetic-line-action"),
    ];
    expect(
      buttons.map((b) => [b.getAttribute("data-testid"), lineIndexOf(b) + 1]),
    ).toEqual([
      ["find-replace-file", 3],
      ["find-replace-match", 5],
    ]);
    expect(buttons[1].getAttribute("title")).toBe("do 5");
    expect(buttons[1].textContent).toBe("L5");
    // Each carrying line is marked so the hover rule can find it.
    expect(buttons.every((b) => b.closest(".cm-synthetic-action-line"))).toBe(
      true,
    );
  });

  it("keeps the buttons out of the buffer text", async () => {
    await render(CONTENT, [action(4, "find-replace-match")]);
    const view = host!.querySelector(".cm-content")!;
    // The doc is the content verbatim: the label is a widget, not text.
    const docText = [...view.querySelectorAll(".cm-line")]
      .map((l) => {
        const clone = l.cloneNode(true) as Element;
        clone
          .querySelectorAll(".cm-synthetic-line-action")
          .forEach((b) => b.remove());
        return clone.textContent;
      })
      .join("\n");
    expect(docText).toBe(CONTENT);
  });

  // Two independent guards keep a button press from reaching the row handler: the widget's
  // `ignoreEvent()` and the button's mousedown `preventDefault`. Measured: removing either
  // ALONE leaves this green (the other still holds); removing BOTH fails it. jsdom does run
  // the row handler (a plain line mousedown reports line 1, since nothing has layout), so
  // the negative assertion below is not vacuous.
  it("runs the action on click and does NOT fire the row's onLineClick", async () => {
    const run = vi.fn();
    const onLineClick = await render(CONTENT, [
      action(4, "find-replace-match", run),
    ]);
    const button = host!.querySelector<HTMLButtonElement>(
      '[data-testid="find-replace-match"]',
    )!;
    await act(async () => {
      button.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      button.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
      );
      button.click();
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(onLineClick).not.toHaveBeenCalled();
  });

  it("renders no buttons without actions", async () => {
    await render(CONTENT, []);
    expect(host!.querySelector(".cm-synthetic-line-action")).toBeNull();
  });
});
