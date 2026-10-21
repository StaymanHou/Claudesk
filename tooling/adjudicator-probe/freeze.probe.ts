// M16.5 WP2 Phase 2 — freeze the final labels (WIP P2.3).
//
// ⚠️ The sha256 written to freeze-report.json is recorded in the WIP, and `score` refuses to run
// unless the frozen file still hashes to it. That is what proves the labels existed before any
// adjudicator answer.
//
// ⚠️ It refuses to freeze if the uncontested sample failed the operator's gate: below the bar the
// readers' agreed labels are not trusted, and the operator rules what happens next.

import { it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Label, Proposal, RowKey, SheetRow } from "./labelSheet";
import { assemble, type Triage } from "./triage";
import { OUT } from "./paths";

/** Below this, the mechanical BREAK rule is not trusted (WIP Phase 2 outcome). */
const CONTROL_AGREEMENT_BAR = 0.9;

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(join(OUT, name), "utf8")) as T;
const reviewed = (deck: string): Record<string, Label> =>
  existsSync(join(OUT, `reviewed-${deck}.json`))
    ? read<{ labels: Record<string, Label> }>(`reviewed-${deck}.json`).labels
    : {};

it("freeze", () => {
  const gate = read<{ pass: boolean; rate: number }>("sample-gate.json");
  if (!gate.pass)
    throw new Error(
      `the uncontested sample agreed at ${gate.rate}; below the bar — discuss first`,
    );
  const rows = read<SheetRow[]>("rows.json");
  const keys = read<Record<string, RowKey>>("row-keys.json");
  const t = read<Triage>("triage.json");
  const first = read<Record<string, Proposal>>("proposals.json");
  const { labels, errors } = assemble(
    t,
    first,
    { ...reviewed("sample"), ...reviewed("breaks"), ...reviewed("remaining") },
    reviewed("rulings"),
  );
  if (errors.length > 0)
    throw new Error(`cannot freeze:\n${errors.join("\n")}`);

  const frozen = rows.map((r) => ({
    id: r.id,
    key: keys[r.id].key,
    control: keys[r.id].control,
    label: labels[r.id].label,
    source: labels[r.id].source,
  }));
  const body = `${JSON.stringify({ frozenAt: new Date().toISOString(), labels: frozen }, null, 1)}\n`;
  writeFileSync(join(OUT, "labels.frozen.json"), body);
  const sha256 = createHash("sha256").update(body).digest("hex");

  const count = (f: (l: (typeof frozen)[number]) => boolean) =>
    frozen.filter(f).length;
  const control = frozen.filter((l) => l.control);
  const agree = control.filter((l) => l.label === "BREAK").length;
  const rate = control.length === 0 ? 1 : agree / control.length;
  const report = {
    sha256,
    rows: frozen.length,
    label: {
      AWAITING: count((l) => l.label === "AWAITING"),
      BREAK: count((l) => l.label === "BREAK"),
      SKIP: count((l) => l.label === "SKIP"),
    },
    source: {
      operator: count((l) => l.source === "operator"),
      operatorRuling: count((l) => l.source === "operator-ruling"),
      readersAgree: count((l) => l.source === "readers-agree"),
      noEvidence: count((l) => l.source === "no-evidence"),
      policyExcluded: count((l) => l.source === "policy-excluded"),
    },
    sampleGate: gate,
    control: {
      n: control.length,
      agreeWithMechanical: agree,
      rate,
      trusted: rate >= CONTROL_AGREEMENT_BAR,
      disagreements: control
        .filter((l) => l.label !== "BREAK")
        .map((l) => `${l.id}=${l.label}`),
    },
  };
  writeFileSync(
    join(OUT, "freeze-report.json"),
    JSON.stringify(report, null, 1),
  );
});
