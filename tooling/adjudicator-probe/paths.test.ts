import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { wipOrArchive } from "./paths";

describe("wipOrArchive", () => {
  let root: string;
  const state = (dir: "wip" | "archive") =>
    join(root, "workflow-system", "state", dir);
  const put = (dir: "wip" | "archive", name: string) => {
    mkdirSync(state(dir), { recursive: true });
    writeFileSync(join(state(dir), name), dir);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wip-or-archive-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("finds an open item in wip/", () => {
    put("wip", "a.md");
    expect(wipOrArchive("a.md", root)).toBe(join(state("wip"), "a.md"));
  });

  it("finds a finalized item in archive/", () => {
    put("archive", "a.md");
    expect(wipOrArchive("a.md", root)).toBe(join(state("archive"), "a.md"));
  });

  it("prefers wip/ when both exist", () => {
    put("wip", "a.md");
    put("archive", "a.md");
    expect(wipOrArchive("a.md", root)).toBe(join(state("wip"), "a.md"));
  });

  it("throws, naming both places, when the item is in neither", () => {
    put("wip", "other.md");
    expect(() => wipOrArchive("a.md", root)).toThrow(
      /a\.md is in neither .*wip.*a\.md nor .*archive.*a\.md/,
    );
  });
});
