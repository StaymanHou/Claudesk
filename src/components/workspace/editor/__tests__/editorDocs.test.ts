// WP12 Phase 2S — tests for the shared document store reducer.

import { describe, it, expect } from "vitest";
import {
  initialDocsState,
  docsReducer,
  isDirty,
  type DocsState,
} from "../editorDocs";

const open = (s: DocsState, path: string) =>
  docsReducer(s, { type: "open-doc", path });

describe("open-doc / close-doc ref-counting", () => {
  it("creates a fresh entry (refCount 1) on first open", () => {
    const s = open(initialDocsState, "a.ts");
    expect(s.byPath["a.ts"]).toMatchObject({
      doc: "",
      savedDoc: "",
      languageOverrideId: null,
      refCount: 1,
    });
  });

  it("a second view of the same path SHARES one entry (refCount 2)", () => {
    let s = open(initialDocsState, "a.ts");
    s = open(s, "a.ts"); // pane 2 opens the same file
    expect(Object.keys(s.byPath)).toEqual(["a.ts"]);
    expect(s.byPath["a.ts"].refCount).toBe(2);
  });

  it("closing one of two views KEEPS the entry (the other view still holds it)", () => {
    let s = open(initialDocsState, "a.ts");
    s = open(s, "a.ts"); // refCount 2
    s = docsReducer(s, { type: "close-doc", path: "a.ts" }); // one view closes
    expect(s.byPath["a.ts"]).toBeDefined();
    expect(s.byPath["a.ts"].refCount).toBe(1);
  });

  it("closing the LAST view drops the entry (frees the buffer)", () => {
    let s = open(initialDocsState, "a.ts");
    s = docsReducer(s, { type: "close-doc", path: "a.ts" });
    expect(s.byPath["a.ts"]).toBeUndefined();
  });

  it("close-doc on an unknown path is a no-op", () => {
    const s = open(initialDocsState, "a.ts");
    expect(docsReducer(s, { type: "close-doc", path: "ghost.ts" })).toBe(s);
  });

  it("two DIFFERENT paths are independent entries", () => {
    let s = open(initialDocsState, "a.ts");
    s = open(s, "b.ts");
    expect(Object.keys(s.byPath).sort()).toEqual(["a.ts", "b.ts"]);
    expect(s.byPath["a.ts"].refCount).toBe(1);
    expect(s.byPath["b.ts"].refCount).toBe(1);
  });
});

describe("set-doc (shared edit)", () => {
  it("updates the shared buffer for the path (all views read this)", () => {
    let s = open(initialDocsState, "a.ts");
    s = docsReducer(s, { type: "set-doc", path: "a.ts", doc: "hello" });
    expect(s.byPath["a.ts"].doc).toBe("hello");
  });

  it("is a no-op (identity) when the doc is unchanged", () => {
    let s = open(initialDocsState, "a.ts");
    s = docsReducer(s, { type: "set-doc", path: "a.ts", doc: "x" });
    expect(docsReducer(s, { type: "set-doc", path: "a.ts", doc: "x" })).toBe(s);
  });

  it("ignores an edit for a closed path", () => {
    const s = open(initialDocsState, "a.ts");
    expect(
      docsReducer(s, { type: "set-doc", path: "ghost.ts", doc: "z" }),
    ).toBe(s);
  });
});

describe("load lifecycle", () => {
  it("load-start marks loading + resets stale save status", () => {
    let s = open(initialDocsState, "a.ts");
    s = docsReducer(s, { type: "load-start", path: "a.ts" });
    expect(s.byPath["a.ts"].load).toEqual({ kind: "loading", path: "a.ts" });
    expect(s.byPath["a.ts"].save.kind).toBe("idle");
  });

  it("load-ok seeds doc + savedDoc (clean) and marks loaded", () => {
    let s = open(initialDocsState, "a.ts");
    s = docsReducer(s, { type: "load-start", path: "a.ts" });
    s = docsReducer(s, { type: "load-ok", path: "a.ts", contents: "body" });
    const e = s.byPath["a.ts"];
    expect(e.doc).toBe("body");
    expect(e.savedDoc).toBe("body");
    expect(isDirty(e)).toBe(false);
    expect(e.load).toEqual({ kind: "loaded", path: "a.ts" });
  });

  it("load-fail clears the buffer and records the error", () => {
    let s = open(initialDocsState, "a.ts");
    s = docsReducer(s, { type: "load-start", path: "a.ts" });
    s = docsReducer(s, {
      type: "load-fail",
      path: "a.ts",
      message: "nope",
    });
    expect(s.byPath["a.ts"].load).toEqual({
      kind: "error",
      path: "a.ts",
      message: "nope",
    });
  });
});

describe("save lifecycle + dirty", () => {
  it("an edit makes the doc dirty; save-ok clears it (advances savedDoc)", () => {
    let s = open(initialDocsState, "a.ts");
    s = docsReducer(s, { type: "load-ok", path: "a.ts", contents: "orig" });
    s = docsReducer(s, { type: "set-doc", path: "a.ts", doc: "edited" });
    expect(isDirty(s.byPath["a.ts"])).toBe(true);
    s = docsReducer(s, { type: "save-start", path: "a.ts" });
    s = docsReducer(s, { type: "save-ok", path: "a.ts", contents: "edited" });
    const e = s.byPath["a.ts"];
    expect(e.savedDoc).toBe("edited");
    expect(isDirty(e)).toBe(false);
    expect(e.save).toEqual({ kind: "saved", path: "a.ts" });
  });

  it("save-fail records the error and leaves the doc dirty", () => {
    let s = open(initialDocsState, "a.ts");
    s = docsReducer(s, { type: "load-ok", path: "a.ts", contents: "orig" });
    s = docsReducer(s, { type: "set-doc", path: "a.ts", doc: "edited" });
    s = docsReducer(s, { type: "save-start", path: "a.ts" });
    s = docsReducer(s, {
      type: "save-fail",
      path: "a.ts",
      message: "disk full",
    });
    expect(isDirty(s.byPath["a.ts"])).toBe(true);
    expect(s.byPath["a.ts"].save).toEqual({
      kind: "error",
      path: "a.ts",
      message: "disk full",
    });
  });
});

describe("set-override + set-marker", () => {
  it("records a language override and no-ops when unchanged", () => {
    let s = open(initialDocsState, "a.ts");
    s = docsReducer(s, { type: "set-override", path: "a.ts", id: "rust" });
    expect(s.byPath["a.ts"].languageOverrideId).toBe("rust");
    expect(
      docsReducer(s, { type: "set-override", path: "a.ts", id: "rust" }),
    ).toBe(s);
  });

  it("records the disk marker", () => {
    let s = open(initialDocsState, "a.ts");
    s = docsReducer(s, {
      type: "set-marker",
      path: "a.ts",
      marker: { mtime_ms: 123, size: 7 },
    });
    expect(s.byPath["a.ts"].marker).toEqual({ mtime_ms: 123, size: 7 });
  });
});

describe("isDirty", () => {
  it("is false for undefined / clean and true after an edit", () => {
    expect(isDirty(undefined)).toBe(false);
    let s = open(initialDocsState, "a.ts");
    s = docsReducer(s, { type: "load-ok", path: "a.ts", contents: "x" });
    expect(isDirty(s.byPath["a.ts"])).toBe(false);
    s = docsReducer(s, { type: "set-doc", path: "a.ts", doc: "y" });
    expect(isDirty(s.byPath["a.ts"])).toBe(true);
  });
});
