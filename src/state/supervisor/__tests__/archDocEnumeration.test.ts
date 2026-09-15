// M15 WP5 Phase 4 verify-codify — THE ARCH DOC'S ENUMERATIONS, COUPLED TO THE CODE.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THIS FILE EXISTS: THE DOC SHIPPED A FALSEHOOD, AND NOTHING CAUGHT IT.
//
// `arch/workflow-supervisor.md` §B originally claimed Rust exposes "`transcript_tail` and
// `wip_read` and nothing else". **`supervisor_adjudicate` is a third supervisor-owned command**
// — and it spawns a subprocess rather than doing file IO. The same document's §D *described*
// that spawn, so the doc contradicted itself two sections apart and still read as authoritative.
//
// ⚠️ **IT WAS CAUGHT BY A HUMAN-DIRECTED AUDIT, NOT BY A GATE.** `CLAUDE.md` declares the
// `arch/` set the AUTHORITY for as-built architecture, so a stale enumeration there is not a
// documentation nit — it is live spec asserting something untrue, outranking the code comments
// it contradicts. The next such drift would be invisible again.
//
// ⚠️ WHAT THIS GUARD DOES AND DOES NOT DO. It cannot verify prose. It pins the *enumerations* —
// the closed sets where the doc makes a counting claim that the code can falsify. Those are the
// claims that rot silently when someone adds a command or a union arm, which is exactly how the
// original defect happened. Judgment claims stay a human's job.
//
// Pattern follows `src/cc/__tests__/driveMode.test.ts` ("arch/session-resumption.md names every
// drive-mode wire string"), including its head/tail truncation anchors.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");

const archDoc = readFileSync(
  resolve(ROOT, "workflow-system/product/arch/workflow-supervisor.md"),
  "utf8",
);

/** The frontend host — the single place every supervisor-owned `invoke` is made. */
const hostSrc = readFileSync(
  resolve(ROOT, "src/state/supervisor/useSupervisor.ts"),
  "utf8",
);

const policySrc = readFileSync(
  resolve(ROOT, "src/state/workflowMachine/policy.ts"),
  "utf8",
);

describe("arch/workflow-supervisor.md — non-vacuity", () => {
  it("⚠️ the doc loaded, is the right one, and is not truncated", () => {
    // ⚠️ A HEAD ANCHOR CANNOT SEE TRUNCATION — truncation eats the TAIL. One anchor near the
    // top and one near the bottom, so a file cut in half satisfies the first and fails the
    // second. Copied deliberately from `driveMode.test.ts`, which derived the reasoning.
    expect(archDoc).toContain("## A. The ownership boundary with mccc");
    expect(
      archDoc,
      "arch/workflow-supervisor.md is TRUNCATED — its last section is missing (a head-only " +
        "check would have passed this). Do not relax the assertions below to compensate.",
    ).toContain("## I. Seams that already existed");
  });
});

describe("⚠️ §B names EVERY Tauri command the supervisor invokes", () => {
  // ⚠️ THE DEFECT THIS FILE WAS WRITTEN FOR. Derive the command list from the code rather than
  // hardcoding it, so adding a fourth `invoke` fails here until the doc names it. A hardcoded
  // list would have to be updated in two places and would drift the same way the prose did.
  const invoked = [...hostSrc.matchAll(/invoke<[^>]*>\(\s*"([a-z_]+)"/g)].map(
    (m) => m[1],
  );

  it("⚠️ is not vacuous — the extraction actually found commands", () => {
    // Without this, an `invoke(` syntax change silently empties the set and every arm below
    // passes over nothing. This is the `[[guard-predicate-completeness-vs-mutation-landing]]`
    // shape: "0 findings" is under-determined unless you pin the population.
    expect(
      invoked.length,
      'no `invoke<...>("name")` calls were extracted from useSupervisor.ts — the call shape ' +
        "changed and this guard is now scanning nothing",
    ).toBeGreaterThanOrEqual(3);
  });

  it.each(["transcript_tail", "wip_read", "supervisor_adjudicate"])(
    "the code still invokes %s (the doc's table is pinned to a real call)",
    (cmd) => {
      expect(invoked).toContain(cmd);
    },
  );

  it("⚠️ every invoked command is NAMED in the doc", () => {
    // ⚠️ THIS IS THE ARM THAT WOULD HAVE CAUGHT THE ORIGINAL BUG. Before the fix the doc
    // named two of the three; `supervisor_adjudicate` appeared nowhere in §B.
    for (const cmd of invoked) {
      expect(
        archDoc,
        `arch/workflow-supervisor.md does not name the Tauri command \`${cmd}\`, which ` +
          `useSupervisor.ts invokes. The doc is the AS-BUILT AUTHORITY — an unnamed command ` +
          `means a reader auditing "what crosses into Rust?" gets a wrong answer.`,
      ).toContain(cmd);
    }
  });

  it("⚠️ the doc does NOT re-assert the retracted two-command exclusivity", () => {
    // ⚠️ ANCHORED TO THE EXACT RETRACTED PHRASE, not to the word "only" — the doc legitimately
    // uses "only" elsewhere (e.g. "file IO only"), and a bare-word check would either false-fire
    // or, worse, be loosened by the next reader until it matched nothing. Same asymmetry the
    // `driveMode.test.ts` comment records for `autopilot`.
    const flattened = archDoc.replace(/\s+/g, " ");
    expect(
      flattened,
      "the retracted claim is back: §B once said Rust exposes transcript_tail and wip_read " +
        "'and nothing else', which is false — supervisor_adjudicate is a third command.",
    ).not.toContain("`wip_read` and nothing else");
  });
});

describe("⚠️ §C states BOTH policy-cell counts, not one of them", () => {
  // ⚠️ `policy.ts`'s own header warns: "FIVE upstream values, SIX modeled arms. Do not
  // 'simplify' the count in either direction without reading both comments." The doc OUTRANKS
  // that comment, so a one-sided count there is the exact simplification the code warns against
  // — and the first draft made it.
  // ⚠️ THE CHARACTER CLASS MUST INCLUDE `/` — `n/a` IS AN ARM. A `[a-z-]+` class silently
  // drops it and yields FIVE, which is indistinguishable from a real regression in the code
  // *and* looks like confirmation of the very one-sided count this guard exists to reject.
  // That is exactly `[[invalid-probe-and-real-hole-look-identical]]`: the first draft of this
  // guard used `[a-z-]+`, reported 5, and the correct response was to fix the PROBE — not to
  // "correct" a doc that was right.
  const modeledArms = [
    ...policySrc.matchAll(/readonly kind:\s*"([a-z/-]+)"/g),
  ].map((m) => m[1]);

  it("⚠️ is not vacuous — the union extraction found arms", () => {
    expect(
      modeledArms.length,
      'no `readonly kind: "..."` arms were extracted from policy.ts — the union\'s shape ' +
        "changed and this guard is scanning nothing",
    ).toBeGreaterThanOrEqual(6);
  });

  it("⚠️ the doc names the modeled arm count, and it matches the code", () => {
    const unique = new Set(modeledArms);
    expect(
      unique.size,
      "the PolicyCell union's arm count changed. The doc states it explicitly, so update " +
        "arch/workflow-supervisor.md §C in the same change.",
    ).toBe(6);
    expect(archDoc).toContain("SIX ARMS");
  });

  it("⚠️ the doc names `confirm` — the arm the first draft omitted", () => {
    // The sixth arm is the one a five-value summary drops, because it is absent from the
    // upstream vocabulary. It is exactly the omission that made the original §C one-sided.
    expect(modeledArms).toContain("confirm");
    expect(
      archDoc,
      "arch/workflow-supervisor.md §C no longer names `confirm`, the sixth modeled arm — " +
        "which is the omission that made the first draft's count one-sided.",
    ).toContain("`confirm`");
  });
});
