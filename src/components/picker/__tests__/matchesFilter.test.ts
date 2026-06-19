// WP6 P2.4 — unit coverage for the picker's pure filter predicate.
// DOM/interaction behavior is verified live (Playwright in verify-self) per the
// WP5 frontend test posture; only the pure logic is unit-tested here.

import { describe, it, expect } from "vitest";
import { matchesFilter, type RecentProject } from "../ProjectPicker";

const proj = (project_path: string, display_name?: string): RecentProject => ({
  project_path,
  display_name,
});

describe("matchesFilter", () => {
  it("empty query matches everything", () => {
    expect(matchesFilter(proj("/x/repo", "repo"), "")).toBe(true);
    expect(matchesFilter(proj("/x/repo", "repo"), "   ")).toBe(true);
  });

  it("matches on display name, case-insensitively", () => {
    const p = proj("/Users/me/Projects/API-Gateway", "API-Gateway");
    expect(matchesFilter(p, "api")).toBe(true);
    expect(matchesFilter(p, "GATEWAY")).toBe(true);
  });

  it("matches on path when the name does not match", () => {
    const p = proj("/Users/me/Projects/data-pipeline", "data-pipeline");
    expect(matchesFilter(p, "Users")).toBe(true);
    expect(matchesFilter(p, "projects")).toBe(true);
  });

  it("returns false when neither name nor path contains the query", () => {
    const p = proj("/Users/me/Projects/data-pipeline", "data-pipeline");
    expect(matchesFilter(p, "zzz")).toBe(false);
  });

  it("falls back to path-only matching when display_name is absent", () => {
    const p = proj("/Users/me/Projects/headless");
    expect(matchesFilter(p, "headless")).toBe(true);
    expect(matchesFilter(p, "nope")).toBe(false);
  });

  it("trims surrounding whitespace in the query", () => {
    const p = proj("/x/repo", "repo");
    expect(matchesFilter(p, "  repo  ")).toBe(true);
  });
});
