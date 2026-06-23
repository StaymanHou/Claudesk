import { describe, it, expect, beforeEach } from "vitest";
import {
  registerTerminalSerializer,
  unregisterTerminalSerializer,
  serializeTerminal,
  __resetTerminalMirrorRegistry,
} from "../terminalMirror";

beforeEach(() => __resetTerminalMirrorRegistry());

describe("terminalMirror registry", () => {
  it("returns null for an unregistered workspace id", () => {
    expect(serializeTerminal("ws-1")).toBeNull();
  });

  it("returns the serializer's output once registered", () => {
    registerTerminalSerializer("ws-1", () => "<span>hello</span>");
    expect(serializeTerminal("ws-1")).toBe("<span>hello</span>");
  });

  it("returns null after unregister (idempotent)", () => {
    registerTerminalSerializer("ws-1", () => "x");
    unregisterTerminalSerializer("ws-1");
    expect(serializeTerminal("ws-1")).toBeNull();
    // unregistering again is a harmless no-op
    expect(() => unregisterTerminalSerializer("ws-1")).not.toThrow();
  });

  it("keys serializers independently per workspace", () => {
    registerTerminalSerializer("ws-1", () => "one");
    registerTerminalSerializer("ws-2", () => "two");
    expect(serializeTerminal("ws-1")).toBe("one");
    expect(serializeTerminal("ws-2")).toBe("two");
  });

  it("coerces a throwing serializer to null (one bad pane can't break the ticker)", () => {
    registerTerminalSerializer("ws-1", () => {
      throw new Error("xterm gone");
    });
    expect(serializeTerminal("ws-1")).toBeNull();
  });

  it("re-registering replaces the prior serializer", () => {
    registerTerminalSerializer("ws-1", () => "old");
    registerTerminalSerializer("ws-1", () => "new");
    expect(serializeTerminal("ws-1")).toBe("new");
  });
});
