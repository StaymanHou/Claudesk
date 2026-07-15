import { describe, expect, it } from "vitest";
import { resolveSelectedSeg, sessionBreakdown } from "../sidePanelMath";
import type {
  RangePayload,
  SegKind,
  SessionPayload,
} from "../../../../state/timeAnalytics";

// `dur_ms` defaults to the minute-span in ms; pass an explicit `durMs` to model a
// sub-minute segment whose TRUE duration differs from its quantized `end - start`.
function seg(kind: SegKind, start: number, end: number, durMs?: number) {
  return { kind, start, end, dur_ms: durMs ?? (end - start) * 60_000 };
}

function session(
  id: string,
  segs: ReturnType<typeof seg>[],
  extra: Partial<SessionPayload> = {},
): SessionPayload {
  return {
    id,
    start: segs.length ? segs[0].start : 0,
    end: segs.length ? segs[segs.length - 1].end : 0,
    prompts: 0,
    tools: {},
    segs,
    ...extra,
  };
}

const DATA: RangePayload = {
  label: "WED · MAY 13",
  meta: { start: "2026-05-13", end: "2026-05-13", day_count: 1 },
  hour_range_by_day: { "2026-05-13": [9, 12] },
  day_window: [540, 720],
  iso: "2026-05-13",
  hour_range: [9, 12],
  projects: [
    {
      id: "proj-a",
      alias: "proj-a",
      path: "/repo/proj-a",
      sessions: [
        session("s1", [seg("ai-doing", 540, 550), seg("away", 550, 580)]),
        // A session id containing a colon (future-proofing the last-colon split).
        session("cc:99", [seg("typing", 600, 610)]),
      ],
    },
    {
      id: "proj-b",
      alias: "proj-b",
      path: "/repo/proj-b",
      sessions: [session("s2", [seg("reviewing", 620, 640)])],
    },
  ],
};

describe("resolveSelectedSeg", () => {
  it("resolves a valid `<sessionId>:<segIndex>` to its project/session/segIndex", () => {
    const r = resolveSelectedSeg("s1:0", DATA);
    expect(r).not.toBeNull();
    expect(r!.project.id).toBe("proj-a");
    expect(r!.session.id).toBe("s1");
    expect(r!.segIndex).toBe(0);
  });

  it("resolves the second seg index within a session", () => {
    const r = resolveSelectedSeg("s1:1", DATA);
    expect(r!.session.id).toBe("s1");
    expect(r!.segIndex).toBe(1);
    expect(r!.session.segs[r!.segIndex].kind).toBe("away");
  });

  it("finds a session in a later project", () => {
    const r = resolveSelectedSeg("s2:0", DATA);
    expect(r!.project.id).toBe("proj-b");
    expect(r!.session.id).toBe("s2");
  });

  it("splits on the LAST colon so a session id may contain colons", () => {
    const r = resolveSelectedSeg("cc:99:0", DATA);
    expect(r).not.toBeNull();
    expect(r!.session.id).toBe("cc:99");
    expect(r!.segIndex).toBe(0);
  });

  it("returns null for a null/empty id or null data", () => {
    expect(resolveSelectedSeg(null, DATA)).toBeNull();
    expect(resolveSelectedSeg(undefined, DATA)).toBeNull();
    expect(resolveSelectedSeg("", DATA)).toBeNull();
    expect(resolveSelectedSeg("s1:0", null)).toBeNull();
  });

  it("returns null when the id has no colon separator", () => {
    expect(resolveSelectedSeg("s1", DATA)).toBeNull();
  });

  it("returns null when the seg-index half is missing or non-numeric", () => {
    expect(resolveSelectedSeg("s1:", DATA)).toBeNull();
    expect(resolveSelectedSeg("s1:x", DATA)).toBeNull();
    expect(resolveSelectedSeg("s1:-1", DATA)).toBeNull();
  });

  it("returns null when the session id is absent from the payload (stale selection)", () => {
    expect(resolveSelectedSeg("ghost:0", DATA)).toBeNull();
  });

  it("returns null when the seg index is out of range for the session", () => {
    expect(resolveSelectedSeg("s1:2", DATA)).toBeNull(); // s1 has 2 segs (0,1)
    expect(resolveSelectedSeg("s2:5", DATA)).toBeNull();
  });
});

describe("sessionBreakdown", () => {
  it("returns one row per non-zero kind, in ALL_KINDS order (AI family first)", () => {
    const s = session("x", [
      seg("ai-doing", 0, 10), // 10
      seg("reviewing", 10, 25), // 15
      seg("away", 25, 55), // 30 (human family, but a real kind)
    ]);
    const rows = sessionBreakdown(s);
    expect(rows.map((r) => r.kind)).toEqual(["ai-doing", "reviewing", "away"]);
    expect(rows.map((r) => r.minutes)).toEqual([10, 15, 30]);
  });

  it("filters out zero-minute kinds", () => {
    const s = session("x", [seg("typing", 0, 5)]);
    const rows = sessionBreakdown(s);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("typing");
  });

  it("returns an empty array when the session has no segments", () => {
    expect(sessionBreakdown(session("x", []))).toEqual([]);
  });

  it("sums TRUE dur_ms (sub-minute AI work accrues, not floored to zero)", () => {
    // Three ~1s ai-doing segments each quantized to a same-minute zero-width span, but
    // dur_ms carries the real ~1s each — round-half-up over the 3s TOTAL gives 0m here,
    // but 40 such segments (40s) would round to 1m. Prove the SUM path, not end - start.
    const s = session("x", [
      seg("ai-doing", 100, 100, 25_000),
      seg("ai-doing", 100, 100, 25_000),
      seg("ai-doing", 100, 100, 25_000),
    ]);
    const rows = sessionBreakdown(s);
    // 75_000ms total → round((75000+30000)/60000 floor) = 1m (would be 0 via end - start).
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("ai-doing");
    expect(rows[0].minutes).toBe(1);
  });

  it("attaches the kind's color + label to each row", () => {
    const s = session("x", [seg("subagent", 0, 3)]);
    const rows = sessionBreakdown(s);
    expect(rows[0].label).toBe("Subagent");
    expect(rows[0].color).toMatch(/^oklch\(/);
  });
});
