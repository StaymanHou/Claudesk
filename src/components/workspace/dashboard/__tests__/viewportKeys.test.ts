import { describe, expect, it } from "vitest";
import {
  KEY_PAN_FRACTION,
  KEY_ZOOM_FACTOR,
  VIEWPORT_KEYS,
  isViewportKey,
  viewportForKey,
  viewportKeyAction,
  type DataWindow,
  type Viewport,
} from "../viewport";

// M16.5 WP5 (5.5) — Day-view keyboard pan/zoom. The fixture viewport is OFF-centre in its
// data window and its span is not a round multiple, so a wrong anchor or a wrong direction
// cannot produce the same numbers as the right one.
const vp: Viewport = { visible_start_min: 600, visible_end_min: 840 }; // span 240
const win: DataWindow = [0, 1440];

describe("viewportForKey", () => {
  it("→ pans later and ← pans earlier by 10% of the span, keeping the span", () => {
    expect(KEY_PAN_FRACTION).toBe(0.1);
    expect(viewportForKey(vp, "ArrowRight", win)).toEqual({
      visible_start_min: 624,
      visible_end_min: 864,
    });
    expect(viewportForKey(vp, "ArrowLeft", win)).toEqual({
      visible_start_min: 576,
      visible_end_min: 816,
    });
  });

  it("+ and = zoom IN around the centre; - zooms OUT around the centre", () => {
    expect(KEY_ZOOM_FACTOR).toBe(1.25);
    const centre = 720;
    for (const key of ["+", "="] as const) {
      const z = viewportForKey(vp, key, win)!;
      expect(z.visible_end_min - z.visible_start_min).toBeCloseTo(240 / 1.25);
      expect((z.visible_start_min + z.visible_end_min) / 2).toBeCloseTo(centre);
    }
    const out = viewportForKey(vp, "-", win)!;
    expect(out.visible_end_min - out.visible_start_min).toBeCloseTo(240 * 1.25);
    expect((out.visible_start_min + out.visible_end_min) / 2).toBeCloseTo(
      centre,
    );
  });

  it("Home / End jump to the data window's start / end, keeping the span", () => {
    expect(viewportForKey(vp, "Home", win)).toEqual({
      visible_start_min: 0,
      visible_end_min: 240,
    });
    expect(viewportForKey(vp, "End", win)).toEqual({
      visible_start_min: 1200,
      visible_end_min: 1440,
    });
  });

  it("accepts only ViewportKey, and every VIEWPORT_KEYS key moves the viewport", () => {
    // Compile-time: a key outside the closed type is a type error. If the parameter were
    // widened back to `string`, these directives would go unused and `tsc` would fail.
    // @ts-expect-error — "a" is not a ViewportKey
    void (() => viewportForKey(vp, "a", win));
    // @ts-expect-error — ArrowUp is not handled (the Day view pans horizontally only)
    void (() => viewportForKey(vp, "ArrowUp", win));
    for (const key of VIEWPORT_KEYS) {
      expect(viewportForKey(vp, key, win), key).not.toEqual(vp);
    }
    expect(isViewportKey("Home")).toBe(true);
    expect(isViewportKey("0")).toBe(false);
    expect(isViewportKey("ArrowUp")).toBe(false);
  });
});

describe("viewportKeyAction — the listener's chord predicate", () => {
  const ev = (
    key: string,
    mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey", boolean>> = {},
  ) => ({
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...mods,
  });

  it("maps bare 0 to reset and bare viewport keys to themselves", () => {
    expect(viewportKeyAction(ev("0"))).toBe("reset");
    expect(viewportKeyAction(ev("ArrowLeft"))).toBe("ArrowLeft");
    expect(viewportKeyAction(ev("End"))).toBe("End");
    expect(viewportKeyAction(ev("x"))).toBeNull();
  });

  it("ignores every ⌘ / ⌃ / ⌥ combo, so ⌘= / ⌘- / ⌘0 stay with the app and editor", () => {
    for (const mod of ["metaKey", "ctrlKey", "altKey"] as const) {
      for (const key of ["0", "=", "-", "ArrowLeft", "Home"]) {
        expect(
          viewportKeyAction(ev(key, { [mod]: true })),
          `${mod}+${key}`,
        ).toBeNull();
      }
    }
  });
});
