import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ═══════════════════════════════════════════════════════════════════════════════
// ONE AUTHORITY PER RULE (paydown 2026-11-04 WP14, the comment-convention pass).
//
// A rationale or measurement stated in several files drifts asymmetrically: the copy someone
// edits becomes right, and the others keep asserting the old thing with equal confidence. Trimming
// a little at each review was measured as NOT converging (one file was flagged in four consecutive
// reviews). What held was M13 WP4's latency pin (`recycleSession.test.ts`): one home for the fact,
// a pointer everywhere else, and a guard. This file is that guard, generalized to a table.
//
// Each `once` rule names its AUTHORITY file(s) and FINGERPRINTS: exact phrases from the fact. No
// file in the rule's scope other than an authority may contain a fingerprint, and every authority
// must contain every fingerprint (the anti-vacuity half: deleting the fact everywhere would
// otherwise "fix" the duplication). Each `absent` rule lists files that must not carry WIP-local
// labels (phase or mutant ids that stop resolving once the WIP is archived).
//
// ⚠️ WHAT THIS DOES NOT CHECK, so it is not assumed:
//   - A PARAPHRASE. Matching is on exact phrases (comment leaders stripped, whitespace collapsed),
//     so restating a rationale in new words passes. It stops copy-paste regrowth, which is how
//     every instance in the WP14 roster arose; it is not a semantic check.
//   - Files outside SCOPE_ROOTS: `CLAUDE.md` (a harness-loaded rule index that restates with a
//     pointer by design), `workflow-system/product/*.md` outside `arch/` (the historical record),
//     the backlog files, `CHANGELOG.md` and every archive.
//   - A rule's `scope`, when given, narrows it to the module family its finding named. A fact
//     cited widely as a lesson (for example the caller-does-not-honor-the-mechanism shape) is
//     policed only there; elsewhere it may still be restated.
// ═══════════════════════════════════════════════════════════════════════════════

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** Where the guard looks, relative to the repo root. Files and directories. */
const SCOPE_ROOTS = [
  "src",
  "src-tauri/src",
  "src-tauri/tests",
  "src-tauri/Cargo.toml",
  "tooling",
  "docs/lessons",
  "workflow-system/product/arch",
];

const SCANNED_EXT = /\.(tsx?|mjs|cjs|js|css|rs|toml|md)$/;
/** This file: it holds every fingerprint, as data. */
const SELF = "src/__tests__/singleAuthority.test.ts";
/** Never scanned: dependencies, generated output, and the frozen adjudicator evidence set. */
const SKIPPED = [
  /\/node_modules\//,
  /\.generated\./,
  /^tooling\/adjudicator-probe\/.*\.json$/,
  /^src-tauri\/target\//,
];

type Rule =
  | {
      kind: "once";
      id: string;
      /** The file(s) that own the fact, repo-relative. */
      authority: string[];
      fingerprints: string[];
      /** Narrows the rule to these repo-relative prefixes (default: every scanned file). */
      scope?: string[];
    }
  | {
      kind: "absent";
      id: string;
      files: string[];
      pattern: RegExp;
    };

const RULES: Rule[] = [
  {
    kind: "once",
    id: "a Vitest import reads a missing export as undefined, and check:link's blind spots",
    authority: ["docs/lessons/verify-auto-gate.md"],
    fingerprints: ["[1, null]", "destructured at the", "reads the binding as"],
  },
  {
    kind: "once",
    id: "the cc_kill → poll_reaped → sleep chain that froze the app",
    authority: [
      "src-tauri/tests/sync_commands_do_not_block.rs",
      "docs/lessons/pip-nspanel-main-thread.md",
    ],
    fingerprints: ["→ `poll_reaped`"],
  },
  {
    kind: "once",
    id: "the narrow adjudicator router's miss rate",
    authority: ["src/state/supervisor/adjudicator.ts"],
    fingerprints: ["40 of 96", "10 of 32", "70%-concentration"],
  },
  {
    kind: "once",
    id: "the transcript's scanned total drifts within one session",
    authority: ["src-tauri/src/transcript/mod.rs"],
    fingerprints: ["2282", "2284"],
  },
  {
    kind: "once",
    id: "the caller-does-not-honor-the-mechanism shape, within the state machines",
    authority: ["src/state/supervisor/turnEnd.ts"],
    fingerprints: ["has bitten this repo four times"],
    scope: ["src/state"],
  },
  {
    kind: "once",
    id: "the M16.5 WP2 adjudicator re-measurement figures",
    // The arch doc is the as-built record; the test asserts the figures (they are in its name).
    authority: [
      "workflow-system/product/arch/workflow-supervisor.md",
      "src/state/supervisor/__tests__/adjudicatorRemeasure.test.ts",
    ],
    fingerprints: ["95/103", "126/188"],
  },
  {
    kind: "once",
    id: "why the chord map is typed data, not a comment",
    authority: ["src/components/workspace/chordRegistry.ts"],
    fingerprints: ["ALREADY INCOMPLETE when extracted"],
  },
  {
    kind: "once",
    id: "why the supervisor toggle is not merged with the drive-mode modules",
    authority: ["src/cc/workspaceSupervisor.ts"],
    fingerprints: ["different storage key"],
  },
  {
    kind: "once",
    id: "Recycle is an operation, not a skill button",
    authority: ["src/components/workspace/recycleButton.ts"],
    fingerprints: ["multi-step OPERATION"],
  },
  {
    kind: "once",
    id: "why the PiP panel is denylisted from window-state persistence",
    authority: ["src-tauri/src/window_state/mod.rs"],
    fingerprints: ["top-right anchor"],
  },
  {
    kind: "once",
    id: "why the deleted inert jump-turn state must not come back",
    authority: ["src/App.css"],
    fingerprints: ["two mechanisms for one job"],
  },
  {
    kind: "once",
    id: "the unwired planPanelChange instance of the live-caller lesson",
    authority: ["src/components/workspace/prompt/promptDraftSync.ts"],
    fingerprints: ["exported, documented and", "worse than no function at all"],
  },
  {
    kind: "once",
    id: "why the Prompt send guard was inverted rather than deleted",
    authority: [
      "src/components/workspace/prompt/__tests__/promptDraftSync.test.ts",
    ],
    fingerprints: ["traded a real invariant for nothing"],
  },
  {
    kind: "once",
    id: "why the Prompt send chords are inert outside the Prompt panel",
    authority: ["src/components/workspace/prompt/promptSendRouting.ts"],
    fingerprints: ["unrecoverable write into a live conversation"],
  },
  {
    kind: "once",
    id: "injectCommand cannot be retried or cancelled, within the workspace components",
    authority: ["src/components/workspace/autoResumeFire.ts"],
    fingerprints: ["no pre-send cancel window"],
    scope: ["src/components/workspace"],
  },
  {
    kind: "once",
    id: "the OFF-invariant guard's mechanics (arm 5's premise, probing arms individually)",
    authority: ["src/state/__tests__/offInvariantGuard.test.ts"],
    fingerprints: ["composite bypass that trips", "NO ungated half"],
  },
  // ── WIP-local labels (phase, probe and mutant ids) stop resolving once the WIP is archived.
  // Each file below was cleaned of them in WP14 Phase 2; these stop them coming back there.
  {
    kind: "absent",
    id: "the adjudicator spawn and the sync guard carry no WIP probe labels",
    files: [
      "src-tauri/src/adjudicator/mod.rs",
      "src-tauri/tests/sync_commands_do_not_block.rs",
    ],
    pattern:
      /re-verify \d|verify-self|probe [AB]\b|probe P\d|mutant R\d|\(R\d\)/,
  },
  {
    kind: "absent",
    id: "the M15 fixture test carries no attempt-count history",
    files: ["src/state/__tests__/m15SupervisorFixture.test.ts"],
    pattern: /223 breaks|-> 96|An earlier version/,
  },
  {
    kind: "absent",
    id: "the review player carries no WIP phase labels",
    files: [
      "src/components/workspace/editor/MediaPlayer.tsx",
      "src/components/workspace/editor/mediaClock.ts",
    ],
    pattern: /verify-self|verify-human|WIP →|OQ-\d|decision A\b/,
  },
  {
    kind: "absent",
    id: "the Docs panel modules carry no WIP phase labels",
    files: [
      "src/components/workspace/docs/classifyHref.ts",
      "src/components/workspace/docs/docsReloadDecision.ts",
      "src/components/workspace/docs/resolveDocLink.ts",
      "src/components/workspace/docs/pickInitialDoc.ts",
      "src/components/workspace/docs/handleDocLinkClick.ts",
      "src/components/workspace/docs/pendingRestore.ts",
      "src/components/workspace/docs/DocMarkdown.tsx",
      "src/components/workspace/docs/DocsPanel.tsx",
      "src/components/workspace/docs/fetchLatch.ts",
    ],
    pattern: /verify-self|verify-human|\bWP\d+ P\d|\bP\d+\.\d+\b/,
  },
  {
    kind: "absent",
    id: "the Recycle modules carry no WIP or review labels",
    files: [
      "src/components/workspace/recycleSession.ts",
      "src/state/recycleMachine.ts",
      "src/components/workspace/recycleButton.ts",
    ],
    pattern:
      /verify-self|paydown WP\d|earlier revision|picker MAJOR|\bP\d+\.\d+\b|\(Phase \d\)|WP\d+ Phase \d/,
  },
  {
    kind: "absent",
    id: "window_state carries no provenance narrative",
    files: ["src-tauri/src/window_state/mod.rs"],
    pattern: /verified live at P\d|screenshot|backlog entry|1920×1080/,
  },
  {
    kind: "absent",
    id: "the time-tracking copy guard carries no WIP audit labels",
    files: [
      "src/components/settings/__tests__/settingsTimeTrackingCopy.test.ts",
    ],
    pattern: /Scope-audit|verify-human|this WP/,
  },
];

/** Every scanned file, repo-relative. */
function scannedFiles(): string[] {
  const out: string[] = [];
  const visit = (abs: string) => {
    const rel = relative(repoRoot, abs);
    if (rel === SELF) return;
    if (SKIPPED.some((re) => re.test(rel) || re.test(`/${rel}/`))) return;
    if (statSync(abs).isDirectory()) {
      for (const entry of readdirSync(abs)) visit(join(abs, entry));
    } else if (SCANNED_EXT.test(rel)) {
      out.push(rel);
    }
  };
  for (const root of SCOPE_ROOTS) visit(join(repoRoot, root));
  return out;
}

/**
 * The text a fingerprint is matched against: comment leaders removed from each line, lines
 * joined, whitespace collapsed. So a phrase still matches when a comment wraps it across lines.
 */
function haystack(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8")
    .split("\n")
    .map((line) => line.replace(/^\s*(\/\/[/!]?|\/?\*+\/?|#+|\{\/\*)\s?/, ""))
    .join(" ")
    .replace(/\s+/g, " ");
}

const files = scannedFiles();
const cache = new Map<string, string>();
const textOf = (rel: string) => {
  let t = cache.get(rel);
  if (t === undefined) {
    t = haystack(rel);
    cache.set(rel, t);
  }
  return t;
};

describe("⚠️ each documented rule has exactly ONE authority", () => {
  for (const rule of RULES) {
    if (rule.kind === "once") {
      it(`once: ${rule.id}`, () => {
        const inScope = files.filter(
          (f) => !rule.scope || rule.scope.some((p) => f.startsWith(p)),
        );
        const offenders = inScope.flatMap((f) =>
          rule.authority.includes(f)
            ? []
            : rule.fingerprints
                .filter((fp) => textOf(f).includes(fp))
                .map((fp) => `${f}  ←  "${fp}"`),
        );
        expect(
          offenders,
          `these files restate a fact owned by ${rule.authority.join(" + ")}; replace the ` +
            `restatement with a pointer to it`,
        ).toEqual([]);
      });
      it(`once (anti-vacuity): the authority still carries the fact — ${rule.id}`, () => {
        for (const a of rule.authority) {
          expect(
            existsSync(join(repoRoot, a)),
            `authority ${a} must exist`,
          ).toBe(true);
          for (const fp of rule.fingerprints) {
            expect(
              textOf(a),
              `${a} must still state "${fp}" — the fix for duplication is a pointer, ` +
                `never deleting the fact`,
            ).toContain(fp);
          }
        }
      });
    } else {
      it(`absent: ${rule.id}`, () => {
        for (const f of rule.files) {
          expect(existsSync(join(repoRoot, f)), `${f} must exist`).toBe(true);
          const hits = readFileSync(join(repoRoot, f), "utf8").match(
            new RegExp(rule.pattern.source, "g"),
          );
          expect(hits ?? [], `${f} carries WIP-local labels`).toEqual([]);
        }
      });
    }
  }
});

describe("the guard is not vacuous", () => {
  it("scans a non-trivial set that reaches every scope root and file kind", () => {
    expect(files.length).toBeGreaterThan(300);
    for (const root of SCOPE_ROOTS) {
      expect(
        files.some((f) => f === root || f.startsWith(`${root}/`)),
        `the walker must reach ${root}`,
      ).toBe(true);
    }
    for (const ext of [".ts", ".tsx", ".rs", ".md", ".css", ".mjs", ".toml"]) {
      expect(
        files.some((f) => f.endsWith(ext)),
        `the walker must reach a ${ext} file`,
      ).toBe(true);
    }
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
    expect(files).not.toContain(SELF);
  });

  it("the haystack joins a phrase that a comment wraps across lines", () => {
    // `recycleButton.ts` wraps "multi-step" and "OPERATION" onto two comment lines.
    expect(textOf("src/components/workspace/recycleButton.ts")).toContain(
      "multi-step OPERATION",
    );
  });

  it("every rule is well-formed and every authority is in scope", () => {
    expect(RULES.length).toBeGreaterThan(0);
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RULES) {
      if (r.kind === "once") {
        expect(r.fingerprints.length).toBeGreaterThan(0);
        for (const a of r.authority) expect(files).toContain(a);
      } else {
        expect(r.files.length).toBeGreaterThan(0);
      }
    }
  });
});
