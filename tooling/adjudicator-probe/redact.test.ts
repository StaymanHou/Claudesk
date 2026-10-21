import { describe, expect, it } from "vitest";
import type { Candidate } from "./corpus";
import { keyOf, redact, redactionViolations } from "./redact";

const candidate = (over: Partial<Candidate>): Candidate => ({
  project: "-Users-stayman-Work-Kenosis-ops-data-hub",
  projectClass: "work",
  session: "abcdef12-0000",
  turnIndex: 7,
  turnStart: 3,
  edgeId: "F8",
  skill: "feature-verify-auto",
  tail: "client data that must never be committed. TRANSITION: F8",
  ts: "2026-10-01T00:00:00.000Z",
  nextText: "continue",
  nextKind: "prod-text",
  supervisorFired: false,
  truth: "BREAK",
  truthBasis: "prod-text",
  ...over,
});

describe("redact", () => {
  it("drops every text field from a non-claudesk record", () => {
    const r = redact(candidate({}), undefined);
    expect(r).not.toHaveProperty("tail");
    expect(r).not.toHaveProperty("nextText");
    expect(r.key).toMatch(/^h:[0-9a-f]{16}$/);
    expect(JSON.stringify(r)).not.toContain("abcdef12");
    expect(redactionViolations([r], ["Kenosis", "ops-data-hub"])).toEqual([]);
  });

  it("keeps a claudesk record's tail and a readable key", () => {
    const c = candidate({
      project: "-Users-stayman-Personal-projects-claudesk",
      projectClass: "claudesk",
    });
    const r = redact(c, "BREAK");
    expect(r.tail).toBe(c.tail);
    expect(r.key).toBe(keyOf(c));
    expect(r.key).toBe("abcdef12-0000:7");
    expect(r.m15Truth).toBe("BREAK");
  });

  // Positive controls: the check must FIRE on a record that leaks, or a clean result means nothing.
  it("flags a long string on a non-claudesk record, whatever the field is called", () => {
    const leaked = {
      ...redact(candidate({}), undefined),
      note: "x".repeat(65),
    };
    expect(redactionViolations([leaked], [])).toEqual([
      "records[0].note: 65 chars",
    ]);
  });

  it("flags a project name anywhere in a non-claudesk record but not in a claudesk tail", () => {
    const work = { ...redact(candidate({}), undefined), edgeId: "Kenosis" };
    expect(redactionViolations([work], ["Kenosis"])).toEqual([
      'forbidden token "Kenosis" present',
    ]);
    const claudesk = redact(
      candidate({ projectClass: "claudesk", tail: "see Kenosis" }),
      undefined,
    );
    expect(redactionViolations([claudesk], ["Kenosis"])).toEqual([]);
  });
});
