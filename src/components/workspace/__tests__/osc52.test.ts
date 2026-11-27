import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("the clipboard cap is one value on both sides of the IPC", () => {
  // The frontend drops an oversize copy before it reaches Rust, and Rust refuses one too; the
  // two constants are kept equal by hand, so this reads the Rust source and compares.
  it("osc52.ts's MAX_CLIPBOARD_BYTES equals clipboard.rs's", () => {
    const rs = readFileSync(
      join(__dirname, "../../../../src-tauri/src/clipboard.rs"),
      "utf8",
    );
    const m = rs.match(/pub const MAX_CLIPBOARD_BYTES: usize = ([0-9_ *]+);/);
    expect(
      m,
      "clipboard.rs must declare MAX_CLIPBOARD_BYTES as a product of integers",
    ).not.toBeNull();
    const rustValue = (m as RegExpMatchArray)[1]
      .split("*")
      .map((f) => Number(f.replace(/_/g, "").trim()))
      .reduce((a, b) => a * b, 1);
    expect(rustValue).toBe(MAX_CLIPBOARD_BYTES);
  });
});
