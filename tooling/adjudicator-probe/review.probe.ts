// M16.5 WP2 Phase 2 — the review decks (WIP P2.4–P2.6). Steps, each its own `it`:
//   rows   → rows.json (what both readers read) + row-keys.json (hidden: key, control)
//   decks  → triage.json, review-sample.html, review-breaks.html, review-remaining.html
//            (remaining = contested rows no operator ruling in reviewed-rulings.json decides;
//            proposals-override.json may sharpen the proposal a card shows)
//   merge  → reviewed-<WP2_DECK>.json from ~/Downloads/wp2-review-<deck>*.json (newest);
//            for the sample, also sample-gate.json
// ⚠️ Once a sample is recorded in triage.json it is KEPT: the operator has reviewed it, and a
// re-triage (2026-10-21 added policy exclusion) must not quietly redraw it.
// The readers' labels (`proposals.json`, `second.json`) are written by blind subagents.

import { it } from "vitest";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Candidate } from "./corpus";
import {
  buildRows,
  type Label,
  type Proposal,
  type SheetRow,
} from "./labelSheet";
import { keyOf } from "./redact";
import { readExport, renderReviewer, type Card } from "./reviewer";
import { sampleGate, sampleIds, triage, type Triage } from "./triage";
import { OUT } from "./paths";

/** Fixed, so a rebuilt row set or deck is the same one. */
const SEED = 20261021;
/** The uncontested sample's size (operator ruling, WIP P2.6). */
const SAMPLE_SIZE = 40;

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(join(OUT, name), "utf8")) as T;

it("rows", () => {
  const { candidates } = read<{ candidates: Candidate[] }>("candidates.json");
  const { rows, keys } = buildRows(candidates, keyOf, SEED);
  writeFileSync(join(OUT, "rows.json"), JSON.stringify(rows, null, 1));
  writeFileSync(join(OUT, "row-keys.json"), JSON.stringify(keys, null, 1));
});

it("decks", () => {
  const rows = read<SheetRow[]>("rows.json");
  const first = read<Record<string, Proposal>>("proposals.json");
  const second = read<Record<string, Proposal>>("second.json");
  const t = triage(rows, first, second);
  const previous = existsSync(join(OUT, "triage.json"))
    ? read<{ sample?: string[] }>("triage.json").sample
    : undefined;
  const sample = previous ?? sampleIds(t.uncontested, SAMPLE_SIZE, SEED);
  const inSample = new Set(sample);
  const breaks = t.uncontested.filter(
    (id) => first[id].label === "BREAK" && !inSample.has(id),
  );
  const rulings = existsSync(join(OUT, "reviewed-rulings.json"))
    ? read<{ labels: Record<string, Label> }>("reviewed-rulings.json").labels
    : {};
  const override = existsSync(join(OUT, "proposals-override.json"))
    ? read<Record<string, Proposal>>("proposals-override.json")
    : {};
  const remaining = t.contested.filter((id) => !(id in rulings));
  writeFileSync(
    join(OUT, "triage.json"),
    JSON.stringify({ ...t, sample, breaks, remaining }, null, 1),
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const card = (id: string, alt: boolean): Card => ({
    ...byId.get(id)!,
    proposal: first[id],
    ...(alt ? { alt: second[id] } : {}),
  });
  // The sample deck is written once; the operator has reviewed it, so it is never rebuilt.
  if (previous === undefined)
    writeFileSync(
      join(OUT, "review-sample.html"),
      renderReviewer(
        "sample",
        sample.map((id) => card(id, false)),
      ),
    );
  writeFileSync(
    join(OUT, "review-breaks.html"),
    renderReviewer(
      "breaks",
      breaks.map((id) => card(id, false)),
    ),
  );
  // ⚠️ A NEW deck name, not "contested": the operator opened that deck, so its localStorage may
  // hold labels and a card index for a different card list.
  writeFileSync(
    join(OUT, "review-remaining.html"),
    renderReviewer(
      "remaining",
      remaining.map((id) => {
        const proposal = override[id] ?? first[id];
        // The "other reader" is whichever reader the shown proposal disagrees with.
        const alt =
          proposal.label === second[id].label ? first[id] : second[id];
        return { ...card(id, false), proposal, alt };
      }),
    ),
  );
});

/** The newest `wp2-review-<deck>*.json` in ~/Downloads (a re-download gets a " (1)" suffix). */
function newestExport(deck: string): string {
  const dir = join(homedir(), "Downloads");
  const hits = readdirSync(dir)
    .filter((f) => f.startsWith(`wp2-review-${deck}`) && f.endsWith(".json"))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (hits.length === 0)
    throw new Error(`no wp2-review-${deck}*.json in ~/Downloads`);
  return hits[0];
}

it("merge", () => {
  const deck = process.env.WP2_DECK;
  if (deck !== "sample" && deck !== "breaks" && deck !== "remaining")
    throw new Error("set WP2_DECK=sample|breaks|remaining");
  const t = read<
    Triage & { sample: string[]; breaks: string[]; remaining: string[] }
  >("triage.json");
  const ids =
    deck === "sample" ? t.sample : deck === "breaks" ? t.breaks : t.remaining;
  const path = newestExport(deck);
  const { labels, errors } = readExport(
    JSON.parse(readFileSync(path, "utf8")),
    deck,
    ids,
  );
  if (errors.length > 0)
    throw new Error(`${path} rejected:\n${errors.join("\n")}`);
  writeFileSync(
    join(OUT, `reviewed-${deck}.json`),
    JSON.stringify({ source: path, labels }, null, 1),
  );
  if (deck === "sample") {
    const first = read<Record<string, Proposal>>("proposals.json");
    const rows = read<SheetRow[]>("rows.json");
    const edge = new Map(rows.map((r) => [r.id, r.edgeId]));
    writeFileSync(
      join(OUT, "sample-gate.json"),
      JSON.stringify(
        sampleGate(ids, labels, first, (id) => edge.get(id) ?? ""),
        null,
        1,
      ),
    );
  }
});
