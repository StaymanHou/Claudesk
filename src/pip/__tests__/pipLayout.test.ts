// M5 WP4 — pure layout-core contract (the vitest-pinned half of WP4).
import { describe, expect, it } from "vitest";
import {
  AWAITING_INPUT_STATE,
  coercePipLayout,
  DEFAULT_PIP_LAYOUT,
  isAwaitingInput,
  layoutNeedsMirror,
  nextLayout,
  orderForAttention,
  PIP_LAYOUT_CYCLE,
  PIP_LAYOUT_EVENT,
  type PipLayout,
} from "../pipLayout";

describe("pipLayout — the layout vocabulary + cycle", () => {
  it("default layout is WP3's horizontal mirror", () => {
    expect(DEFAULT_PIP_LAYOUT).toBe("horizontal-mirror");
  });

  it("the cycle holds all four layouts richest → most minimal", () => {
    expect(PIP_LAYOUT_CYCLE).toEqual([
      "horizontal-mirror",
      "vertical-mirror",
      "compact",
      "minimal",
    ]);
  });

  it("the event name matches the wire contract", () => {
    expect(PIP_LAYOUT_EVENT).toBe("pip-layout");
  });
});

describe("layoutNeedsMirror — the serialize-cost gate", () => {
  it("the two mirror layouts render a mirror", () => {
    expect(layoutNeedsMirror("horizontal-mirror")).toBe(true);
    expect(layoutNeedsMirror("vertical-mirror")).toBe(true);
  });

  it("compact + minimal render NO mirror (no serialize cost)", () => {
    expect(layoutNeedsMirror("compact")).toBe(false);
    expect(layoutNeedsMirror("minimal")).toBe(false);
  });
});

describe("nextLayout — the switcher cycle (wrapping)", () => {
  it("steps through the cycle and wraps after the last", () => {
    expect(nextLayout("horizontal-mirror")).toBe("vertical-mirror");
    expect(nextLayout("vertical-mirror")).toBe("compact");
    expect(nextLayout("compact")).toBe("minimal");
    expect(nextLayout("minimal")).toBe("horizontal-mirror");
  });

  it("a full cycle returns to the start in exactly 4 steps", () => {
    let l: PipLayout = DEFAULT_PIP_LAYOUT;
    for (let i = 0; i < PIP_LAYOUT_CYCLE.length; i++) l = nextLayout(l);
    expect(l).toBe(DEFAULT_PIP_LAYOUT);
  });

  it("an unrecognized current value falls back to the first layout", () => {
    expect(nextLayout("bogus" as PipLayout)).toBe("horizontal-mirror");
  });
});

describe("coercePipLayout — honest fall-back on a stale/corrupt value", () => {
  it("passes through a known layout", () => {
    expect(coercePipLayout("minimal")).toBe("minimal");
  });

  it("falls back to the default on anything unrecognized", () => {
    expect(coercePipLayout("light-mode")).toBe(DEFAULT_PIP_LAYOUT);
    expect(coercePipLayout(null)).toBe(DEFAULT_PIP_LAYOUT);
    expect(coercePipLayout(undefined)).toBe(DEFAULT_PIP_LAYOUT);
    expect(coercePipLayout(42)).toBe(DEFAULT_PIP_LAYOUT);
  });
});

describe("Phase 4 — isAwaitingInput (the 'needs me' predicate)", () => {
  it("is true only for the awaiting_input wire state", () => {
    const map = { a: "awaiting_input", b: "running", c: "idle", d: "unknown" };
    expect(isAwaitingInput(map, "a")).toBe(true);
    expect(isAwaitingInput(map, "b")).toBe(false);
    expect(isAwaitingInput(map, "c")).toBe(false);
    expect(isAwaitingInput(map, "d")).toBe(false);
  });

  it("is false for a workspace with no observed status (absent in the map)", () => {
    expect(isAwaitingInput({}, "ghost")).toBe(false);
  });

  it("keys on the snake_case wire literal (contract pin)", () => {
    expect(AWAITING_INPUT_STATE).toBe("awaiting_input");
  });
});

describe("Phase 4 — orderForAttention (awaiting-input sorts first, stable)", () => {
  const tiles = [
    { id: "w1" },
    { id: "w2" },
    { id: "w3" },
    { id: "w4" },
  ];

  it("pulls awaiting-input workspaces to the front", () => {
    const map = { w1: "running", w2: "awaiting_input", w3: "idle", w4: "running" };
    expect(orderForAttention(tiles, map).map((t) => t.id)).toEqual([
      "w2",
      "w1",
      "w3",
      "w4",
    ]);
  });

  it("is stable: multiple awaiting-input keep their relative order, as does the rest", () => {
    const map = {
      w1: "running",
      w2: "awaiting_input",
      w3: "awaiting_input",
      w4: "idle",
    };
    // w2 before w3 (both awaiting, original order); w1 before w4 (both rest, original order).
    expect(orderForAttention(tiles, map).map((t) => t.id)).toEqual([
      "w2",
      "w3",
      "w1",
      "w4",
    ]);
  });

  it("all-running (or all-idle) keeps the original order untouched", () => {
    const map = { w1: "running", w2: "running", w3: "running", w4: "running" };
    expect(orderForAttention(tiles, map).map((t) => t.id)).toEqual([
      "w1",
      "w2",
      "w3",
      "w4",
    ]);
  });

  it("does not mutate the input array", () => {
    const map = { w2: "awaiting_input" };
    const original = [...tiles];
    orderForAttention(tiles, map);
    expect(tiles).toEqual(original);
  });

  it("an empty roster returns empty", () => {
    expect(orderForAttention([], {})).toEqual([]);
  });
});
