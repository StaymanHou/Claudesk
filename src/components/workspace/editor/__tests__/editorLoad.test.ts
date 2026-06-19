import { describe, it, expect } from "vitest";
import { initialLoadState, loadReducer, type LoadState } from "../editorLoad";

describe("loadReducer", () => {
  it("starts idle", () => {
    expect(initialLoadState).toEqual({ kind: "idle" });
  });

  it("load-start → loading with the path", () => {
    const s = loadReducer(initialLoadState, {
      type: "load-start",
      path: "src/main.rs",
    });
    expect(s).toEqual({ kind: "loading", path: "src/main.rs" });
  });

  it("load-ok → loaded with the path", () => {
    const loading: LoadState = { kind: "loading", path: "a.ts" };
    const s = loadReducer(loading, { type: "load-ok", path: "a.ts" });
    expect(s).toEqual({ kind: "loaded", path: "a.ts" });
  });

  it("load-fail → error carrying the message", () => {
    const loading: LoadState = { kind: "loading", path: "bin.dat" };
    const s = loadReducer(loading, {
      type: "load-fail",
      path: "bin.dat",
      message: "file is not valid UTF-8 text",
    });
    expect(s).toEqual({
      kind: "error",
      path: "bin.dat",
      message: "file is not valid UTF-8 text",
    });
  });

  it("a new load-start supersedes a prior error (re-open after failure)", () => {
    const errored: LoadState = {
      kind: "error",
      path: "bad",
      message: "boom",
    };
    const s = loadReducer(errored, { type: "load-start", path: "good.ts" });
    expect(s).toEqual({ kind: "loading", path: "good.ts" });
  });
});
