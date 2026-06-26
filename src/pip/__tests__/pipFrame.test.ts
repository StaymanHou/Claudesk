import { describe, expect, it } from "vitest";
import {
  derivePipFrame,
  emptyPipFrame,
  PIP_FRAME_EVENT,
  PIP_READY_EVENT,
  PIP_WINDOW_LABEL,
} from "../pipFrame";

// M5 WP3 Phase 2 — pure PiP frame derivation. The listen/emit wiring is verify-self;
// these pin the contract: order preserved, NO tile dropped (the roster divergence),
// roster fields projected verbatim, honest-empty default.

describe("derivePipFrame", () => {
  it("projects id + display_name in input order, dropping nothing", () => {
    const frame = derivePipFrame([
      { id: "ws-1", display_name: "alpha" },
      { id: "ws-2", display_name: "beta" },
      { id: "ws-3", display_name: "gamma" },
    ]);
    expect(frame.tiles).toEqual([
      { id: "ws-1", display_name: "alpha" },
      { id: "ws-2", display_name: "beta" },
      { id: "ws-3", display_name: "gamma" },
    ]);
  });

  it("includes EVERY workspace — there is no active/center-staged exclusion (the intentional divergence from the filmstrip)", () => {
    // The filmstrip would mark one tile active+static; the PiP keeps all N as full
    // members. A regression that reintroduced an `active`-drop would shrink this.
    const ordered = Array.from({ length: 5 }, (_, i) => ({
      id: `ws-${i}`,
      display_name: `p${i}`,
    }));
    const frame = derivePipFrame(ordered);
    expect(frame.tiles).toHaveLength(5);
    expect(frame.tiles.map((t) => t.id)).toEqual([
      "ws-0",
      "ws-1",
      "ws-2",
      "ws-3",
      "ws-4",
    ]);
  });

  it("ignores extra fields on the input (only id + display_name cross the wire)", () => {
    const frame = derivePipFrame([
      // deliberately wider than PipFrameTile — derive must not leak extras.
      {
        id: "ws-1",
        display_name: "alpha",
        project_path: "/x",
        active: true,
      } as never,
    ]);
    expect(frame.tiles).toEqual([{ id: "ws-1", display_name: "alpha" }]);
  });

  it("empty roster → empty frame", () => {
    expect(derivePipFrame([])).toEqual({ tiles: [] });
    expect(emptyPipFrame).toEqual({ tiles: [] });
  });
});

describe("PiP wire constants are stable", () => {
  it("event + label names match the cross-surface contract", () => {
    // These strings are shared by App.tsx (emitTo), Pip.tsx (listen), and the Rust
    // panel label — a silent rename here desyncs the fan-out.
    expect(PIP_FRAME_EVENT).toBe("pip-frame");
    expect(PIP_READY_EVENT).toBe("pip-ready");
    expect(PIP_WINDOW_LABEL).toBe("pip");
  });
});
