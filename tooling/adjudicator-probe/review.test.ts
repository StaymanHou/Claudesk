// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Proposal, SheetRow } from "./labelSheet";
import {
  LEGEND,
  embedJson,
  readExport,
  renderReviewer,
  type Card,
} from "./reviewer";
import {
  assemble,
  hasNoEvidence,
  isPolicyExcluded,
  mustReview,
  sampleGate,
  sampleIds,
  triage,
} from "./triage";

const row = (
  id: string,
  nextText: string | null,
  tail = "the turn",
): SheetRow => ({
  id,
  projectClass: "claudesk",
  edgeId: "F8",
  skill: "feature-verify-auto",
  date: "2026-10-01",
  tail,
  nextText,
});
const p = (label: Proposal["label"]): Proposal => ({ label, reason: "r" });

describe("hasNoEvidence", () => {
  it.each([
    [null, true],
    ["<task-notification><task-id>x</task-id>", true],
    ["<command-name>/exit</command-name>", true],
    ["<command-name>/clear</command-name>", true],
    ["<command-name>/feature-build</command-name>", false],
    ["use option B", false],
  ])("%j → %s", (text, want) => {
    expect(hasNoEvidence({ nextText: text })).toBe(want);
  });
});

describe("triage + assemble", () => {
  const rows = [
    row("R1", "continue"),
    row("R2", "use B"),
    row("R3", null),
    { ...row("R4", "go"), edgeId: "P3" },
    { ...row("R5", "go"), edgeId: "I18" },
    row("R6", "answer"),
  ];
  const first = {
    R1: p("BREAK"),
    R2: p("AWAITING"),
    R3: p("SKIP"),
    R4: p("AWAITING"),
    R5: p("BREAK"),
    R6: p("AWAITING"),
  };
  const second = { ...first, R2: p("BREAK"), R3: p("BREAK") };
  const t = triage(rows, first, second);

  it("splits no-evidence, policy-excluded, uncontested and contested rows", () => {
    expect(t).toEqual({
      noEvidence: ["R3"],
      policyExcluded: ["R4", "R5"],
      uncontested: ["R1", "R6"],
      contested: ["R2"],
    });
  });

  it("requires review of contested rows AND uncontested BREAKs", () => {
    expect(mustReview(t, first)).toEqual(["R1", "R2"]);
    expect(assemble(t, first, {}).errors).toEqual([
      "R1: must be reviewed and is not",
      "R2: must be reviewed and is not",
    ]);
  });

  it("records each final label's source; the operator wins, except over policy exclusion", () => {
    const { labels, errors } = assemble(t, first, {
      R1: "BREAK",
      R2: "AWAITING",
      R4: "AWAITING",
    });
    expect(errors).toEqual([]);
    expect(labels).toEqual({
      R1: { label: "BREAK", source: "operator" },
      R2: { label: "AWAITING", source: "operator" },
      R3: { label: "SKIP", source: "no-evidence" },
      R4: { label: "SKIP", source: "policy-excluded" },
      R5: { label: "SKIP", source: "policy-excluded" },
      R6: { label: "AWAITING", source: "readers-agree" },
    });
  });

  it("applies an operator ruling to an unseen row; a card review still outranks it", () => {
    const { labels, errors } = assemble(
      t,
      first,
      { R1: "BREAK" },
      { R1: "SKIP", R2: "AWAITING" },
    );
    expect(errors).toEqual([]);
    expect(labels.R1).toEqual({ label: "BREAK", source: "operator" });
    expect(labels.R2).toEqual({ label: "AWAITING", source: "operator-ruling" });
  });

  it("excludes product and incident edges only", () => {
    expect(["P3", "I18", "F8", "T2", "S6"].map(isPolicyExcluded)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("samples deterministically", () => {
    const ids = Array.from({ length: 50 }, (_, i) => `R${i}`);
    expect(sampleIds(ids, 10, 3)).toEqual(sampleIds(ids, 10, 3));
    expect(sampleIds(ids, 10, 3)).not.toEqual(sampleIds(ids, 10, 4));
    expect(sampleIds(ids, 99, 3)).toHaveLength(50);
  });
});

describe("sampleGate", () => {
  const ids = Array.from({ length: 10 }, (_, i) => `R${i}`);
  const first = Object.fromEntries(ids.map((id) => [id, p("BREAK")]));
  const edge = (id: string) =>
    id === "R9" ? "P3" : id === "R8" ? "I18" : "F8";
  const all = (l: Proposal["label"]) =>
    Object.fromEntries(ids.map((id) => [id, l]));

  it("passes at exactly the 0.90 bar and fails just below it", () => {
    const at = sampleGate(
      [...ids, "X"],
      { ...all("BREAK"), X: "AWAITING" },
      { ...first, X: p("BREAK") },
      (id) => (id === "X" ? "F8" : "F8"),
    );
    // 10 of 11 agree = 0.909 → pass; a second flip → 9/11 = 0.818 → fail.
    expect(at.pass).toBe(true);
    const below = sampleGate(
      ids,
      { ...all("BREAK"), R0: "AWAITING", R1: "SKIP" },
      first,
      () => "F8",
    );
    expect(below).toMatchObject({ n: 10, agree: 8, pass: false });
    expect(below.disagreements).toEqual([
      "R0: readers BREAK, operator AWAITING",
      "R1: readers BREAK, operator SKIP",
    ]);
  });

  it("leaves product and incident rows out of the gate and lists them", () => {
    const g = sampleGate(
      ids,
      { ...all("BREAK"), R8: "AWAITING", R9: "AWAITING" },
      first,
      edge,
    );
    expect(g).toMatchObject({
      n: 8,
      agree: 8,
      rate: 1,
      pass: true,
      policyExcluded: ["R8", "R9"],
    });
  });
});

describe("renderReviewer", () => {
  const hostile = "</script><img src=x onerror=alert(1)><b>bold</b>";
  const cards: Card[] = [
    {
      ...row("R1", hostile, `${"x".repeat(600)} TRANSITION: F8`),
      proposal: p("BREAK"),
    },
    { ...row("R2", "use B"), proposal: p("AWAITING") },
  ];

  function mount() {
    document.open();
    document.write(renderReviewer("sample", cards));
    document.close();
    return document;
  }
  const key = (k: string) =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: k, bubbles: true }),
    );

  it("embeds data that cannot close its own script tag", () => {
    expect(embedJson({ t: "</script>" })).not.toContain("</script>");
  });

  it("renders a hostile reply as text, not markup", () => {
    localStorage.clear();
    const doc = mount();
    expect(doc.querySelector("img")).toBeNull();
    expect(doc.body.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("drives the deck by keyboard: Enter accepts, a letter overrides, ← goes back", () => {
    localStorage.clear();
    const doc = mount();
    expect(doc.body.textContent).toContain("1 / 2");
    expect(doc.querySelector(".legend")?.textContent).toBe(LEGEND);
    expect(doc.querySelector("pre")?.textContent?.startsWith("…")).toBe(true);
    key("f");
    expect(doc.querySelector("pre")?.textContent?.startsWith("x")).toBe(true);
    key("Enter");
    expect(doc.body.textContent).toContain("2 / 2");
    key("s");
    expect(doc.body.textContent).toContain("Done: 2 / 2 labelled");
    expect(doc.body.textContent).toContain(
      "agreed with the proposal on 1 of 2",
    );
    key("ArrowLeft");
    expect(doc.body.textContent).toContain("2 / 2 · labelled SKIP");
    // Progress survives a reload.
    const saved = JSON.parse(localStorage.getItem("wp2-review:sample") ?? "{}");
    expect(saved.labels).toEqual({ R1: "BREAK", R2: "SKIP" });
  });
});

describe("readExport", () => {
  const ok = {
    deck: "sample",
    exportedAt: "t",
    results: [
      { id: "R1", label: "BREAK", proposed: "BREAK", accepted: true },
      { id: "R2", label: "AWAITING", proposed: "BREAK", accepted: false },
    ],
  };
  it("reads a complete export", () => {
    expect(readExport(ok, "sample", ["R1", "R2"])).toEqual({
      labels: { R1: "BREAK", R2: "AWAITING" },
      errors: [],
    });
  });
  it("rejects the wrong deck, an unlabelled row and a missing row", () => {
    const partial = { ...ok, results: [{ ...ok.results[0], label: null }] };
    expect(readExport(partial, "contested", ["R1", "R2"]).errors).toEqual([
      'export is for deck "sample", not "contested"',
      "R1: not labelled",
      "R2: missing from the export",
    ]);
  });
});
