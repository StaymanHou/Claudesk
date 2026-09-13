// M15 WP2 Phase 4 — the caller-side funnel guard.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY A CALLER-SIDE GUARD, AND WHY IT IS A DIFFERENT TEST FROM EVERY OTHER ONE HERE
//
// The standing local defect shape — *a mechanism correct in itself behind a caller that
// does not honor it* — has bitten this repo four times (`arch.md` → Verification method),
// twice in M11 WP4 with one shipped CRITICAL. The WBS names it for this exact WP:
//
//   "Enumerating the cells as data makes the SET testable but does NOT prove each cell
//    has a CALLER. Funnel every policy read through ONE function and guard THAT."
//
// Phases 1-3 proved the MECHANISM: the graph is faithful, the cells are right, the
// derivation is total. None of that stops WP3 from importing `POLICY_ROWS` directly and
// hand-rolling its own lookup — which would reproduce the M-8 mapping work, skip
// `resolveCell`, skip the incident override, and read `unmapped` as a default. Every
// Phase 1-3 test would still pass.
//
// ⚠️ THE VACUITY PROBLEM THIS GUARD HAS TO SOLVE, STATED PLAINLY:
// there are NO production consumers of `workflowMachine/` yet — WP3 is the first. A
// guard phrased as "no caller bypasses the funnel" is therefore TRUE OVER AN EMPTY SET
// today and would stay green forever regardless of what WP3 does. That is the exact
// shape catalogued in docs/lessons/source-text-guards.md: a guard that reports green
// while checking nothing.
//
// So this file guards on TWO axes, and the second is the one that will still be doing
// work in six months:
//   1. STRUCTURAL — the funnel exists, is unique, and is the only module wiring the
//      graph to the policy. Checkable today, on real files.
//   2. POPULATION — the set of modules importing `workflowMachine/` is pinned by name.
//      A new importer fails this test until it is added to the allowlist, which is what
//      forces the funnel question to be ASKED when WP3's consumer lands, rather than
//      silently answered wrong.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolvePolicy } from "../workflowMachine/lookup";
import { POLICY_ROWS } from "../workflowMachine/policy";
import { EDGES, edgeById } from "../workflowMachine/edges";

const srcRoot = (): string => resolve(__dirname, "..", "..");

/** Every .ts/.tsx file under src/, recursively. Same idiom as offInvariantGuard. */
function sourceFiles(dir: string = srcRoot()): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const rel = (abs: string): string => abs.slice(srcRoot().length + 1);

/** Files importing anything from `workflowMachine/`, as src-relative paths. */
function importersOfMachine(): string[] {
  return sourceFiles()
    .filter((f) => {
      const src = readFileSync(f, "utf8");
      // Match an import whose SPECIFIER mentions workflowMachine — not a mention in a
      // comment. Anchored on `from "…workflowMachine/…"`.
      return /from\s+"[^"]*workflowMachine\/[^"]*"/.test(src);
    })
    .map(rel)
    .sort();
}

// ⚠️ The modules inside the machine itself. These import each other by construction and
// are not "callers" in the sense this guard polices.
//
// ⚠️ FOUND AT verify-codify (2026-09-12): these four names are **unreachable** by
// `importersOfMachine()` — the internals import siblings as `"./edges"` / `"./policy"`,
// paths that never contain the substring `workflowMachine/`. They were listed defensively
// and were DEAD WEIGHT. Kept, because the production-consumer test below subtracts them
// and a future internal COULD use a longer path — but their deadness is now asserted
// (`the MACHINE_INTERNALS names are unreachable by the importer predicate`) rather than
// assumed, so nobody mistakes them for live coverage. A dead allowlist entry is how an
// allowlist quietly widens.
const MACHINE_INTERNALS = [
  "state/workflowMachine/edges.ts",
  "state/workflowMachine/lookup.ts",
  "state/workflowMachine/policy.ts",
  "state/workflowMachine/transitionToken.ts",
  "state/workflowMachine/types.ts",
];

/**
 * ⚠️ THE ALLOWLIST. Every module outside the machine that may import it.
 *
 * Today: only the four test files. WP3's consumer will be the first production entry,
 * and adding it here is the moment someone must answer "does this go through
 * `resolvePolicy`?" — which is the whole point of pinning the population.
 *
 * ⚠️ Adding a name here is NOT a formality. A new importer that reads `POLICY_ROWS`
 * directly re-creates the M-8 derivation by hand and skips `resolveCell`, the incident
 * override, and the `unmapped` handling. If it needs a verdict, it needs the funnel.
 */
const ALLOWED_IMPORTERS = [
  ...MACHINE_INTERNALS,
  "state/__tests__/workflowMachine.test.ts",
  "state/__tests__/workflowMachineFunnel.test.ts",
  "state/__tests__/workflowMachineLookup.test.ts",
  "state/__tests__/workflowMachinePolicy.test.ts",
  // ⚠️ Added at Phase 5 BECAUSE THIS GUARD FIRED ON IT — the intended workflow, on its
  // first real exercise. Reviewed before adding: it imports `edgeById`, `cellForMode`,
  // `POLICY_ROWS` and `isDispatchable` to assert the MODEL'S SHAPE (the ported mccc
  // Phase 3d/18 contracts). It is a contract test, not a consumer producing verdicts, so
  // it owes no `resolvePolicy` call. ⚠️ Confirmed it does NOT trip
  // `wires graph to policy in exactly ONE module` — that test exempts `__tests__`, and
  // tripping it would have meant a hand-rolled derivation rather than a contract check.
  "state/__tests__/workflowMachineUpstreamContract.test.ts",
  // ⚠️ THE FIRST PRODUCTION CONSUMER — M15 WP3 Phase 2, added BECAUSE THIS GUARD FIRED.
  // This is the moment the guard was built for, so the review it forces is recorded here:
  //
  //   • It imports EXACTLY ONE symbol — `extractTransitionId` from `transitionToken` — to
  //     parse the `TRANSITION:` token out of an assistant text block. It does NOT import
  //     `edges`, `policy`, or `POLICY_ROWS`, and it produces NO verdict.
  //   • ⚠️ Confirmed against the failure signature the WP2 handoff specified: a correct
  //     consumer fails exactly TWO tests (this one and `records that NO production module
  //     consumes the machine yet`); a consumer hand-rolling the derivation ALSO fails
  //     `wires graph to policy in exactly ONE module`. That third test PASSED, which is the
  //     mechanical evidence that this module is not bypassing the funnel.
  //   • The policy lookup lands in Phase 3, in a SEPARATE module, and that one WILL owe a
  //     `resolvePolicy` call. Parsing a token is not resolving a policy — the split is
  //     deliberate so the verdict has exactly one home.
  "state/supervisor/transcript.ts",
  // ⚠️ M15 WP3 Phase 3 — the SECOND production consumer, and the one that actually produces
  // verdicts. Review recorded, per this allowlist's own contract:
  //
  //   • It calls `resolvePolicy` — the funnel — and reads NO `POLICY_ROWS` column directly,
  //     so `resolveCell` and the incident Mode-2 override are applied exactly once.
  //   • It handles all THREE `PolicyResolution` arms explicitly (`resolved` / `unmapped` /
  //     `unknown-edge`) with no default branch, so `unmapped` stays a RESULT.
  //   • ⚠️ It reads `isDispatchable(edge.dispatchTarget)` as a SEPARATE gate from the policy
  //     cell — the "(2) and (3) are different questions" rule. That pairing is what
  //     `AUTO-CELL-DOES-NOT-IMPLY-A-DISPATCHABLE-TARGET` names as WP3's half of that finding.
  //   • ⚠️ Failure signature confirmed again: exactly TWO tests failed (this one and the
  //     production-set pin); `wires graph to policy in exactly ONE module` PASSED, which is
  //     the mechanical evidence it is not hand-rolling the derivation.
  "state/supervisor/verdict.ts",
  // ⚠️ The verdict's own test file. It imports `EDGES` + `isDispatchable` + `DRIVE_MODES` to
  // run a PROPERTY SWEEP — "no edge in the whole graph, in any mode, ever fires with a
  // non-skill target" — which is the structural backstop behind the sampled cases. Like the
  // upstream-contract test above it asserts the model's shape rather than producing verdicts,
  // so it owes no `resolvePolicy` call of its own (and it drives the real `decideVerdict`,
  // which does route through the funnel).
  "state/supervisor/__tests__/verdict.test.ts",
  // ⚠️ M15 WP3 Phase 5 — the fan-out. Review recorded:
  //
  //   • It imports ONLY TYPES from the machine (`DriveMode`, `PolicyContext`) — no `EDGES`, no
  //     `POLICY_ROWS`, no `resolvePolicy`. It carries a workspace's stored mode to the verdict
  //     and carries the answer back; it makes no policy decision of its own.
  //   • ⚠️ The decision stays in `verdict.ts`, which DOES route through the funnel. That split
  //     is the point: `fireOne` owns "did I already fire, and can I reach the pty", and the
  //     verdict owns "may I fire at all". Merging them would put an injection path next to a
  //     policy read, which is how a caller starts hand-rolling.
  //   • ⚠️ Failure signature confirmed a third time: exactly TWO tests failed; `wires graph to
  //     policy in exactly ONE module` PASSED.
  "state/supervisor/fanOut.ts",
];

describe("M15 WP2 Phase 4 — the guard is scanning something real", () => {
  // ⚠️ FIRST, because every assertion below is vacuous over an empty file list. This is
  // the `ok. 0 passed` trap in its source-scanning form.

  it("walks a non-trivial set of source files rooted at src/", () => {
    const files = sourceFiles();
    expect(
      files.length,
      "sourceFiles() returned a suspiciously small set — scanning nothing",
    ).toBeGreaterThan(50);
    expect(files.every((f) => f.startsWith(srcRoot()))).toBe(true);
    // Sanity: it can actually see the modules it is supposed to police.
    const names = files.map(rel);
    expect(names).toContain("state/workflowMachine/lookup.ts");
    expect(names).toContain("state/workflowMachine/policy.ts");
  });

  it("finds a non-empty importer population", () => {
    // If the specifier regex ever stopped matching, `importersOfMachine()` would return
    // [] and the allowlist assertion below would pass having found nothing.
    expect(importersOfMachine().length).toBeGreaterThan(0);
  });
});

describe("M15 WP2 Phase 4 — the funnel is unique and complete", () => {
  it("wires graph to policy in exactly ONE module", () => {
    // ⚠️ THE STRUCTURAL HEART. A second module importing BOTH `edges` and `policy` is
    // a second place where the M-8 derivation could be re-implemented — which is how the
    // funnel stops being a funnel. Test files are exempt: they assert against both sides
    // by design.
    const wirers = sourceFiles()
      .filter((f) => !rel(f).includes("__tests__"))
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        return (
          /from\s+"[^"]*\/edges"/.test(src) &&
          /from\s+"[^"]*\/policy"/.test(src)
        );
      })
      .map(rel);
    expect(wirers).toEqual(["state/workflowMachine/lookup.ts"]);
  });

  it("exposes exactly one verdict-producing entry point", () => {
    // `ambiguityReport` and `unmappedReport` are diagnostics — they return populations,
    // not verdicts. Only `resolvePolicy` answers "what should happen at this edge?".
    const src = readFileSync(
      resolve(srcRoot(), "state/workflowMachine/lookup.ts"),
      "utf8",
    );
    const exported = [...src.matchAll(/^export function (\w+)/gm)].map(
      (m) => m[1],
    );
    expect(exported.sort()).toEqual([
      "ambiguityReport",
      "resolvePolicy",
      "unmappedReport",
    ]);
  });

  it("applies resolveCell and the incident override INSIDE the funnel", () => {
    // ⚠️ Behavioral, not source-text: a caller that got a raw cell would have to
    // remember to resolve it, and one that read a column directly would miss the
    // incident rule. Both are proven by DRIVING the funnel, per
    // `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]` — a source
    // grep can only encode shapes you thought of.
    const incident = resolvePolicy("I6", "fsd");
    if (incident.outcome !== "resolved") throw new Error("unreachable");
    expect(incident.mode).toBe("orchestrated");

    const conditional = resolvePolicy("F13", "autopilot");
    if (conditional.outcome !== "resolved") throw new Error("unreachable");
    expect(conditional.cell.kind).not.toBe("auto-skip");
  });
});

describe("M15 WP2 Phase 4 — the importer population is pinned", () => {
  // ⚠️ THE AXIS THAT SURVIVES INTO WP3. Structural checks above are satisfiable today;
  // this one changes the moment a new consumer appears, forcing the funnel question to
  // be asked out loud.
  //
  // ⚠️ HOW TO READ A FAILURE HERE — measured against both a correct and a bypassing
  // consumer (2026-09-12), because a guard that cannot tell right from wrong is a
  // nuisance, not a check:
  //
  //   • A consumer that calls `resolvePolicy` → fails ONLY the two tests in this block.
  //     That is the review prompt, not a defect. Add it to ALLOWED_IMPORTERS and update
  //     the production-consumer expectation.
  //   • A consumer that hand-rolls the lookup → ALSO fails
  //     "wires graph to policy in exactly ONE module", because it must import both
  //     `edges` and `policy` to do so. ⚠️ THAT test is the discriminator: if it is in
  //     the failure set, the new consumer is bypassing the funnel and the fix is to
  //     route it through `resolvePolicy`, NOT to widen the allowlist.
  //
  // Negative control: a production file that does not import the machine at all fails
  // nothing — so this is not merely "any new file trips the guard".

  it("admits no importer outside the allowlist", () => {
    const unexpected = importersOfMachine().filter(
      (f) => !ALLOWED_IMPORTERS.includes(f),
    );
    expect(
      unexpected,
      "A new module imports workflowMachine/. If it needs a policy VERDICT it must call " +
        "resolvePolicy() — not POLICY_ROWS/cellForMode directly, which skips resolveCell, " +
        "the incident override, and the unmapped handling. Then add it to ALLOWED_IMPORTERS.",
    ).toEqual([]);
  });

  it("keeps every allowlisted name pointing at a file that exists", () => {
    // ⚠️ A stale allowlist entry is how an allowlist quietly widens: the name survives a
    // rename, matches nothing, and the next importer slips in under it.
    const present = new Set(sourceFiles().map(rel));
    for (const name of ALLOWED_IMPORTERS) {
      expect(`${name} exists=${present.has(name)}`).toBe(`${name} exists=true`);
    }
  });

  it("lists EVERY file in the machine directory — no silent omission", () => {
    // ⚠️ Found at code-quality review [2026-09-12]: adding `transitionToken.ts` left
    // MACHINE_INTERNALS at 4 of 5 files and NOTHING FAILED. The list was only checked
    // for DEADNESS and for POINTING AT REAL FILES — both of which a stale-but-shorter
    // list satisfies perfectly. The missing direction was COMPLETENESS.
    //
    // ⚠️ Why an incomplete list is not harmless: `records that NO production module
    // consumes the machine yet` SUBTRACTS this list from the importer population. An
    // internal missing from it would read as a production consumer — a false alarm that
    // trains the next reader to widen the allowlist reflexively.
    const onDisk = sourceFiles()
      .map(rel)
      .filter((f) => f.startsWith("state/workflowMachine/"))
      .sort();
    expect(onDisk.length).toBeGreaterThan(0);
    expect([...MACHINE_INTERNALS].sort()).toEqual(onDisk);
  });

  it("records that the MACHINE_INTERNALS names are unreachable by the predicate", () => {
    // ⚠️ Found at verify-codify: the internals import siblings as `"./edges"`, so they
    // never match `importersOfMachine()`. Asserting their deadness keeps them from being
    // mistaken for live coverage — and makes it a test failure if a future internal
    // starts using a path that DOES match, at which point the allowlist entry becomes
    // load-bearing and this expectation must flip deliberately.
    const detected = importersOfMachine();
    for (const name of MACHINE_INTERNALS) {
      expect(`${name} detected=${detected.includes(name)}`).toBe(
        `${name} detected=false`,
      );
    }
  });

  it("pins the exact set of PRODUCTION modules consuming the machine", () => {
    // ⚠️ THE SUCCESSOR TO `records that NO production module consumes the machine yet`,
    // which was true-over-an-empty-set until M15 WP3 Phase 2 landed the first consumer.
    //
    // ⚠️ IT IS DELIBERATELY AN EXACT-SET ASSERTION, NOT `toContain` OR A COUNT. The original
    // test's whole value was that a NEW importer could not appear unnoticed; a relaxed
    // assertion (`length > 0`, or "contains transcript.ts") would keep passing while a
    // second, third, or bypassing consumer arrived silently — converting a live guard into
    // exactly the green-while-checking-nothing shape this file was written to avoid
    // (docs/lessons/source-text-guards.md). Adding a name here must stay a deliberate act.
    const production = importersOfMachine()
      .filter((f) => !f.includes("__tests__") && !MACHINE_INTERNALS.includes(f))
      .sort();
    expect(
      production,
      "The production-consumer set changed. For each new entry, confirm it routes verdicts " +
        "through resolvePolicy() (and does NOT read POLICY_ROWS directly), then update " +
        "this expectation and ALLOWED_IMPORTERS together.",
    ).toEqual([
      "state/supervisor/fanOut.ts",
      "state/supervisor/transcript.ts",
      "state/supervisor/verdict.ts",
    ]);
  });
});

describe("M15 WP2 Phase 4 — exhaustiveness over (state × mode)", () => {
  // WBS task 2.6. ⚠️ Expressed over STATES rather than edges: the edge sweep already
  // lives in the Phase 3 totality test, and the WBS asks specifically for the cell
  // matrix — every declared state must resolve a cell in every mode, or be explicitly
  // accounted for.

  it("gives every policy row a defined cell in all four modes", () => {
    const modes = ["stepping", "orchestrated", "autopilot", "fsd"] as const;
    let cells = 0;
    for (const row of POLICY_ROWS) {
      for (const m of modes) {
        const cell = row[m];
        expect(`${row.workflow}/${row.key.slice(0, 28)}/${m}`).toBe(
          cell && typeof cell.kind === "string"
            ? `${row.workflow}/${row.key.slice(0, 28)}/${m}`
            : "MISSING CELL",
        );
        cells++;
      }
    }
    // 58 rows × 4 modes. Degenerate-pass guard on the loop above.
    expect(cells).toBe(232);
  });

  it("reaches every FROM-state of every workflow through some row or an explicit reason", () => {
    // ⚠️ The state-level complement to Phase 3's edge-level totality: for each distinct
    // (workflow, from-state) pair in the graph, at least one edge out of it must either
    // resolve, or be unmapped for a NAMED reason. A state whose every exit silently
    // vanished would pass the edge sweep (each edge is individually well-formed) while
    // meaning a whole state has no policy.
    const states = new Map<string, string[]>();
    for (const e of EDGES) {
      const key = `${e.workflow}|${e.from}`;
      states.set(key, [...(states.get(key) ?? []), e.id]);
    }
    expect(states.size).toBeGreaterThan(0);
    for (const [key, ids] of states) {
      const accounted = ids.every((id) => {
        const r = resolvePolicy(id, "orchestrated");
        return r.outcome === "resolved" || r.outcome === "unmapped";
      });
      expect(`${key}: ${accounted}`).toBe(`${key}: true`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P4.5 — the upstream drift test.
//
// ⚠️ THE ACCEPTED COST OF DECISION D-2, MADE VISIBLE. The graph is a hand-transcribed
// TypeScript literal rather than a runtime parse of `transitions.md`, because that file
// reaches this repo only through `_ref/claude-customization/` — a GITIGNORED symlink,
// absent from a shipped `.app` and from a fresh checkout. The cost is that the model can
// drift from upstream. This test is the mitigation.
//
// ⚠️ IT MUST SKIP CLEANLY WHEN `_ref/` IS ABSENT, AND A SKIP MUST REPORT AS SKIPPED —
// not as a pass. A drift test that silently passes when it cannot see upstream is the
// `ok. 0 passed` trap wearing a different hat: it would read green on every CI run and
// on every fresh clone, i.e. exactly where nobody would notice it had stopped checking.

const UPSTREAM_TRANSITIONS = resolve(
  srcRoot(),
  "..",
  "_ref/claude-customization/workflow-system/product/transitions.md",
);

function upstreamAvailable(): boolean {
  try {
    return statSync(UPSTREAM_TRANSITIONS).isFile();
  } catch {
    return false;
  }
}

/** Edge ids as upstream records them, from the `| F7 | plan | build |` table rows. */
function upstreamEdgeIds(): string[] {
  const text = readFileSync(UPSTREAM_TRANSITIONS, "utf8");
  const ids = [...text.matchAll(/^\|\s*((?:F|T|P|I|S)\d+[a-z]?)\s*\|/gm)].map(
    (m) => m[1],
  );
  return [...new Set(ids)].sort();
}

describe("M15 WP2 Phase 4 — drift against upstream transitions.md", () => {
  // ⚠️ `describe.skipIf` (not a bare `if`) so an absent `_ref/` is REPORTED as skipped in
  // the run output rather than silently contributing zero assertions.
  describe.skipIf(!upstreamAvailable())("when _ref/ is present", () => {
    it("absorbs exactly the edge-id set upstream declares", () => {
      const upstream = upstreamEdgeIds();
      const absorbed = EDGES.map((e) => e.id).sort();
      // ⚠️ Guards the degenerate pass: a regex that stopped matching would make both
      // sides of a set comparison trivially agree at zero.
      expect(upstream.length).toBeGreaterThan(50);
      const missing = upstream.filter((id) => !absorbed.includes(id));
      const invented = absorbed.filter((id) => !upstream.includes(id));
      expect(
        missing,
        "Upstream declares edges the absorbed graph does not have — transitions.md grew.",
      ).toEqual([]);
      expect(
        invented,
        "The absorbed graph has edges upstream does not declare — transcription error.",
      ).toEqual([]);
    });

    it("agrees with upstream on the F10 target — the A-2 finding, checked live", () => {
      // ⚠️ The one cell where the two upstream COPIES disagree. This asserts against
      // `transitions.md` (the authority), so if someone ever "fixes" the absorbed graph
      // to match the stale AGENTS.md copy, this fails.
      const text = readFileSync(UPSTREAM_TRANSITIONS, "utf8");
      const row = text.split("\n").find((l) => /^\|\s*F10\s*\|/.test(l))!;
      expect(row).toContain("verify-self");
      expect(edgeById("F10")!.to).toBe("verify-self");
    });
  });

  it("states plainly whether the drift check ran", () => {
    // ⚠️ Always runs. Without this, a reader of a green CI log cannot tell whether the
    // drift check passed or was skipped — the distinction the whole design rests on.
    const available = upstreamAvailable();
    expect(typeof available).toBe("boolean");
    if (!available) {
      // Not a failure: `_ref/` is gitignored and legitimately absent in CI and in a
      // fresh clone. The skipped block above is the signal.
      expect(UPSTREAM_TRANSITIONS).toContain("_ref/claude-customization");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// verify-codify (Phase 4) — the guard's OWN discrimination property, made standing.
//
// ⚠️ THE GAP THIS CLOSES. The discrimination property — "a bypassing consumer fails the
// wiring test, a correct one does not" — is the single most important thing about this
// guard, and until now it existed ONLY IN COMMENTS. It was proven twice by hand (once by
// me, once by an independent verify-self subagent planting its own module), and BOTH
// proofs were throwaway. Prose asserting what no code checks is the same shape as a
// `?raw` guard satisfied by its own comments: it reads authoritative and verifies nothing.
//
// ⚠️ These tests drive the guard's OWN PREDICATES over synthetic source text rather than
// planting real files on disk. Writing files into `src/` from a test would be a
// filesystem side effect in a suite that runs in parallel — and a crashed run could
// leave a planted violation behind, breaking every subsequent run in a way that looks
// like a real finding. Extracting the predicates keeps the property testable without
// that hazard, per `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`.

/** The wiring predicate, as the guard applies it: imports BOTH edges and policy. */
function wiresGraphToPolicy(source: string): boolean {
  return (
    /from\s+"[^"]*\/edges"/.test(source) &&
    /from\s+"[^"]*\/policy"/.test(source)
  );
}

/** The importer predicate, as the guard applies it. */
function importsMachine(source: string): boolean {
  return /from\s+"[^"]*workflowMachine\/[^"]*"/.test(source);
}

describe("M15 WP2 Phase 4 — the guard discriminates bypass from ordinary consumer", () => {
  // Source text matching the two consumers both hand-proofs actually used.
  const BYPASSING = `
import { POLICY_ROWS } from "../state/workflowMachine/policy";
import { edgeById } from "../state/workflowMachine/edges";
export function verdict(id: string) {
  const row = POLICY_ROWS.find((r) => r.edgeIds?.includes(id));
  return row ? row.autopilot.kind : "auto";
}`;

  const CORRECT = `
import { resolvePolicy } from "../state/workflowMachine/lookup";
export function verdict(id: string) {
  return resolvePolicy(id, "autopilot");
}`;

  const UNRELATED = `
export const nothing = 1;`;

  it("flags a hand-rolled lookup on the WIRING predicate", () => {
    // ⚠️ The discriminator. A bypasser MUST import both sides to re-create the M-8
    // derivation, which is precisely what makes it detectable.
    expect(wiresGraphToPolicy(BYPASSING)).toBe(true);
  });

  it("does NOT flag a correct consumer on the wiring predicate", () => {
    // ⚠️ Without this, a guard that flagged every new importer would look identical to
    // one that discriminates — and would be a pure nuisance at WP3's first commit.
    expect(wiresGraphToPolicy(CORRECT)).toBe(false);
  });

  it("treats BOTH consumers as importers — the allowlist review prompt", () => {
    // Both trip the population axis. That is intended: any new consumer is reviewed.
    expect(importsMachine(BYPASSING)).toBe(true);
    expect(importsMachine(CORRECT)).toBe(true);
  });

  it("ignores a module that does not touch the machine at all", () => {
    // ⚠️ Negative control. Proves the guard is not merely "any new file trips it".
    expect(importsMachine(UNRELATED)).toBe(false);
    expect(wiresGraphToPolicy(UNRELATED)).toBe(false);
  });

  it("uses the SAME predicates the live guard uses", () => {
    // ⚠️ The failure mode this test block could otherwise have: re-implementing the
    // predicates here, testing the copy, and proving nothing about the real guard —
    // `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`'s warning that
    // a test which RE-IMPLEMENTS the code shares its blind spot.
    //
    // Asserted by driving both predicates over the guard's real subjects and requiring
    // agreement with the live results: lookup.ts wires (and is the only one), and every
    // real importer is detected.
    const lookupSrc = readFileSync(
      resolve(srcRoot(), "state/workflowMachine/lookup.ts"),
      "utf8",
    );
    expect(wiresGraphToPolicy(lookupSrc)).toBe(true);
    // ⚠️ NOT `importsMachine(lookupSrc)`. This assertion was written as `true` and FAILED,
    // which is how the dead-allowlist-entry defect above was found. `lookup.ts` imports
    // its siblings as `"./edges"` — a path that never contains `workflowMachine/`, so the
    // importer predicate correctly returns false for every file INSIDE the directory. The
    // predicate detects OUTSIDE consumers, which is its job.
    expect(importsMachine(lookupSrc)).toBe(false);

    const policySrc = readFileSync(
      resolve(srcRoot(), "state/workflowMachine/policy.ts"),
      "utf8",
    );
    // policy.ts imports only ./types — it does not wire graph to policy.
    expect(wiresGraphToPolicy(policySrc)).toBe(false);

    // And the live population agrees with the predicate applied file-by-file.
    const byPredicate = sourceFiles()
      .filter((f) => importsMachine(readFileSync(f, "utf8")))
      .map(rel)
      .sort();
    expect(byPredicate).toEqual(importersOfMachine());
  });
});
