import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  HISTORY_CAP,
  HISTORY_KEY_PREFIX,
  appendToHistory,
  clearHistory,
  loadHistory,
} from "../draftHistory";

// F-a WP2 Phase 3 — the per-project ring of sent drafts.
//
// ⚠️ Assertions use HISTORY_CAP, never a hardcoded 10 — a literal would silently stop
// testing the boundary if the cap moved.

let store: Record<string, string>;

beforeEach(() => {
  store = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  });
});

describe("draftHistory — the ring", () => {
  it("the cap IS 10 — the one deliberate literal anchor", () => {
    // ⚠️ THE REST OF THIS SUITE IS TAUTOLOGICAL WITHOUT THIS LINE, and that was measured,
    // not guessed: with every assertion derived from HISTORY_CAP, setting the constant to 3
    // left all 19 tests passing at exit 0 (verify-self, 2026-09-21). The suite verified the
    // eviction MECHANISM — ordering, which entries survive — but not the cap's VALUE, which
    // is `[[detector-scored-against-its-own-table-is-circular]]`: input count and expected
    // output both derived from the same constant the module uses is an arithmetic identity.
    //
    // These are two separable properties and one assertion cannot hold both. This line pins
    // the value as a deliberate, reviewable decision; every OTHER assertion stays relative
    // to the constant, so an intentional cap change updates exactly one line here and the
    // boundary tests keep working.
    expect(HISTORY_CAP).toBe(10);
  });

  it("evicts the oldest beyond the cap, newest first — asserting the ACTUAL array", () => {
    // ⚠️ Length alone would pass on a ring that kept the WRONG ten. The full array is the
    // assertion: order and identity, not just count.
    const over = HISTORY_CAP + 2;
    for (let i = 1; i <= over; i++) appendToHistory("/p", `entry ${i}`);

    const ring = loadHistory("/p");
    expect(ring).toHaveLength(HISTORY_CAP);

    // Newest first: entry 12, 11, 10 … down to 3. Entries 1 and 2 are evicted.
    const expected = Array.from(
      { length: HISTORY_CAP },
      (_, i) => `entry ${over - i}`,
    );
    expect(ring).toEqual(expected);
    expect(ring).not.toContain("entry 1");
    expect(ring).not.toContain("entry 2");
  });

  it("CLAMPS ON WRITE — the PERSISTED value is bounded, not just the loaded one", () => {
    // ⚠️ THIS ASSERTS AGAINST `store` DIRECTLY, AND THAT IS THE ENTIRE POINT.
    //
    // Every other assertion in this file reads through `loadHistory`, which re-clamps on
    // read — so a writer that never clamps and a writer that clamps correctly produce an
    // IDENTICAL observable through the reader. Measured at verify-self (2026-09-21): with
    // `.slice(0, HISTORY_CAP)` removed from `appendToHistory`, a direct probe showed
    // `stored.length=11, loaded.length=10` while the whole suite stayed green at 20/20.
    // ⚠️ The ring would grow UNBOUNDED in localStorage — in a quota-limited store, which is
    // the exact failure the module's error handling exists to survive — and nothing here
    // could see it.
    //
    // ⚠️ The read clamp is a deliberate DEFENSE (see the CLAMPS test below: it guards against
    // a value written by an older build with a larger cap). A defense that also HIDES a
    // broken writer is why this assertion has to bypass it. Do not "simplify" this to use
    // `loadHistory` — that would restore the blind spot exactly.
    const over = HISTORY_CAP + 2;
    for (let i = 1; i <= over; i++) appendToHistory("/p", `entry ${i}`);

    const persisted: unknown = JSON.parse(store[`${HISTORY_KEY_PREFIX}/p`]);
    expect(Array.isArray(persisted)).toBe(true);
    expect(persisted as string[]).toHaveLength(HISTORY_CAP);
    // Same identity + order check as the read-side test, against the stored bytes.
    expect(persisted as string[]).toEqual(
      Array.from({ length: HISTORY_CAP }, (_, i) => `entry ${over - i}`),
    );
  });

  it("the persisted ring does not GROW across many appends", () => {
    // The unbounded-growth failure stated as a property over time rather than one snapshot:
    // an off-by-one write clamp (`HISTORY_CAP + 1`) leaves length stable but WRONG, while a
    // missing clamp grows without limit. Checking after every append catches both.
    for (let i = 1; i <= HISTORY_CAP * 3; i++) {
      appendToHistory("/p", `entry ${i}`);
      const persisted = JSON.parse(
        store[`${HISTORY_KEY_PREFIX}/p`],
      ) as string[];
      expect(persisted.length, `after append ${i}`).toBeLessThanOrEqual(
        HISTORY_CAP,
      );
    }
    expect(
      (JSON.parse(store[`${HISTORY_KEY_PREFIX}/p`]) as string[]).length,
    ).toBe(HISTORY_CAP);
  });

  it("returns the new ring from appendToHistory without needing a re-read", () => {
    appendToHistory("/p", "first");
    const returned = appendToHistory("/p", "second");
    expect(returned).toEqual(["second", "first"]);
    expect(returned).toEqual(loadHistory("/p"));
  });

  it("is empty for a project with no history", () => {
    expect(loadHistory("/p/never-used")).toEqual([]);
  });

  it("clearHistory empties the ring", () => {
    appendToHistory("/p", "text");
    clearHistory("/p");
    expect(loadHistory("/p")).toEqual([]);
  });
});

describe("draftHistory — appendToHistory's RETURN VALUE is a contract", () => {
  // ⚠️ THE SECOND CONTRACT, AND THE PLAN NEVER NAMED IT. Every Observable Outcome for this
  // phase was written as "what is in storage", so the whole suite asserted persisted/loaded
  // state and NOTHING asserted what the function hands back. Two mutants survived all 22
  // tests on that axis (verify-self round 4, 2026-09-21).
  //
  // ⚠️ This matters because the module DOCUMENTS the return as usable directly — "Returns
  // the new ring so a caller can use it without a re-read" — and WP3/WP4 are the callers
  // that will write `setRing(appendToHistory(path, text))`. A wrong return value is a UI
  // bug those tests would never catch, because storage would look perfectly correct.

  it("the HAPPY path returns the new ring, matching what was persisted", () => {
    const returned = appendToHistory("/p", "first");
    expect(returned).toEqual(["first"]);
    expect(returned).toEqual(loadHistory("/p"));
  });

  it("a BLANK send returns the INTACT ring — never an empty array", () => {
    // ⚠️ SURVIVOR A. `return loadHistory(projectPath)` → `return []` passed all 22 tests,
    // because every blank-refusal test asserted PERSISTED state, which that mutant does not
    // touch. Probe at the time: returned `[]` while storage still held two real entries.
    // ⚠️ A caller doing `setRing(appendToHistory(p, text))` would BLANK ITS UI RING on a
    // blank send — the exact harm the refusal exists to prevent, inverted.
    appendToHistory("/p", "real one");
    appendToHistory("/p", "real two");
    const intact = ["real two", "real one"];

    for (const blank of ["", "   ", "\n", "\t\n  "]) {
      expect(appendToHistory("/p", blank), JSON.stringify(blank)).toEqual(
        intact,
      );
    }
    // And the returned value still agrees with storage, which is the contract's whole point.
    expect(appendToHistory("/p", "  ")).toEqual(loadHistory("/p"));
  });

  it("a blank send into an EMPTY ring returns [] — the intact ring happens to be empty", () => {
    // Distinguishes "returns the intact ring" from "returns []": here they coincide, so
    // this pins that the empty result is a CONSEQUENCE, not the rule.
    expect(appendToHistory("/p/fresh", "   ")).toEqual([]);
    expect(loadHistory("/p/fresh")).toEqual([]);
  });

  it("the QUOTA-EXHAUSTED path returns the INTACT ring, not []", () => {
    // ⚠️ REVIEW FINDING, 2026-09-21 — and the earlier version of this test PINNED THE BUG.
    // It asserted `toEqual([])` against a stub whose `getItem` returned null, so `[]` was
    // also what the correct behavior produced: the assertion could not tell the two apart,
    // and it locked in the wrong one. The stub below seeds a REAL ring first, which is what
    // makes the two answers differ.
    //
    // ⚠️ A throwing `setItem` leaves storage UNTOUCHED — the ring is still there. Returning
    // `[]` would make `setRing(appendToHistory(p, t))` blank a populated UI ring against
    // live data. Same defect as the blank-entry arm (Survivor A), on the failure arm.
    const store: Record<string, string> = {};
    const stub = (throwOnSet: boolean) => ({
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        if (throwOnSet) throw new Error("QuotaExceededError");
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });

    vi.stubGlobal("localStorage", stub(false));
    appendToHistory("/p", "real one");
    appendToHistory("/p", "real two");

    vi.stubGlobal("localStorage", stub(true));
    expect(appendToHistory("/p", "x".repeat(10_000))).toEqual([
      "real two",
      "real one",
    ]);
    // Storage really is intact — the premise the contract rests on.
    expect(loadHistory("/p")).toEqual(["real two", "real one"]);
  });

  it("the NO-STORAGE path returns the ring as it stands — which IS [] with no storage", () => {
    // Here `[]` is the CORRECT answer rather than a coincidence: with no storage there is no
    // ring to report. Kept as a distinct case so the two are not conflated again.
    vi.stubGlobal("localStorage", undefined);
    expect(appendToHistory("/p", "text")).toEqual([]);
  });
});

describe("draftHistory — per-project keying", () => {
  it("two projects keep INDEPENDENT rings", () => {
    appendToHistory("/p/alpha", "alpha one");
    appendToHistory("/p/beta", "beta one");
    appendToHistory("/p/alpha", "alpha two");

    expect(loadHistory("/p/alpha")).toEqual(["alpha two", "alpha one"]);
    expect(loadHistory("/p/beta")).toEqual(["beta one"]);
  });

  it("canonicalizes on read AND write — a trailing slash is the same project", () => {
    appendToHistory("/p/proj/", "written with slash");
    expect(loadHistory("/p/proj")).toEqual(["written with slash"]);

    appendToHistory("/p/proj", "written without");
    expect(loadHistory("/p/proj/")).toEqual([
      "written without",
      "written with slash",
    ]);

    const keys = Object.keys(store).filter((k) =>
      k.startsWith(HISTORY_KEY_PREFIX),
    );
    expect(keys).toHaveLength(1);
  });

  it("round-trips interior newlines and multi-byte characters verbatim", () => {
    const body = "line one\nline two\n\nafter blank — é “quoted”";
    appendToHistory("/p", body);
    expect(loadHistory("/p")[0]).toBe(body);
  });
});

describe("draftHistory — a blank entry is REFUSED", () => {
  it("does not append an empty or whitespace-only entry", () => {
    // ⚠️ The deliberate INVERSE of saveDraft's preserve-whitespace rule. The ring is
    // bounded, so a junk entry would evict a real one.
    appendToHistory("/p", "real entry");
    for (const blank of ["", "   ", "\n", "\t\n  "]) {
      appendToHistory("/p", blank);
    }
    expect(loadHistory("/p")).toEqual(["real entry"]);
  });

  it("a blank send does NOT evict the oldest entry from a full ring", () => {
    // The specific harm the refusal prevents, asserted directly rather than implied.
    for (let i = 1; i <= HISTORY_CAP; i++) appendToHistory("/p", `entry ${i}`);
    const before = loadHistory("/p");

    appendToHistory("/p", "   ");

    expect(loadHistory("/p")).toEqual(before);
    expect(loadHistory("/p")).toContain("entry 1");
  });

  it("preserves interior whitespace in an entry that is not ALL whitespace", () => {
    // The refusal is about blank entries, not about trimming real ones.
    const body = "  leading and trailing kept  ";
    appendToHistory("/p", body);
    expect(loadHistory("/p")[0]).toBe(body);
  });
});

describe("draftHistory — consecutive duplicates are NOT collapsed (P3.2)", () => {
  // ⚠️ THE RATIONALE HERE WAS CORRECTED AT VERIFY-HUMAN (2026-09-21). The decision did not
  // change; the reasoning behind it was wrong and has been replaced. The original comment
  // claimed collapsing "hides that the send happened twice" — but this ring is a RECOVERY
  // LIST with no timestamps and no send log, so "it happened twice" is not information the
  // structure carries. That argument defended a property the data model does not have.
  //
  // The reasons it survives, from the operator (2026-09-21):
  //   1. ⚠️ The strongest argument AGAINST no-dedup does not apply here — repeated nudges
  //      ("continue", "next") are typed straight into the CC pane, never staged, so they
  //      cannot flood this ring. That case was hypothetical.
  //   2. The ring will not become a browsed or searchable surface, so duplicates are not
  //      browsing noise either.
  //   3. ⚠️ THE DECIDING ASYMMETRY: the "record of what I sent" reading may turn out to be
  //      real. Keeping a duplicate is cheap and reversible; discarding one destroys
  //      information that cannot be recovered later.
  //
  // So: do not "optimize" this by collapsing. If the nudge-flooding case ever DOES reach
  // this ring (i.e. the operator starts staging short repeated prompts), reason 1 lapses
  // and the tradeoff is worth revisiting — that is the condition to watch, not the rule.

  it("keeps both copies when the same entry is sent twice in a row", () => {
    appendToHistory("/p", "same text");
    appendToHistory("/p", "same text");
    expect(loadHistory("/p")).toEqual(["same text", "same text"]);
  });

  it("keeps N consecutive copies, not merely two", () => {
    // ⚠️ A two-send test cannot distinguish "never collapses" from "collapses only runs
    // longer than two" — a plausible shape for a hand-rolled dedup. Asserting a run of
    // four pins the rule as unconditional.
    for (let i = 0; i < 4; i++) appendToHistory("/p", "repeated");
    expect(loadHistory("/p")).toEqual([
      "repeated",
      "repeated",
      "repeated",
      "repeated",
    ]);
  });

  it("a duplicate still EVICTS when the ring is full — dedup is not a hidden capacity bonus", () => {
    // ⚠️ Duplicates consume real slots. This is the cost the operator accepted, asserted
    // rather than assumed: filling the ring then re-sending the newest entry pushes the
    // oldest out, exactly as a distinct entry would.
    for (let i = 1; i <= HISTORY_CAP; i++) appendToHistory("/p", `entry ${i}`);
    expect(loadHistory("/p")).toContain("entry 1");

    appendToHistory("/p", `entry ${HISTORY_CAP}`); // duplicate of the current newest
    const ring = loadHistory("/p");
    expect(ring).toHaveLength(HISTORY_CAP);
    expect(ring).not.toContain("entry 1"); // the oldest was evicted by the duplicate
    expect(ring[0]).toBe(`entry ${HISTORY_CAP}`);
    expect(ring[1]).toBe(`entry ${HISTORY_CAP}`);
  });
});

describe("draftHistory — never throws", () => {
  it("loadHistory returns [] on a CORRUPT stored value", () => {
    // ⚠️ A REAL failure mode here, unlike in draftStore: the ring is JSON, so a truncated
    // or hand-edited value genuinely will not parse.
    store[`${HISTORY_KEY_PREFIX}/p`] = '["unterminated';
    expect(() => loadHistory("/p")).not.toThrow();
    expect(loadHistory("/p")).toEqual([]);
  });

  it("loadHistory returns [] when the stored JSON is not an ARRAY", () => {
    store[`${HISTORY_KEY_PREFIX}/p`] = '{"not":"an array"}';
    expect(loadHistory("/p")).toEqual([]);
  });

  it("DROPS non-string elements rather than handing them to a text surface", () => {
    // `JSON.parse` will happily produce [string, number, null]. The filter is what keeps a
    // non-string out of the consumer.
    store[`${HISTORY_KEY_PREFIX}/p`] = JSON.stringify(["ok", 42, null, "fine"]);
    expect(loadHistory("/p")).toEqual(["ok", "fine"]);
  });

  it("CLAMPS an over-long stored ring to the cap", () => {
    // Defends against a value written by an older build with a larger cap, or a hand edit.
    const oversized = Array.from(
      { length: HISTORY_CAP + 5 },
      (_, i) => `e${i}`,
    );
    store[`${HISTORY_KEY_PREFIX}/p`] = JSON.stringify(oversized);

    // ⚠️ ASSERT THE ARRAY, NOT THE LENGTH — and the distinction is not pedantic. The ring is
    // stored newest-first, so clamping the WRONG END returns the OLDEST ten instead of the
    // newest: `.slice(-HISTORY_CAP)` yields [e5…e14] where [e0…e9] is correct. Both are
    // length 10, so a `toHaveLength` assertion cannot tell them apart — and that mutant
    // survived all 22 tests at exit 0 (verify-self round 3, 2026-09-21).
    //
    // ⚠️ The consequence is the opposite of this list's purpose: a ring written by an older
    // build with a larger cap would surface the ten drafts LEAST likely to be wanted, with
    // no error. This is the same defect class as the write-path hole found in round 2 — a
    // length-only assertion standing in for an identity one — so if a future reader adds
    // another clamp anywhere, assert WHICH elements survive, not how many.
    expect(loadHistory("/p")).toEqual(oversized.slice(0, HISTORY_CAP));
  });

  it("tolerates localStorage being UNDEFINED (the real vitest/node shape)", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => loadHistory("/p")).not.toThrow();
    expect(loadHistory("/p")).toEqual([]);
    expect(() => appendToHistory("/p", "text")).not.toThrow();
    expect(() => clearHistory("/p")).not.toThrow();
  });

  it("tolerates a THROWING getter", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(() => loadHistory("/p")).not.toThrow();
    expect(loadHistory("/p")).toEqual([]);
  });

  it("tolerates a THROWING setter (quota exhausted)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    });
    expect(() => appendToHistory("/p", "x".repeat(10_000))).not.toThrow();
  });

  it("tolerates a THROWING remover", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(() => clearHistory("/p")).not.toThrow();
  });
});
