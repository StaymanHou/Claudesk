import { describe, expect, it } from "vitest";

import {
  DICTATED_CLOSE,
  DICTATED_OPEN,
  PASTE_END,
  PASTE_START,
  stagedPayload,
} from "../stagedPayload";
import { slashCommandPayload } from "../autoResumeFire";

// F-a WP2 Phase 1 — the staged (multi-line) payload, pinned BYTE-FOR-BYTE.
//
// The assertions decode back to bytes rather than comparing strings, matching
// `autoResumeFire.test.ts`'s posture: the contract with the PTY is bytes, and a string
// comparison would hide an encoding regression (the M10.5 mojibake class).

/** Decode base64 back to bytes so the assertion is about BYTES, not about a string. */
const bytes = (b64: string): number[] => [
  ...new Uint8Array(
    atob(b64)
      .split("")
      .map((c) => c.charCodeAt(0)),
  ),
];

const ESC = 0x1b;
const START = [ESC, 0x5b, 0x32, 0x30, 0x30, 0x7e]; // ESC [ 2 0 0 ~
const END = [ESC, 0x5b, 0x32, 0x30, 0x31, 0x7e]; // ESC [ 2 0 1 ~
const CR = 0x0d;
const LF = 0x0a;

describe("stagedPayload — the bracketed-paste envelope", () => {
  it("wraps the body in ESC[200~ … ESC[201~ with interior newline as CR, and does NOT submit", () => {
    // The whole-payload literal. Spelled out as explicit byte values so a change to any
    // part of the envelope — not merely its length — fails loudly.
    expect(
      bytes(stagedPayload("a\nb", { submit: false, dictated: false })),
    ).toEqual([
      ...START,
      0x61, // a
      CR, // the interior newline, as CR — inside the envelope this INSERTS, not submits
      0x62, // b
      ...END,
    ]);
  });

  it("the two send modes differ by EXACTLY one trailing CR and nothing else", () => {
    // ⚠️ This is the load-bearing property of the whole builder: stage-only must not
    // submit. Asserting the relationship (not just each shape) is what catches a change
    // that alters both modes in the same direction.
    const staged = bytes(
      stagedPayload("a\nb", { submit: false, dictated: false }),
    );
    const submitted = bytes(
      stagedPayload("a\nb", { submit: true, dictated: false }),
    );

    expect(submitted).toEqual([...staged, CR]);
    expect(staged.at(-1)).not.toBe(CR);
    expect(submitted.at(-1)).toBe(CR);
  });

  it("never emits LF anywhere, in either mode", () => {
    // `\n` in raw mode only triggers autocomplete typeahead; it must never reach the PTY.
    for (const submit of [true, false]) {
      const out = bytes(
        stagedPayload("one\ntwo\r\nthree\n", { submit, dictated: false }),
      );
      expect(out, `submit=${submit}`).not.toContain(LF);
    }
  });

  it("collapses CRLF to a single CR rather than emitting two line breaks", () => {
    const crlf = bytes(
      stagedPayload("a\r\nb", { submit: false, dictated: false }),
    );
    const lf = bytes(stagedPayload("a\nb", { submit: false, dictated: false }));
    expect(crlf).toEqual(lf);
  });

  it("preserves a body that already contains a bare CR", () => {
    expect(
      bytes(stagedPayload("a\rb", { submit: false, dictated: false })),
    ).toEqual([...START, 0x61, CR, 0x62, ...END]);
  });

  it("preserves interior blank lines (consecutive newlines are not coalesced)", () => {
    // A dictated passage with paragraph breaks must keep them.
    expect(
      bytes(stagedPayload("a\n\nb", { submit: false, dictated: false })),
    ).toEqual([...START, 0x61, CR, CR, 0x62, ...END]);
  });

  it("encodes UTF-8, not truncated char codes", () => {
    // ⚠️ M10.5 WP4 shipped input mojibake because the old path truncated each char to
    // `& 0xff`. Dictated prose is exactly where curly quotes, em-dashes and accents appear.
    const out = bytes(stagedPayload("é—", { submit: false, dictated: false }));
    expect(out).toContain(0xc3); // é = U+00E9 → C3 A9
    expect(out).toContain(0xa9);
    expect(out).toContain(0xe2); // — = U+2014 → E2 80 94
    expect(out).toContain(0x94);
    expect(out).not.toContain(0xe9); // what a `& 0xff` truncation would have emitted
  });

  it("handles an empty body — an envelope with nothing in it", () => {
    expect(
      bytes(stagedPayload("", { submit: false, dictated: false })),
    ).toEqual([...START, ...END]);
    expect(bytes(stagedPayload("", { submit: true, dictated: false }))).toEqual(
      [...START, ...END, CR],
    );
  });

  it("strips a literal ESC[201~ from the body so it cannot end the envelope early", () => {
    // ⚠️ The one injection-shaped hole in the envelope. An embedded terminator would close
    // the paste, and everything after it would be read as KEYSTROKES rather than text.
    const out = bytes(
      stagedPayload(`a${PASTE_END}b`, { submit: false, dictated: false }),
    );
    expect(out).toEqual([...START, 0x61, 0x62, ...END]);

    // Exactly one terminator survives — the envelope's own, at the very end. Counted over
    // start INDICES (the same form as the verify-codify invariant below).
    let terminators = 0;
    for (let i = 0; i + END.length <= out.length; i++) {
      if (END.every((e, j) => out[i + j] === e)) terminators++;
    }
    expect(terminators).toBe(1);
  });

  it("leaves a literal ESC[200~ in the body alone — it is inert inside an open envelope", () => {
    const out = bytes(
      stagedPayload(`a${PASTE_START}b`, { submit: false, dictated: false }),
    );
    expect(out).toEqual([...START, 0x61, ...START, 0x62, ...END]);
  });

  it("encodes a 200k body — the size a single un-chunked spread cannot take", () => {
    // Guards the CHUNKING inside `cc/bridge`'s `encodeBase64`: replacing its chunked
    // `String.fromCharCode(...slice)` loop with one spread over the whole byte array throws a
    // RangeError at this size. A long single-take dictation is the realistic input that gets
    // here. (It is a size + length check; the envelope's bytes are pinned by the tests above.)
    const big = "x".repeat(200_000);
    expect(() =>
      stagedPayload(big, { submit: false, dictated: false }),
    ).not.toThrow();
    expect(
      bytes(stagedPayload(big, { submit: false, dictated: false })),
    ).toHaveLength(START.length + 200_000 + END.length);
  });
});

describe("verify-codify — the approved properties, asserted as INVARIANTS", () => {
  // These codify the two decisions the operator ratified at verify-human (2026-09-21).
  // The build-time tests above assert them on hand-picked bodies; these assert them as
  // properties that must hold for EVERY input, which is what was actually approved.

  /** Bodies chosen to include the realistic dictation shapes, not just convenient ones. */
  const BODIES = [
    "",
    "hello",
    "hello world\n", // ⚠️ trailing newline — the realistic dictation tail
    "hello\n\n", // trailing blank line
    "\n", // newline only
    "a\nb\r\nc",
    "é— curly “quotes”",
    `embedded ${PASTE_END} terminator`,
    // ⚠️ TWO embedded terminators. Added at verify-codify after a SURVIVING mutant: changing
    // the strip from `.split().join()` to `.replace()` (first-occurrence only) left all 18
    // tests green, because no body until now carried more than one. A second terminator
    // would then leak through and break the envelope open.
    `two ${PASTE_END} embedded ${PASTE_END} terminators`,
    `embedded ${PASTE_START} starter`,
    "x".repeat(50_000),
  ];

  it("STAGE-ONLY NEVER ENDS IN CR — for every body, not just the sampled ones", () => {
    // ⚠️ THE LOAD-BEARING INVARIANT (operator-approved P1.verify-human.1). A trailing CR in
    // stage-only mode submits a half-finished dictation, which is the exact failure F-a
    // exists to prevent. Asserted over the whole body set because "does not submit" is a
    // property of the MODE, not of one input. The trailing-newline case is the one most
    // likely to break it: a body ending in `\n` becomes a CR, and only the fact that it
    // lands INSIDE the envelope keeps the payload from ending in one.
    for (const body of BODIES) {
      const out = bytes(
        stagedPayload(body, { submit: false, dictated: false }),
      );
      expect(out.at(-1), JSON.stringify(body.slice(0, 40))).not.toBe(CR);
      // Stronger: it ends with the envelope terminator, so nothing trails the envelope.
      expect(out.slice(-END.length), JSON.stringify(body.slice(0, 40))).toEqual(
        END,
      );
    }
  });

  it("the two modes differ by EXACTLY one trailing CR — for every body", () => {
    for (const body of BODIES) {
      const staged = bytes(
        stagedPayload(body, { submit: false, dictated: false }),
      );
      const submitted = bytes(
        stagedPayload(body, { submit: true, dictated: false }),
      );
      expect(submitted, JSON.stringify(body.slice(0, 40))).toEqual([
        ...staged,
        CR,
      ]);
    }
  });

  it("NEVER emits LF, and never leaks an unescaped terminator — for every body", () => {
    // ⚠️ The second approved decision (P1.verify-human.2) stated as an invariant: exactly
    // one envelope terminator survives, the payload's own. A body carrying its own
    // terminator must not be able to add a second one.
    for (const body of BODIES) {
      for (const submit of [true, false]) {
        const out = bytes(stagedPayload(body, { submit, dictated: false }));
        expect(out, JSON.stringify(body.slice(0, 40))).not.toContain(LF);

        let terminators = 0;
        for (let i = 0; i + END.length <= out.length; i++) {
          if (END.every((e, j) => out[i + j] === e)) terminators++;
        }
        expect(terminators, JSON.stringify(body.slice(0, 40))).toBe(1);
      }
    }
  });

  it("always opens with the envelope starter", () => {
    for (const body of BODIES) {
      for (const submit of [true, false]) {
        const out = bytes(stagedPayload(body, { submit, dictated: false }));
        expect(
          out.slice(0, START.length),
          JSON.stringify(body.slice(0, 40)),
        ).toEqual(START);
      }
    }
  });
});

describe("the existing slash-command builder is UNCHANGED by this WP (wbs 2.4)", () => {
  it("slashCommandPayload still emits exactly its pinned bytes", () => {
    // ⚠️ A regression here breaks auto-resume (M12), the skill row (M13) and the
    // supervisor (M15) at once — all three share this one funnel. Pinned as a literal so
    // the guard does not merely restate the implementation.
    expect(bytes(slashCommandPayload("/session-restore"))).toEqual([
      ...new TextEncoder().encode("/session-restore\r"),
    ]);
  });

  it("slashCommandPayload does NOT gain a bracketed-paste envelope", () => {
    // The specific way widening the wrong builder would have manifested.
    const out = bytes(slashCommandPayload("/session-restore"));
    expect(out.slice(0, START.length)).not.toEqual(START);
    expect(out).not.toContain(ESC);
  });

  it("slashCommandPayload still collapses a trailing newline to one CR", () => {
    const expected = bytes(slashCommandPayload("/session-restore"));
    for (const variant of [
      "/session-restore\n",
      "/session-restore\r",
      "/session-restore\r\n",
    ]) {
      expect(bytes(slashCommandPayload(variant)), variant).toEqual(expected);
    }
  });
});

// Paydown WP10 — the dictated wrap. ⚠️ IDENTITY, not length (source-text-guards entry 15): every
// case compares the whole decoded payload, so a dropped note, a moved note or a note outside the
// envelope all fail rather than merely changing a count.
describe("stagedPayload — the dictated wrap", () => {
  /** Decode to text: the notes contain an em dash, so compare as UTF-8 text, not code units. */
  const text = (b64: string): string =>
    new TextDecoder().decode(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
    );

  it("uses the operator's ruled wording verbatim", () => {
    // Spelled out literally, NOT via the constants, so a wording drift fails here.
    expect(DICTATED_OPEN).toBe(
      "[Dictated via speech recognition — may contain transcription errors.]",
    );
    expect(DICTATED_CLOSE).toBe("[End dictated section.]");
  });

  it("wraps INSIDE the envelope, each note on its own line, for all four combinations", () => {
    const on = `\x1b[200~${DICTATED_OPEN}\rone\rtwo\r${DICTATED_CLOSE}\x1b[201~`;
    const off = "\x1b[200~one\rtwo\x1b[201~";
    expect(
      text(stagedPayload("one\ntwo", { submit: false, dictated: true })),
    ).toBe(on);
    expect(
      text(stagedPayload("one\ntwo", { submit: true, dictated: true })),
    ).toBe(`${on}\r`);
    expect(
      text(stagedPayload("one\ntwo", { submit: false, dictated: false })),
    ).toBe(off);
    expect(
      text(stagedPayload("one\ntwo", { submit: true, dictated: false })),
    ).toBe(`${off}\r`);
  });

  it("wraps BEFORE normalization — the notes' own line breaks are CR, never LF", () => {
    // Wrapping after normalization would leave the two joining `\n`s raw on the wire.
    for (const submit of [true, false]) {
      const out = bytes(stagedPayload("x", { submit, dictated: true }));
      expect(out, `submit=${submit}`).not.toContain(LF);
    }
  });

  it("still neutralizes an embedded ESC[201~ in a wrapped body, so the close note stays inside", () => {
    expect(
      text(stagedPayload(`a${PASTE_END}b`, { submit: false, dictated: true })),
    ).toBe(`${PASTE_START}${DICTATED_OPEN}\rab\r${DICTATED_CLOSE}${PASTE_END}`);
  });
});
