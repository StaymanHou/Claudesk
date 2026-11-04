// jsdom shims for live tests that mount CodeMirror 6 (and the panels around it).
//
// Import it for its side effect, before mounting anything:
//   import "../../../test-support/cm6JsdomShims";
//
// jsdom has no layout engine, so it lacks what CM6 and the right panel read at runtime:
//   - `ResizeObserver` (CM6's view, the right panel's terminal)
//   - `window.matchMedia` (CM6 and theme queries)
//   - `Range.getClientRects` / `getBoundingClientRect` (CM6 measures text ranges with these)
//
// ⚠️ Every shim uses `??=`, so a real implementation (a future jsdom, or a test that installs its
// own) always wins. Extracted at paydown 2026-11-04 WP3 from five test files that each carried a
// copy: the next jsdom gap now gets patched once, here.

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??=
  NoopResizeObserver;

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

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
