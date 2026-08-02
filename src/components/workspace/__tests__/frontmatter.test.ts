import { describe, expect, it } from "vitest";
import { stripFrontmatter } from "../docs/frontmatter";

// M11 WP3 — the 6 frontmatter edge cases WP1 validated against real docs, pinned.
//
// These are not hypotheticals: each one is a shape that occurs in this repo's own corpus,
// and the reason the split is a pre-render regex rather than a remark plugin. The two
// worth reading before editing the pattern are "leading thematic break" and "later `---`
// in the body" — both are cases where a looser matcher silently eats document content.

describe("stripFrontmatter — the happy path", () => {
  it("splits a leading YAML block off, fences excluded", () => {
    const src =
      "---\nshape: runtime-registry\nupdated: 2026-08-02\n---\n# Title\n\nBody.\n";
    const { frontmatter, body } = stripFrontmatter(src);
    expect(frontmatter).toBe("shape: runtime-registry\nupdated: 2026-08-02");
    expect(body).toBe("# Title\n\nBody.\n");
  });

  it("leaves the body's own leading content intact when the block is followed by prose", () => {
    const { body } = stripFrontmatter("---\na: 1\n---\nimmediately prose\n");
    expect(body).toBe("immediately prose\n");
  });
});

describe("stripFrontmatter — the cases that pin the pattern", () => {
  it("returns the input unchanged when there is NO frontmatter", () => {
    const src = "# Just a heading\n\nSome prose.\n";
    expect(stripFrontmatter(src)).toEqual({ frontmatter: null, body: src });
  });

  it("does NOT treat a leading THEMATIC BREAK as frontmatter", () => {
    // `---` followed by a blank line is a horizontal rule, not an opening fence. A
    // matcher that accepted it would swallow the document down to the next `---`.
    const src = "---\n\nProse after a rule.\n\n---\n\nMore prose.\n";
    expect(stripFrontmatter(src).frontmatter).toBeNull();
    expect(stripFrontmatter(src).body).toBe(src);
  });

  it("leaves a LATER `---` in the body untouched", () => {
    const src = "# Title\n\nSome prose.\n\n---\n\nA section after a rule.\n";
    const { frontmatter, body } = stripFrontmatter(src);
    expect(frontmatter).toBeNull();
    expect(body).toBe(src);
    // The rule survives into the body, so the renderer still draws it.
    expect(body).toContain("\n---\n");
  });

  it("keeps only the FIRST block when the body also contains `---` rules", () => {
    const src = "---\na: 1\n---\n# Title\n\n---\n\nAfter a rule.\n";
    const { frontmatter, body } = stripFrontmatter(src);
    expect(frontmatter).toBe("a: 1");
    // The body's own rule is NOT consumed — non-greedy matching stopped at the first fence.
    expect(body).toBe("# Title\n\n---\n\nAfter a rule.\n");
  });

  it("matches a CRLF file", () => {
    const src =
      "---\r\nshape: wip\r\ndrive_mode: autopilot\r\n---\r\n# Title\r\n";
    const { frontmatter, body } = stripFrontmatter(src);
    expect(frontmatter).toBe("shape: wip\r\ndrive_mode: autopilot");
    expect(body).toBe("# Title\r\n");
  });
});

describe("stripFrontmatter — the recorded boundary", () => {
  it("does NOT match an EMPTY `---\\n---` block (documented, 0 of 54 real docs)", () => {
    // Asserting the KNOWN limitation rather than the desired behavior, so that if someone
    // later widens the pattern to handle it, this test fails and forces the boundary note
    // in frontmatter.ts to be updated with it. A silent behavior change here would leave
    // the module's own comment lying.
    const src = "---\n---\n# Title\n";
    expect(stripFrontmatter(src).frontmatter).toBeNull();
  });
});
