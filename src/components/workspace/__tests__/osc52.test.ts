import { describe, expect, it, vi } from "vitest";
import {
  MAX_CLIPBOARD_BYTES,
  osc52Handler,
  osc52Text,
  registerOsc52,
} from "../osc52";

// M18 WP2.5 — the OSC 52 parser, against the shapes the probe measured on tmux 3.8.

/** base64 of the UTF-8 bytes of `s` (what tmux and `printf … | base64` send). */
function b64(s: string): string {
  let bin = "";
  for (const byte of new TextEncoder().encode(s))
    bin += String.fromCharCode(byte);
  return btoa(bin);
}

describe("osc52Text", () => {
  it("decodes tmux's own copy form, an EMPTY Pc (`52;;<b64>`, measured)", () => {
    expect(osc52Text(";UFJPQkUtVEVYVC0xMjM=")).toBe("PROBE-TEXT-123");
  });

  it("decodes an app's `c` form, multi-byte UTF-8 and newlines intact", () => {
    const text = "héllo ✓ — 中文\nline2";
    expect(osc52Text(`c;${b64(text)}`)).toBe(text);
  });

  it("never treats a READ query as a write", () => {
    expect(osc52Text("c;?")).toBeNull();
    expect(osc52Text(";?")).toBeNull();
  });

  it("ignores an empty Pd, a missing separator and malformed base64", () => {
    expect(osc52Text("c;")).toBeNull();
    expect(osc52Text("cAAAA")).toBeNull();
    expect(osc52Text("c;@@not-base64@@")).toBeNull();
  });

  it("accepts a copy at the cap and refuses one past it", () => {
    const atCap = "a".repeat(MAX_CLIPBOARD_BYTES);
    expect(osc52Text(`c;${btoa(atCap)}`)?.length).toBe(MAX_CLIPBOARD_BYTES);
    expect(osc52Text(`c;${btoa(atCap + "a")}`)).toBeNull();
  });
});

describe("osc52Handler", () => {
  it("writes once per copy, and always reports the sequence as consumed", () => {
    const sink = vi.fn();
    const handle = osc52Handler(sink);
    expect(handle(`c;${b64("one")}`)).toBe(true);
    expect(handle("c;?")).toBe(true);
    expect(handle("c;@@bad@@")).toBe(true);
    expect(sink.mock.calls).toEqual([["one"]]);
  });

  it("registers on OSC 52 and nothing else", () => {
    const calls: number[] = [];
    const term = {
      parser: {
        registerOscHandler(ident: number) {
          calls.push(ident);
          return { dispose() {} };
        },
      },
    };
    registerOsc52(term, () => {});
    expect(calls).toEqual([52]);
  });
});
