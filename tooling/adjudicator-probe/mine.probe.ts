// M16.5 WP2 Phase 1 — mine the fire candidates (WIP P1.2–P1.5).
//
// Writes `tmp/adjudicator-probe/candidates.json`, full tails and all. It is gitignored; the
// committable, redacted set is `redact.probe.ts`'s job.

import { it } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  M15_PROBE_SLUG,
  isAdjudicatorSession,
  isScratchSlug,
  mineTranscript,
  parseIndexed,
  type Candidate,
  type FileStats,
  type FiredRecord,
} from "./corpus";
import { ACTIVITY_LOG, M15_DIR, OUT, PROJECTS } from "./paths";
import { joinSeeds, type M15Seed } from "./seedJoin";

/** The ≥3× target: M15 scored 70 records. */
const TARGET = 210;

function readFired(): FiredRecord[] {
  if (!existsSync(ACTIVITY_LOG)) return [];
  const out: FiredRecord[] = [];
  for (const raw of readFileSync(ACTIVITY_LOG, "utf8").split("\n")) {
    if (!raw.trim()) continue;
    try {
      const r = JSON.parse(raw) as {
        outcome?: string;
        sessionId?: string | null;
        ts?: number;
        command?: string | null;
      };
      if (r.outcome === "fired" && r.sessionId && typeof r.ts === "number")
        out.push({
          sessionId: r.sessionId,
          ts: r.ts,
          command: r.command ?? null,
        });
    } catch {
      // A torn line is skipped, as the activity reader does.
    }
  }
  return out;
}

/** The 96 M15 fire records, with the truth M15's labeller gave each. */
function readM15(): M15Seed[] {
  const fixture = JSON.parse(
    readFileSync(join(M15_DIR, "wp1-break-fixture.json"), "utf8"),
  ) as {
    _meta: { session_files: string[] };
    fire: { turn_index: number; edge_id: string; sf: number }[];
  };
  const q2 = JSON.parse(
    readFileSync(join(M15_DIR, "wp1-q2-adjudication.json"), "utf8"),
  ) as {
    arms: {
      sonnet: {
        records: { sf: string; turn_index: number; truth: M15Seed["truth"] }[];
      };
    };
  };
  const truth = new Map(
    q2.arms.sonnet.records.map((r) => [`${r.sf}:${r.turn_index}`, r.truth]),
  );
  return fixture.fire.map((f) => {
    const session8 = fixture._meta.session_files[f.sf].slice(0, 8);
    return {
      session8,
      turnIndex: f.turn_index,
      edgeId: f.edge_id,
      truth: truth.get(`${session8}:${f.turn_index}`) ?? "UNKNOWN",
    };
  });
}

function count<T>(
  xs: readonly T[],
  key: (x: T) => string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[key(x)] = (out[key(x)] ?? 0) + 1;
  return out;
}

it("mine", () => {
  const fired = readFired();
  const stats: FileStats = { turnsRead: 0, incomplete: 0 };
  const excluded = { m15Probe: 0, scratchWorkspace: 0, adjudicatorSession: 0 };
  let filesScanned = 0;
  const candidates: Candidate[] = [];

  for (const project of readdirSync(PROJECTS).sort()) {
    const dir = join(PROJECTS, project);
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const file of files.sort()) {
      filesScanned++;
      if (project === M15_PROBE_SLUG) {
        excluded.m15Probe++;
        continue;
      }
      if (isScratchSlug(project)) {
        excluded.scratchWorkspace++;
        continue;
      }
      const rawLines = readFileSync(join(dir, file), "utf8").split("\n");
      if (isAdjudicatorSession(parseIndexed(rawLines.slice(0, 50)))) {
        excluded.adjudicatorSession++;
        continue;
      }
      if (!rawLines.some((l) => l.includes("TRANSITION:"))) continue;
      candidates.push(
        ...mineTranscript({
          project,
          session: file.replace(/\.jsonl$/, ""),
          rawLines,
          fired,
          stats,
        }),
      );
    }
  }

  // The M15 seed: join, carry its truth, and list every disagreement rather than overwrite it.
  const { m15, m15Truth } = joinSeeds(readM15(), candidates);

  const mechanical = candidates.filter((c) => c.truth === "BREAK").length;
  const residual = candidates.length - mechanical;
  // The residual's scorable share is unknown until the operator labels it; `no-reply` and
  // `task-notification` rows are the likeliest SKIPs, so the projection excludes them.
  const likelySkip = candidates.filter(
    (c) =>
      c.truth === null &&
      (c.nextKind === "no-reply" || c.nextKind === "task-notification"),
  ).length;
  const projected = candidates.length - likelySkip;

  const meta = {
    built: new Date().toISOString(),
    probe: "M16.5 WP2 Phase 1",
    storedMode: "autopilot",
    filesScanned,
    excluded,
    turnsRead: stats.turnsRead,
    turnsIncomplete: stats.incomplete,
    fire: candidates.length,
    byClass: count(candidates, (c) => c.projectClass),
    byNextKind: count(candidates, (c) => c.nextKind),
    supervisorFired: candidates.filter((c) => c.supervisorFired).length,
    firedRecordsInLog: fired.length,
    afterTranscriptFix: candidates.filter((c) => (c.ts ?? "") >= "2026-09-28")
      .length,
    mechanicalBreak: mechanical,
    residual,
    projectedScorable: projected,
    target: TARGET,
    meetsTarget: projected >= TARGET,
    m15,
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, "candidates.json"),
    JSON.stringify({ _meta: meta, m15Truth, candidates }, null, 1),
  );
});
