// M16.5 WP2 Phase 2 — the keyboard card reviewer (WIP P2.5).
//
// A self-contained local HTML page, opened from `tmp/` with `open`. ⚠️ It is NOT published as an
// artifact: about 40 rows are work-project text, and the commit policy keeps that on this machine.
//
// ⚠️ Every piece of row data reaches the DOM through `textContent`, never `innerHTML`. A tail is
// arbitrary transcript text, so it can contain markup; it must render as text.

import type { Label, Proposal, SheetRow } from "./labelSheet";

export interface Card extends SheetRow {
  readonly proposal: Proposal;
  /** On a contested card: the other reader's reading, shown beside the proposal. */
  readonly alt?: Proposal;
}

/** Characters of the tail shown before "show full turn". The question lives at the end. */
export const SHORT_TAIL_CHARS = 500;

/** Embed JSON in a `<script>` without letting `</script>` (or `<!--`) end it early. */
export function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const LABELS: readonly Label[] = ["AWAITING", "BREAK", "SKIP"];

/** Shown on every card: the operator asked what the labels mean at the first sample. */
export const LEGEND =
  "Would auto-firing the next step have been right? AWAITING = no, the turn needed you · " +
  "BREAK = yes, nothing was needed (your reply just prods) · SKIP = can't tell, or unrelated";

export function renderReviewer(deck: string, cards: readonly Card[]): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WP2 Review · ${deck}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #16181d; color: #d7dae0; font: 15px/1.5 -apple-system, system-ui, sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 24px 16px 120px; }
  header { display: flex; justify-content: space-between; gap: 12px; color: #8b93a1; font-size: 13px; }
  .bar { height: 3px; background: #262a33; margin: 10px 0 18px; }
  .bar > div { height: 100%; background: #5b8def; width: 0; }
  h2 { font-size: 13px; letter-spacing: .06em; text-transform: uppercase; color: #8b93a1; margin: 20px 0 6px; }
  pre { white-space: pre-wrap; word-break: break-word; margin: 0; font: 13px/1.5 ui-monospace, Menlo, monospace;
        background: #1d2027; border: 1px solid #2a2f3a; border-radius: 6px; padding: 12px; max-height: 46vh; overflow: auto; }
  .reply pre { border-color: #3a4560; }
  button.link { background: none; border: 0; color: #7aa2f7; cursor: pointer; padding: 4px 0; font: inherit; font-size: 13px; }
  .prop { display: flex; gap: 10px; align-items: baseline; }
  .tag { font-weight: 600; padding: 2px 8px; border-radius: 4px; font-size: 13px; }
  .AWAITING { background: #3b2f1a; color: #f0b35a; } .BREAK { background: #1c3324; color: #7ad19a; } .SKIP { background: #2a2d35; color: #a2a8b4; }
  .keys { position: fixed; left: 0; right: 0; bottom: 0; background: #1b1e24; border-top: 1px solid #2a2f3a; padding: 12px 16px;
          display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
  .keys button { background: #262a33; color: #d7dae0; border: 1px solid #343a46; border-radius: 6px; padding: 8px 12px; font: inherit; font-size: 14px; cursor: pointer; }
  .keys button.on { outline: 2px solid #5b8def; }
  kbd { font: 12px ui-monospace, Menlo, monospace; color: #8b93a1; margin-right: 6px; }
  .legend { margin: -8px 0 4px; color: #8b93a1; font-size: 12.5px; }
  .done table { border-collapse: collapse; margin: 12px 0; } .done td { padding: 4px 12px 4px 0; }
</style>
</head>
<body>
<main id="app"></main>
<div class="keys" id="keys"></div>
<script id="data" type="application/json">${embedJson({ deck, cards })}</script>
<script>
(() => {
  const { deck, cards } = JSON.parse(document.getElementById("data").textContent);
  const LABELS = ${JSON.stringify(LABELS)};
  const SHORT = ${SHORT_TAIL_CHARS};
  const LEGEND = ${JSON.stringify(LEGEND)};
  const storeKey = "wp2-review:" + deck;
  let state = { i: 0, labels: {} };
  try { const s = JSON.parse(localStorage.getItem(storeKey) || "null"); if (s && s.labels) state = s; } catch {}
  const save = () => { try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch {} };
  let full = false;
  const app = document.getElementById("app");
  const keys = document.getElementById("keys");
  const el = (tag, props, ...kids) => {
    const n = document.createElement(tag);
    Object.assign(n, props || {});
    for (const k of kids) n.append(k);
    return n;
  };

  function results() {
    return cards.map((c) => {
      const label = state.labels[c.id] || null;
      return { id: c.id, label, proposed: c.proposal.label, accepted: label === c.proposal.label };
    });
  }

  function download() {
    const body = JSON.stringify({ deck, exportedAt: new Date().toISOString(), results: results() }, null, 1);
    const a = el("a", { href: URL.createObjectURL(new Blob([body], { type: "application/json" })), download: "wp2-review-" + deck + ".json" });
    document.body.append(a); a.click(); a.remove();
  }

  function renderDone() {
    const r = results();
    const done = r.filter((x) => x.label).length;
    const agree = r.filter((x) => x.accepted).length;
    app.replaceChildren(el("div", { className: "done" },
      el("h1", { textContent: "Done: " + done + " / " + r.length + " labelled" }),
      el("p", { textContent: "You agreed with the proposal on " + agree + " of " + done + "." }),
      el("p", { textContent: "Click Download, then tell Claude \\"done\\". The file goes to your Downloads folder." }),
      el("p", {}, el("button", { className: "link", textContent: "← back to the last card", onclick: () => { state.i = cards.length - 1; save(); render(); } }))));
    keys.replaceChildren(el("button", { textContent: "Download results", onclick: download }));
  }

  function render() {
    if (state.i >= cards.length) return renderDone();
    const c = cards[state.i];
    const labelled = Object.keys(state.labels).length;
    const tail = full || c.tail.length <= SHORT ? c.tail : "…" + c.tail.slice(-SHORT);
    const bar = el("div", { className: "bar" }, el("div"));
    bar.firstChild.style.width = (100 * labelled / cards.length) + "%";
    const current = state.labels[c.id];
    app.replaceChildren(
      el("header", {},
        el("span", { textContent: c.id + " · " + c.projectClass + " · " + c.edgeId + " → " + c.skill + " · " + (c.date || "undated") }),
        el("span", { textContent: (state.i + 1) + " / " + cards.length + (current ? " · labelled " + current : "") })),
      bar,
      el("p", { className: "legend", textContent: LEGEND }),
      el("h2", { textContent: "End of the turn" }),
      el("pre", { textContent: tail }),
      c.tail.length > SHORT ? el("button", { className: "link", textContent: full ? "show less ▴ (F)" : "show full turn ▾ (F)", onclick: () => { full = !full; render(); } }) : "",
      el("div", { className: "reply" },
        el("h2", { textContent: "Your reply" }),
        el("pre", { textContent: c.nextText === null ? "(no reply — the session ended here)" : c.nextText })),
      el("h2", { textContent: "Proposed" }),
      el("div", { className: "prop" },
        el("span", { className: "tag " + c.proposal.label, textContent: c.proposal.label }),
        el("span", { textContent: c.proposal.reason })),
      c.alt ? el("h2", { textContent: "The other reader disagreed" }) : "",
      c.alt ? el("div", { className: "prop" },
        el("span", { className: "tag " + c.alt.label, textContent: c.alt.label }),
        el("span", { textContent: c.alt.reason })) : "");
    const btn = (k, text, fn, on) => el("button", { className: on ? "on" : "", onclick: fn }, el("kbd", { textContent: k }), text);
    keys.replaceChildren(
      btn("↵", "accept " + c.proposal.label, () => pick(c.proposal.label), current === c.proposal.label),
      ...LABELS.map((l) => btn(l[0], l.toLowerCase(), () => pick(l), current === l && current !== c.proposal.label)),
      btn("←", "back", back, false));
    window.scrollTo(0, 0);
  }

  function pick(label) {
    state.labels[cards[state.i].id] = label;
    state.i = Math.min(state.i + 1, cards.length);
    full = false; save(); render();
  }
  function back() { state.i = Math.max(0, state.i - 1); full = false; save(); render(); }

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (state.i >= cards.length) { if (e.key === "ArrowLeft") back(); return; }
    const c = cards[state.i];
    const k = e.key.toLowerCase();
    if (e.key === "Enter") pick(c.proposal.label);
    else if (k === "a") pick("AWAITING");
    else if (k === "b") pick("BREAK");
    else if (k === "s") pick("SKIP");
    else if (k === "f") { full = !full; render(); }
    else if (e.key === "ArrowLeft" || e.key === "Backspace") back();
    else if (e.key === "ArrowRight" && state.labels[c.id]) { state.i++; render(); }
    else return;
    e.preventDefault();
  });
  render();
})();
</script>
</body>
</html>
`;
}

/** The reviewer's export, as the merge step reads it. */
export interface ReviewExport {
  readonly deck: string;
  readonly exportedAt: string;
  readonly results: readonly {
    id: string;
    label: Label | null;
    proposed: Label;
    accepted: boolean;
  }[];
}

/**
 * Validate an export against the deck it came from. ⚠️ Strict: a missing row,
 * an unlabelled row, an unknown row or a bad label is an ERROR naming the row.
 */
export function readExport(
  raw: unknown,
  deck: string,
  ids: readonly string[],
): { labels: Record<string, Label>; errors: string[] } {
  const errors: string[] = [];
  const labels: Record<string, Label> = {};
  const x = raw as Partial<ReviewExport>;
  if (!x || x.deck !== deck)
    errors.push(`export is for deck "${x?.deck}", not "${deck}"`);
  for (const r of x?.results ?? []) {
    if (!ids.includes(r.id)) errors.push(`${r.id}: not a card of this deck`);
    else if (r.label === null) errors.push(`${r.id}: not labelled`);
    else if (!LABELS.includes(r.label))
      errors.push(`${r.id}: "${String(r.label)}" is not a label`);
    else labels[r.id] = r.label;
  }
  for (const id of ids)
    if (!(id in labels) && !errors.some((e) => e.startsWith(`${id}:`)))
      errors.push(`${id}: missing from the export`);
  return { labels, errors };
}
