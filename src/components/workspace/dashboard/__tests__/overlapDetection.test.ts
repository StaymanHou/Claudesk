import { describe, expect, it } from "vitest";
import { detectSessionOverlaps } from "../DayTimeline";
import type { ProjectPayload, SessionPayload } from "../../../../state/timeAnalytics";

// A session is only its [start,end] window for overlap purposes; segs/tools are
// irrelevant to detectSessionOverlaps, so the fixtures keep them minimal.
function session(id: string, start: number, end: number): SessionPayload {
  return { id, start, end, prompts: 0, tools: {}, segs: [] };
}

function project(
  id: string,
  sessions: SessionPayload[],
): ProjectPayload {
  return { id, alias: id, path: `/repo/${id}`, sessions };
}

describe("detectSessionOverlaps — SAME-PROJECT concurrency only", () => {
  // Operator definition (2026-07-08, SURFACE-…-OVERLAP-MUST-BE-SAME-PROJECT-ONLY):
  // an "overlap" is two concurrent sessions IN THE SAME PROJECT. Cross-project
  // concurrency is NOT an overlap and must contribute nothing.

  it("detects two same-project sessions whose windows intersect", () => {
    const projects = [
      project("proj-a", [
        session("a1", 540, 600), // 09:00–10:00
        session("a2", 570, 630), // 09:30–10:30  (overlaps a1 by 570–600)
      ]),
    ];
    const ov = detectSessionOverlaps(projects);
    expect(ov["a1"]).toBeDefined();
    expect(ov["a2"]).toBeDefined();
    // Each names the other as its sole peer over the intersected window.
    expect(ov["a1"].peers.map((p) => p.id)).toEqual(["a2"]);
    expect(ov["a2"].peers.map((p) => p.id)).toEqual(["a1"]);
    expect(ov["a1"].peers[0]).toMatchObject({
      overlapStartMin: 570,
      overlapEndMin: 600,
    });
    expect(ov["a1"].overlapMs).toBe(30 * 60 * 1000);
  });

  it("does NOT treat two DIFFERENT-project sessions with intersecting windows as an overlap", () => {
    // The exact case the operator caught: a long-lived session in one project
    // running concurrently with a session in another project. Cross-project ≠ overlap.
    const projects = [
      project("claudesk", [session("agent", 540, 720)]), // 09:00–12:00
      project("scratch-b", [session("scratch", 600, 660)]), // 10:00–11:00 (inside agent's window)
    ];
    const ov = detectSessionOverlaps(projects);
    expect(ov).toEqual({}); // no overlaps whatsoever
    expect(ov["agent"]).toBeUndefined();
    expect(ov["scratch"]).toBeUndefined();
  });

  it("does NOT flag same-project sessions that run sequentially (touching but not intersecting)", () => {
    const projects = [
      project("proj-a", [
        session("a1", 540, 600), // ends exactly when a2 starts
        session("a2", 600, 660), // strict intersection required → no overlap
      ]),
    ];
    const ov = detectSessionOverlaps(projects);
    expect(ov).toEqual({});
  });

  it("scopes overlaps per project — same-project pair detected, cross-project pair ignored, in one dataset", () => {
    const projects = [
      project("proj-a", [
        session("a1", 540, 600),
        session("a2", 570, 630), // overlaps a1 (same project) → detected
      ]),
      project("proj-b", [
        session("b1", 545, 605), // intersects a1/a2 in wall-clock, but different project → ignored
      ]),
    ];
    const ov = detectSessionOverlaps(projects);
    // a1/a2 detected as each other's peers…
    expect(ov["a1"].peers.map((p) => p.id)).toEqual(["a2"]);
    expect(ov["a2"].peers.map((p) => p.id)).toEqual(["a1"]);
    // …b1 never appears, and no proj-a session lists b1 as a peer.
    expect(ov["b1"]).toBeUndefined();
    expect(ov["a1"].peers.some((p) => p.id === "b1")).toBe(false);
    expect(ov["a2"].peers.some((p) => p.id === "b1")).toBe(false);
  });

  it("handles three concurrent same-project sessions (each pair a peer)", () => {
    const projects = [
      project("proj-a", [
        session("a1", 540, 660),
        session("a2", 560, 640),
        session("a3", 580, 620),
      ]),
    ];
    const ov = detectSessionOverlaps(projects);
    expect(ov["a1"].peers.map((p) => p.id).sort()).toEqual(["a2", "a3"]);
    expect(ov["a2"].peers.map((p) => p.id).sort()).toEqual(["a1", "a3"]);
    expect(ov["a3"].peers.map((p) => p.id).sort()).toEqual(["a1", "a2"]);
  });
});
