import { describe, it, expect } from "vitest";
import { proposeNewFilePath, collides } from "../newFilePath";

// QoL-WP5 — the pure new-file path composition + collision guard.

describe("proposeNewFilePath", () => {
  it("joins a name to the workspace root (null dir)", () => {
    const r = proposeNewFilePath(null, "notes.md");
    expect(r).toEqual({ ok: true, path: "notes.md" });
  });

  it("joins a name to an existing project-relative dir", () => {
    const r = proposeNewFilePath("src/components", "Foo.tsx");
    expect(r).toEqual({ ok: true, path: "src/components/Foo.tsx" });
  });

  it("trims surrounding whitespace from the name", () => {
    const r = proposeNewFilePath("", "  a.ts  ");
    expect(r).toEqual({ ok: true, path: "a.ts" });
  });

  it("strips a trailing slash from the dir before joining", () => {
    expect(proposeNewFilePath("src/", "a.ts")).toEqual({
      ok: true,
      path: "src/a.ts",
    });
  });

  it("rejects an empty / whitespace-only name", () => {
    expect(proposeNewFilePath(null, "").ok).toBe(false);
    expect(proposeNewFilePath(null, "   ").ok).toBe(false);
  });

  it("rejects a name containing a path separator (v1 — no nested-dir create)", () => {
    expect(proposeNewFilePath(null, "sub/a.ts").ok).toBe(false);
    expect(proposeNewFilePath(null, "sub\\a.ts").ok).toBe(false);
  });

  it("rejects '.' and '..'", () => {
    expect(proposeNewFilePath(null, ".").ok).toBe(false);
    expect(proposeNewFilePath(null, "..").ok).toBe(false);
  });

  it("rejects an absolute-looking name", () => {
    expect(proposeNewFilePath(null, "/etc/passwd").ok).toBe(false);
    expect(proposeNewFilePath(null, "~/secret").ok).toBe(false);
  });
});

describe("collides", () => {
  const existing = ["a.ts", "src/main.rs", "README.md"];

  it("reports a collision for an exact existing path", () => {
    expect(collides("src/main.rs", existing)).toBe(true);
  });

  it("does NOT collide for a fresh path", () => {
    expect(collides("src/new.rs", existing)).toBe(false);
  });

  it("is exact-match (a prefix is not a collision)", () => {
    expect(collides("src", existing)).toBe(false);
    expect(collides("a.ts.bak", existing)).toBe(false);
  });
});
