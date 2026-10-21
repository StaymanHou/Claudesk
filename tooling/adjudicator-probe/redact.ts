// M16.5 WP2 — what may be COMMITTED from the candidate set.
//
// ⚠️ Claudesk is open source and the widened corpus includes work projects. Only claudesk's own
// records keep their tails and the operator's reply; every other record keeps the workflow
// vocabulary (edge, skill, labels, answers) and an opaque key. The full set stays in `tmp/` and
// is rebuilt by re-running the miner.

import { createHash } from "node:crypto";
import type { Candidate, NextKind, ProjectClass } from "./corpus";

/** A record as committed. Text fields exist only on `claudesk` records. */
export interface CommittedRecord {
  readonly key: string;
  readonly projectClass: ProjectClass;
  readonly edgeId: string;
  readonly skill: string;
  /** The verdict line's date (day only), or null. */
  readonly date: string | null;
  readonly nextKind: NextKind;
  readonly supervisorFired: boolean;
  /** The mechanical label (`BREAK`) or null for the residual. */
  readonly mechanicalTruth: "BREAK" | null;
  readonly truthBasis: string;
  readonly m15Truth?: string;
  readonly tail?: string;
  readonly nextText?: string | null;
}

/** The record's stable id: readable for claudesk (matches M15's `sf:turn_index`), opaque otherwise. */
export function keyOf(
  c: Pick<Candidate, "projectClass" | "session" | "turnIndex">,
): string {
  if (c.projectClass === "claudesk") return `${c.session}:${c.turnIndex}`;
  const h = createHash("sha256")
    .update(`${c.session}:${c.turnIndex}`)
    .digest("hex");
  return `h:${h.slice(0, 16)}`;
}

export function redact(
  c: Candidate,
  m15Truth: string | undefined,
): CommittedRecord {
  const base = {
    key: keyOf(c),
    projectClass: c.projectClass,
    edgeId: c.edgeId,
    skill: c.skill,
    date: c.ts ? c.ts.slice(0, 10) : null,
    nextKind: c.nextKind,
    supervisorFired: c.supervisorFired,
    mechanicalTruth: c.truth,
    truthBasis: c.truthBasis,
    ...(m15Truth ? { m15Truth } : {}),
  };
  if (c.projectClass !== "claudesk") return base;
  return { ...base, tail: c.tail, nextText: c.nextText };
}

/** The longest string a non-claudesk record may carry. Every legitimate field is far shorter. */
export const MAX_REDACTED_STRING = 64;

/**
 * Proven by what REMAINS, not by which fields were dropped (`[[verify-redaction-by-what-remains]]`):
 * walk EVERY value of every non-claudesk record and report any string over the cap, and any
 * forbidden token (a non-claudesk project's name) anywhere in those records' serialization.
 *
 * ⚠️ Scoped to non-claudesk records: claudesk's own tails legitimately name other projects.
 */
export function redactionViolations(
  records: readonly CommittedRecord[],
  forbidden: readonly string[],
): string[] {
  const out: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") {
      if (v.length > MAX_REDACTED_STRING)
        out.push(`${path}: ${v.length} chars`);
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    }
  };
  records.forEach((r, i) => {
    if (r.projectClass !== "claudesk") walk(r, `records[${i}]`);
  });
  const serialized = JSON.stringify(
    records.filter((r) => r.projectClass !== "claudesk"),
  );
  for (const f of forbidden)
    if (serialized.includes(f)) out.push(`forbidden token "${f}" present`);
  return out;
}
