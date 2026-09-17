// M14 WP0 Phase 1 verify-codify — the CC pane's input-routing contract.
//
// ⚠️ **WHY THIS FILE EXISTS WHEN A STRUCTURAL GUARD ALREADY COVERS AC-7.** The guard in
// `fanOut.test.ts` reads SOURCE TEXT: it proves exactly one site pushes into the watermark and
// that `autoResumeFire.ts` never mentions it. That is a *shape*. The handler also carries an
// *ordering* property — the watermark is fed BEFORE the session-id guard and BEFORE base64
// encoding — which no source-text predicate can express, and which a plausible refactor would
// silently break while `tsc` and every existing test stayed green.
//
// `arch.md`: *"A `?raw` source-text guard cannot express a behavioral property. Extract the code
// so a test drives the real thing."* This drives the real thing.

import { describe, expect, it } from "vitest";
import { routeCcInput } from "../ccInputRouting";
import {
  foldInput,
  initialUnsentInputState,
} from "../../../state/supervisor/unsentInput";

/** Stand-in encoder — marks its input so a mix-up between raw and encoded is visible. */
const encode = (s: string) => `ENC(${s})`;

describe("routeCcInput — the watermark is fed regardless of session state", () => {
  it("feeds the watermark AND the pty when a session is live", () => {
    const r = routeCcInput("abc", "sess-1", encode);
    expect(r.toWatermark).toBe("abc");
    expect(r.toPty).toBe("ENC(abc)");
  });

  // ⚠️ THE ORDERING PROPERTY, AS A VALUE. A refactor that moved the watermark feed below
  // `if (!sid) return` would produce `toWatermark: ""` (or skip the call entirely) here — the
  // operator would be typing into a dead pane while the supervisor considered it clear.
  it("⚠️ still feeds the watermark when the session is GONE — typing is visible on screen", () => {
    const r = routeCcInput("abc", null, encode);
    expect(
      r.toWatermark,
      "input at a dead session is still unsent input the operator can see",
    ).toBe("abc");
    expect(r.toPty, "there is no session to write to").toBeNull();
  });

  it("treats an empty session id the same as a missing one", () => {
    expect(routeCcInput("abc", "", encode).toPty).toBeNull();
    expect(routeCcInput("abc", "", encode).toWatermark).toBe("abc");
  });
});

describe("routeCcInput — the watermark gets RAW bytes, the pty gets encoded", () => {
  // ⚠️ THE SILENT-FAILURE DIRECTION. If the watermark were fed the base64 string, every chunk
  // would look like ordinary printable input: `\r` would never be seen, the watermark would
  // NEVER clear, and the workspace would go permanently unsupervised. Asserted as behavior —
  // fold the routed value through the real reducer and check it actually clears.
  it("⚠️ a CR routed to the watermark CLEARS it; the encoded form would NOT", () => {
    const typed = foldInput(initialUnsentInputState, "abc");
    expect(typed.unsentInput).toBe(true);

    const routed = routeCcInput("\r", "sess-1", encode);
    expect(foldInput(typed, routed.toWatermark).unsentInput).toBe(false);

    // The positive control for the claim above: the ENCODED form does not clear, so the two
    // are genuinely distinguishable and this test would fail if they were swapped.
    expect(
      foldInput(typed, routed.toPty as string).unsentInput,
      "the encoded form must NOT clear — otherwise this test cannot detect the swap",
    ).toBe(true);
  });

  it("⚠️ a multi-byte glyph reaches the watermark unmangled", () => {
    // `encodeBase64` exists because multi-byte input was truncated once (M10.5 WP4). The
    // watermark must see the real characters, not a transport artifact.
    const r = routeCcInput("😀", "sess-1", encode);
    expect(r.toWatermark).toBe("😀");
    expect(foldInput(initialUnsentInputState, r.toWatermark).unsentInput).toBe(
      true,
    );
  });

  it("does not encode twice or drop the chunk when it is empty", () => {
    const r = routeCcInput("", "sess-1", encode);
    expect(r.toWatermark).toBe("");
    expect(r.toPty).toBe("ENC()");
  });
});
