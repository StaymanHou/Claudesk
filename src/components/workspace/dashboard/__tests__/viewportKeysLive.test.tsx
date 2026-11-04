// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ViewportProvider, useViewport } from "../ViewportContext";

// M16.5 WP5 (5.5) — the provider's window keydown listener actually routes the keys
// (the pure math is pinned in viewportKeys.test.ts; this pins the WIRING).

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function Readout() {
  const vp = useViewport();
  return (
    <output data-testid="vp">
      {vp.visible_start_min}:{vp.visible_end_min}
    </output>
  );
}

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <ViewportProvider
        seed={{ visible_start_min: 600, visible_end_min: 840 }}
        dataWindow={[0, 1440]}
      >
        <Readout />
        <input data-testid="typing" />
        <select data-testid="picker">
          <option>a</option>
          <option>b</option>
        </select>
      </ViewportProvider>,
    ),
  );
}

const vp = () => host!.querySelector('[data-testid="vp"]')!.textContent;

async function press(
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget = window,
): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  await act(async () => {
    target.dispatchEvent(ev);
  });
  return ev;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("ViewportProvider keyboard — live", () => {
  it("→ pans, Home/End jump, and 0 resets", async () => {
    await mount();
    expect(vp()).toBe("600:840");
    await press("ArrowRight");
    expect(vp()).toBe("624:864");
    await press("End");
    expect(vp()).toBe("1200:1440");
    await press("Home");
    expect(vp()).toBe("0:240");
    await press("0");
    expect(vp()).toBe("600:840");
  });

  it("ignores ⌘-combos and keys typed into an input", async () => {
    await mount();
    await press("ArrowRight", { metaKey: true });
    expect(vp()).toBe("600:840");
    const input = host!.querySelector('[data-testid="typing"]')!;
    await press("ArrowRight", {}, input);
    expect(vp()).toBe("600:840");
    // Positive control: the same key, not from the input, does move it.
    await press("ArrowRight");
    expect(vp()).toBe("624:864");
  });

  it("leaves a focused <select> its own keys: no pan, and the default is not prevented", async () => {
    await mount();
    const select = host!.querySelector('[data-testid="picker"]')!;
    for (const key of ["ArrowRight", "ArrowLeft", "End", "Home"]) {
      const ev = await press(key, {}, select);
      expect(vp(), key).toBe("600:840");
      expect(ev.defaultPrevented, key).toBe(false);
    }
    // Positive control: the same key from the window does pan and does prevent the default.
    const ev = await press("ArrowRight");
    expect(vp()).toBe("624:864");
    expect(ev.defaultPrevented).toBe(true);
  });
});
