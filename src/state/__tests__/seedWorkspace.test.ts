import { describe, it, expect } from "vitest";
import { parseSeedParam, SEED_PARAM } from "../seedWorkspace";

describe("parseSeedParam — dev-only ?ws= seed seam parser", () => {
  it("returns the path when ?ws= is present", () => {
    expect(parseSeedParam("?ws=/Users/me/projects/claudesk")).toBe(
      "/Users/me/projects/claudesk",
    );
  });

  it("works without the leading ? (raw query)", () => {
    expect(parseSeedParam("ws=/a/b")).toBe("/a/b");
  });

  it("returns null when ?ws= is absent", () => {
    expect(parseSeedParam("?other=1")).toBeNull();
    expect(parseSeedParam("")).toBeNull();
  });

  it("returns null for an empty value (?ws=)", () => {
    expect(parseSeedParam("?ws=")).toBeNull();
  });

  it("returns null for a whitespace-only value, and trims a real value", () => {
    expect(parseSeedParam("?ws=%20%20")).toBeNull(); // "  " url-encoded
    expect(parseSeedParam("?ws=%20/a/b%20")).toBe("/a/b"); // trims surrounding ws
  });

  it("decodes a url-encoded path with spaces", () => {
    expect(parseSeedParam("?ws=/Users/me/My%20Project")).toBe(
      "/Users/me/My Project",
    );
  });

  it("reads only the SEED_PARAM key, ignoring others", () => {
    expect(parseSeedParam(`?foo=x&${SEED_PARAM}=/p&bar=y`)).toBe("/p");
  });
});
