import { describe, expect, it } from "vitest";
import {
  MAX_TERMINALS,
  canOpenTerminal,
  closeTerminal,
  initialTerminalList,
  isLastTerminal,
  openTerminal,
  switchTerminal,
  terminalSessionId,
  type TerminalListState,
} from "../terminalList";

const WS = "ws-abc";

describe("terminalSessionId / initialTerminalList", () => {
  it("formats the session id as `${workspaceId}-term-<n>`", () => {
    expect(terminalSessionId(WS, 0)).toBe("ws-abc-term-0");
    expect(terminalSessionId(WS, 7)).toBe("ws-abc-term-7");
  });

  it("seeds a fresh workspace with exactly one terminal (-term-0), active", () => {
    const s = initialTerminalList(WS);
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]).toEqual({
      id: "ws-abc-term-0",
      sessionId: "ws-abc-term-0",
    });
    expect(s.activeId).toBe("ws-abc-term-0");
    expect(s.counter).toBe(1); // next suffix to assign
  });

  it("the seed session id is collision-free with the CC session id (no -term- suffix)", () => {
    // The CC pane keys on the bare workspaceId; a terminal id always carries -term-.
    expect(
      initialTerminalList(WS).entries[0].sessionId.startsWith(`${WS}-term-`),
    ).toBe(true);
    expect(`${WS}-term-0`).not.toBe(WS);
  });
});

describe("openTerminal", () => {
  it("appends a new terminal, makes it active, and bumps the counter", () => {
    const s1 = initialTerminalList(WS);
    const s2 = openTerminal(s1, WS);
    expect(s2.entries).toHaveLength(2);
    expect(s2.entries[1]).toEqual({
      id: "ws-abc-term-1",
      sessionId: "ws-abc-term-1",
    });
    expect(s2.activeId).toBe("ws-abc-term-1"); // the new one is front
    expect(s2.counter).toBe(2);
  });

  it("assigns monotonic, unique session ids across many opens", () => {
    let s = initialTerminalList(WS);
    for (let i = 0; i < 3; i++) s = openTerminal(s, WS);
    const ids = s.entries.map((e) => e.sessionId);
    expect(ids).toEqual([
      "ws-abc-term-0",
      "ws-abc-term-1",
      "ws-abc-term-2",
      "ws-abc-term-3",
    ]);
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });

  it("is a NO-OP at the soft cap (MAX_TERMINALS) — returns the same state reference", () => {
    let s = initialTerminalList(WS);
    while (s.entries.length < MAX_TERMINALS) s = openTerminal(s, WS);
    expect(s.entries).toHaveLength(MAX_TERMINALS);
    const blocked = openTerminal(s, WS);
    expect(blocked).toBe(s); // same ref → no change, no spurious render
    expect(blocked.entries).toHaveLength(MAX_TERMINALS);
  });

  it("never reuses a session id even after a close (counter is monotonic)", () => {
    const s1 = initialTerminalList(WS); // [term-0]
    const s2 = openTerminal(s1, WS); // [term-0, term-1], active term-1
    const s3 = closeTerminal(s2, "ws-abc-term-1"); // back to [term-0]
    const s4 = openTerminal(s3, WS); // the next is term-2, NOT a reused term-1
    expect(s4.entries.map((e) => e.id)).toEqual([
      "ws-abc-term-0",
      "ws-abc-term-2",
    ]);
  });
});

describe("closeTerminal", () => {
  const three = (): TerminalListState => {
    let s = initialTerminalList(WS); // term-0
    s = openTerminal(s, WS); // term-1
    s = openTerminal(s, WS); // term-2 (active)
    return s;
  };

  it("removes the terminal by id", () => {
    const s = closeTerminal(three(), "ws-abc-term-1");
    expect(s.entries.map((e) => e.id)).toEqual([
      "ws-abc-term-0",
      "ws-abc-term-2",
    ]);
  });

  it("reactivates the LEFT neighbour when the active terminal is closed", () => {
    const s = three(); // active = term-2
    const closed = closeTerminal(s, "ws-abc-term-2");
    expect(closed.activeId).toBe("ws-abc-term-1"); // left neighbour
  });

  it("reactivates the new FIRST entry when the first (active) terminal is closed", () => {
    let s = three();
    s = switchTerminal(s, "ws-abc-term-0"); // make the first active
    const closed = closeTerminal(s, "ws-abc-term-0");
    expect(closed.entries[0].id).toBe("ws-abc-term-1");
    expect(closed.activeId).toBe("ws-abc-term-1"); // clamp to new first
  });

  it("leaves activeId unchanged when a NON-active terminal is closed", () => {
    const s = three(); // active = term-2
    const closed = closeTerminal(s, "ws-abc-term-0");
    expect(closed.activeId).toBe("ws-abc-term-2");
  });

  it("DISALLOWS closing the last terminal — no-op (same state ref)", () => {
    const s = initialTerminalList(WS);
    const blocked = closeTerminal(s, "ws-abc-term-0");
    expect(blocked).toBe(s);
    expect(blocked.entries).toHaveLength(1);
  });

  it("is a no-op for an unknown id", () => {
    const s = three();
    expect(closeTerminal(s, "nope")).toBe(s);
  });
});

describe("switchTerminal", () => {
  it("sets the active id to an existing terminal", () => {
    let s = initialTerminalList(WS);
    s = openTerminal(s, WS); // active term-1
    const switched = switchTerminal(s, "ws-abc-term-0");
    expect(switched.activeId).toBe("ws-abc-term-0");
    expect(switched.entries).toBe(s.entries); // entries untouched
  });

  it("is a no-op for an unknown id", () => {
    const s = initialTerminalList(WS);
    expect(switchTerminal(s, "nope")).toBe(s);
  });
});

describe("isLastTerminal / canOpenTerminal predicates (UI affordance gates)", () => {
  it("isLastTerminal is true only with one terminal", () => {
    let s = initialTerminalList(WS);
    expect(isLastTerminal(s)).toBe(true); // no ✕ on the sole tab
    s = openTerminal(s, WS);
    expect(isLastTerminal(s)).toBe(false);
  });

  it("canOpenTerminal is true below the cap, false at it", () => {
    let s = initialTerminalList(WS);
    expect(canOpenTerminal(s)).toBe(true);
    while (s.entries.length < MAX_TERMINALS) s = openTerminal(s, WS);
    expect(canOpenTerminal(s)).toBe(false); // ＋ disabled at the cap
  });
});
