import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COPY_TOO_LARGE_NOTICE,
  MAX_CLIPBOARD_BYTES,
  osc52Decode,
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

// paydown-2026-11-27 WP8 — a refused copy is told; "nothing to copy" is not.
describe("osc52Decode", () => {
  const atCap = "a".repeat(MAX_CLIPBOARD_BYTES);
  it("past the cap is `too-large`, on BOTH checks (payload length, decoded length)", () => {
    // The decoded-length check: this payload is no longer than the longest allowed one.
    expect(osc52Decode(`c;${btoa(atCap + "a")}`)).toEqual({
      kind: "too-large",
    });
    // The payload-length check, before any decode.
    const long = "A".repeat(Math.ceil(MAX_CLIPBOARD_BYTES / 3) * 4 + 4);
    expect(osc52Decode(`c;${long}`)).toEqual({ kind: "too-large" });
  });
  it("a read query, an empty Pd and malformed base64 are nothing (null), not refusals", () => {
    for (const d of ["c;?", "c;", "cAAAA", "c;@@not-base64@@"])
      expect(osc52Decode(d), d).toBeNull();
  });
});

describe("osc52Handler", () => {
  it("a too-large copy is told to onFailure and never reaches the clipboard sink", () => {
    const sink = vi.fn();
    const fail = vi.fn();
    const handle = osc52Handler(sink, fail);
    const atCap = "a".repeat(MAX_CLIPBOARD_BYTES);
    expect(handle(`c;${btoa(atCap + "a")}`)).toBe(true);
    expect(sink).not.toHaveBeenCalled();
    expect(fail.mock.calls).toEqual([[COPY_TOO_LARGE_NOTICE]]);
    // A read query and a malformed payload tell nobody.
    handle("c;?");
    handle("c;@@bad@@");
    expect(fail).toHaveBeenCalledTimes(1);
    expect(sink).not.toHaveBeenCalled();
  });

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
