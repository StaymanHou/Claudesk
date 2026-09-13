// M15 WP3 Phase 4 — the adjudicator's contract.
//
// ⚠️ Every test below maps to one of R-6's three binding conditions or to the routing
// constraint that travels with them. These are not general unit tests; they are the artifact
// that makes the conditions checkable.

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  adjudicate,
  adjudicationPrompt,
  ADJUDICATOR_MODEL,
  ADJUDICATOR_TIMEOUT_MS,
  assertPinnedModel,
  parseAdjudication,
  type AdjudicatorDeps,
} from "../adjudicator";

const deps = (
  run: AdjudicatorDeps["run"],
): AdjudicatorDeps & { warnings: string[] } => {
  const warnings: string[] = [];
  return { run, warn: (m) => warnings.push(m), warnings };
};

describe("⚠️ R-6 condition 1 — the model is PINNED and a change fails loudly", () => {
  it("pins sonnet", () => {
    // haiku is NOT_SEPARABLE on identical data (23/29 vs 25/29 against a >=24 bar).
    expect(ADJUDICATOR_MODEL).toBe("sonnet");
  });

  it("throws — not warns — when the model is not the pinned one", () => {
    // ⚠️ THE POINT OF THE CONDITION. A silent downgrade regresses break detection with NO
    // code change and NO signal, so the failure has to be impossible to ignore.
    expect(() => assertPinnedModel("haiku")).toThrow(/must be "sonnet"/);
    expect(() => assertPinnedModel("haiku")).toThrow(/NOT_SEPARABLE/);
    expect(() => assertPinnedModel(null)).toThrow(/got none/);
    expect(() => assertPinnedModel(undefined)).toThrow(/got none/);
    expect(() => assertPinnedModel("sonnet")).not.toThrow();
  });

  it("passes the pinned model to the runner, not whatever the caller supplies", () => {
    const seen: string[] = [];
    const d = deps(async ({ model }) => {
      seen.push(model);
      return "PROCEED";
    });
    return adjudicate("tail", d).then(() => {
      expect(seen).toEqual([ADJUDICATOR_MODEL]);
    });
  });
});

describe("⚠️ R-6 condition 2 — EVERY failure path withholds", () => {
  // The binding asymmetry: "stays silent, operator nudges" is recoverable; firing into a turn
  // that is awaiting an answer is not (`injectCommand` has no retry, no pre-send cancel).

  it("withholds when the runner rejects (binary missing, non-zero exit)", async () => {
    const d = deps(async () => {
      throw new Error("claude not found on PATH (/usr/bin)");
    });
    const r = await adjudicate("tail", d);
    expect(r.answer).toBe("AWAITING");
    expect(r.basis).toBe("withheld-on-error");
    expect(d.warnings.join(" ")).toContain("withholding");
  });

  it("withholds on a timeout, and classifies it distinctly for the diagnostic", async () => {
    const d = deps(async () => {
      throw new Error("claude -p timed out after 20000ms");
    });
    const r = await adjudicate("tail", d);
    expect(r.answer).toBe("AWAITING");
    expect(r.basis).toBe("withheld-on-timeout");
  });

  it("⚠️ withholds on an UNPARSEABLE answer rather than guessing", async () => {
    // A hedging model ("I think this is PROCEED, but…") must not be read as PROCEED. This is
    // where a lenient `includes("PROCEED")` parser would turn a non-answer into a fire.
    for (const reply of [
      "I think it's PROCEED",
      "PROCEED.",
      "AWAITING or PROCEED?",
      "",
      "yes",
    ]) {
      const r = await adjudicate(
        "tail",
        deps(async () => reply),
      );
      expect(r.answer, `reply ${JSON.stringify(reply)}`).toBe("AWAITING");
      expect(r.basis).toBe("withheld-on-unparseable");
    }
  });

  it("⚠️ has NO path to PROCEED except the pinned model explicitly saying so", async () => {
    // The structural statement of condition 2: the only way to get a fire is an exact answer.
    const proceeding = await adjudicate(
      "tail",
      deps(async () => "PROCEED"),
    );
    expect(proceeding.answer).toBe("PROCEED");
    expect(proceeding.basis).toBe("model");

    // …and every other outcome is AWAITING.
    const rejected = await adjudicate(
      "tail",
      deps(async () => Promise.reject(new Error("x"))),
    );
    const garbage = await adjudicate(
      "tail",
      deps(async () => "maybe"),
    );
    expect([rejected.answer, garbage.answer]).toEqual(["AWAITING", "AWAITING"]);
  });

  it("logs every withhold so a silent supervisor is diagnosable", async () => {
    // A supervisor that declines silently is indistinguishable from one that is broken.
    const d = deps(async () => "nonsense");
    await adjudicate("tail", d);
    expect(d.warnings).toHaveLength(1);
    expect(d.warnings[0]).toContain("supervisor adjudicator");
  });
});

describe("parseAdjudication — exact-match only", () => {
  it("accepts the two tokens, case- and whitespace-insensitively", () => {
    expect(parseAdjudication("AWAITING")).toBe("AWAITING");
    expect(parseAdjudication("  proceed \n")).toBe("PROCEED");
  });

  it("rejects anything that merely CONTAINS a token", () => {
    // ⚠️ The lenient-parser trap, pinned directly.
    expect(parseAdjudication("probably PROCEED")).toBeNull();
    expect(parseAdjudication("PROCEED — nothing is asked")).toBeNull();
  });
});

describe("adjudicationPrompt", () => {
  it("asks ONLY whether the turn awaits input — not whether to fire", () => {
    // ⚠️ Handing the LLM "should the supervisor fire?" would give it the whole policy
    // decision, which is exactly what the mechanical rule exists to own.
    const p = adjudicationPrompt("some tail");
    expect(p).toContain("waiting for the human");
    expect(p.toLowerCase()).not.toContain("should the supervisor");
    expect(p.toLowerCase()).not.toContain("transition");
  });

  it("constrains the answer to one bare token and embeds the tail", () => {
    const p = adjudicationPrompt("THE-TAIL-MARKER");
    expect(p).toContain("exactly one word");
    expect(p).toContain("THE-TAIL-MARKER");
  });

  it("names both answers so neither is the model's default", () => {
    const p = adjudicationPrompt("t");
    expect(p).toContain("AWAITING");
    expect(p).toContain("PROCEED");
  });
});

describe("timeout budget", () => {
  it("passes a finite timeout to the runner — an unbounded wait would hang the fan-out", () => {
    // The supervisor runs this per fire across every open workspace; a missing timeout would
    // stall the whole sweep on one wedged child.
    const seen: number[] = [];
    const d = deps(async ({ timeoutMs }) => {
      seen.push(timeoutMs);
      return "PROCEED";
    });
    return adjudicate("tail", d).then(() => {
      expect(seen).toEqual([ADJUDICATOR_TIMEOUT_MS]);
      expect(ADJUDICATOR_TIMEOUT_MS).toBeGreaterThan(0);
      expect(Number.isFinite(ADJUDICATOR_TIMEOUT_MS)).toBe(true);
    });
  });

  it("defaults its diagnostic sink to console.warn when none is injected", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await adjudicate("tail", { run: async () => "garbage" });
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

describe("⚠️ the operator-accepted constants, pinned by VALUE", () => {
  it("pins the adjudicator timeout at 20s — the value the operator accepted", () => {
    // ⚠️ WHY BY VALUE AND NOT JUST "finite and positive". The operator accepted this number
    // at verify-human (2026-09-13) with the tradeoff stated explicitly: on an adjudicator
    // hang the workspace sits idle for this long before the supervisor withholds. A change
    // to 200s would keep every other assertion in this file green while costing the operator
    // 200 seconds of a dead workspace — a decision of theirs, silently reversed.
    //
    // This is a CHOSEN value, so a change is a behavior change that needs re-approval, not a
    // config tweak. Failing here is the prompt to go ask.
    expect(ADJUDICATOR_TIMEOUT_MS).toBe(20_000);
  });
});

describe("⚠️ the Rust->TS error contract, driven end to end", () => {
  // ⚠️ THE GAP THIS CLOSES. `adjudicator.ts` classifies a timeout by matching /timed? ?out/i
  // against the error message, and that message is produced in RUST
  // (`AdjudicateError::TimedOut` -> "claude -p timed out after {ms}ms"). Until now both sides
  // were tested against a HAND-WRITTEN copy of the string: the Rust test asserts its own
  // Display output matches a local helper, and the TS test throws a literal it typed itself.
  //
  // So if Rust reworded the message ("exceeded its deadline"), BOTH suites stay green while
  // every real timeout is mislabelled `withheld-on-error`. Neither side owns the contract.
  //
  // This reads the REAL string out of the REAL Rust source and drives it through the REAL TS
  // classifier. It is the cheapest available form of a cross-language contract test — the
  // alternative (spawning the binary) is not something a unit suite should do.
  const rustTimeoutMessage = (): string => {
    const src = readFileSync(
      resolve(__dirname, "../../../../src-tauri/src/adjudicator/mod.rs"),
      "utf8",
    );
    // The `write!` format string for the TimedOut arm.
    const m = /TimedOut\(ms\) => write!\(f, "([^"]+)"/.exec(src);
    if (!m)
      throw new Error("could not find the TimedOut Display arm in mod.rs");
    return m[1].replace("{ms}", "20000");
  };

  it("finds the real Rust message (guards against this test going vacuous)", () => {
    // If the Display arm is refactored into a shape this regex cannot see, the helper throws
    // rather than silently matching nothing — so this test fails loudly instead of passing
    // over an empty string.
    expect(rustTimeoutMessage()).toContain("claude -p");
  });

  it("⚠️ the REAL Rust timeout message classifies as a TIMEOUT in TS, not a generic error", async () => {
    const message = rustTimeoutMessage();
    const r = await adjudicate("tail", {
      run: async () => {
        throw new Error(message);
      },
      warn: () => {},
    });
    expect(r.answer).toBe("AWAITING");
    expect(
      r.basis,
      `Rust says ${JSON.stringify(message)} but TS did not classify it as a timeout — ` +
        "the two sides have drifted",
    ).toBe("withheld-on-timeout");
  });

  it("a DIFFERENT real Rust message still withholds, just not as a timeout", async () => {
    // The other direction: a not-found error must withhold too, but must NOT be mislabelled a
    // timeout. Both withhold — only the diagnostic differs — so this guards the label, and
    // the label is what an operator reads when asking "why did nothing fire?".
    const r = await adjudicate("tail", {
      run: async () => {
        throw new Error("claude not found on PATH (/usr/bin:/bin)");
      },
      warn: () => {},
    });
    expect(r.answer).toBe("AWAITING");
    expect(r.basis).toBe("withheld-on-error");
  });
});
