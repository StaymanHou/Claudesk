import { describe, expect, it } from "vitest";
import { docsView, labelFor, orderDocs, type DocEntry } from "../docsOrder";

/** Build a DocEntry with a plausible rel_path, so fixtures stay readable. */
function doc(kind: string, file_name: string, dir = "product"): DocEntry {
  return {
    rel_path: `workflow-system/${dir}/${file_name}`,
    kind,
    file_name,
    // mtime is irrelevant to ORDERING (that is `pickInitialDoc`'s tiebreak, tested
    // separately) — a constant keeps these fixtures about the property under test.
    mtime_ms: 0,
  };
}

describe("orderDocs (workflow re-orientation order)", () => {
  it("orders the full conventional set spine-first, reference-tail-last", () => {
    // The complete sequence, shuffled on input. This is the product decision the panel
    // exists to deliver — see docsOrder.ts's header for why it is not alphabetical.
    const shuffled: DocEntry[] = [
      doc("transitions", "transitions.md"),
      doc("wip", "some-feature.md", "state/wip"),
      doc("arch", "arch.md"),
      doc("vision", "vision.md"),
      doc("session", ".session.md", "state"),
      doc("design-priors", "design-priors.md"),
      doc("backlog", "backlog.md", "state"),
      doc("wbs", "wbs.md"),
      doc("research", "research.md"),
      doc("roadmap", "roadmap.md"),
      doc("context", "context.md"),
      doc("backlog-quality-findings", "backlog-quality-findings.md", "state"),
    ];

    expect(orderDocs(shuffled).map((d) => d.kind)).toEqual([
      "vision",
      "roadmap",
      "wbs",
      "wip",
      "backlog",
      "backlog-quality-findings",
      "session",
      "arch",
      "research",
      "context",
      "design-priors",
      "transitions",
    ]);
  });

  it("handles a present/absent mix — absent kinds simply aren't rows", () => {
    // A young project with only three docs. No placeholders, no gaps.
    const sparse = [
      doc("backlog", "backlog.md", "state"),
      doc("vision", "vision.md"),
    ];

    expect(orderDocs(sparse).map((d) => d.kind)).toEqual(["vision", "backlog"]);
  });

  it("sorts multiple wbs files deterministically within the kind", () => {
    // `*wbs*.md` is a glob: canonical + parked + scratch can coexist. Filesystem order
    // is not stable, so the tiebreak must be explicit.
    const many = [
      doc("wbs", "temporary-wbs.md"),
      doc("wbs", "m11-wbs-parked.md"),
      doc("wbs", "wbs.md"),
    ];

    expect(orderDocs(many).map((d) => d.file_name)).toEqual([
      "m11-wbs-parked.md",
      "temporary-wbs.md",
      "wbs.md",
    ]);
  });

  it("sorts multiple wip files deterministically, and keeps them after wbs", () => {
    const mixed = [
      doc("wip", "zebra-feature.md", "state/wip"),
      doc("wbs", "wbs.md"),
      doc("wip", "alpha-feature.md", "state/wip"),
    ];

    expect(orderDocs(mixed).map((d) => d.file_name)).toEqual([
      "wbs.md",
      "alpha-feature.md",
      "zebra-feature.md",
    ]);
  });

  it("sorts an unknown kind LAST rather than dropping it", () => {
    // The backend owns the curated set. If it grows a kind this list hasn't learned,
    // showing it last beats hiding a doc the user can see on disk.
    const withUnknown = [
      doc("something-new", "new-doc.md"),
      doc("vision", "vision.md"),
    ];

    const ordered = orderDocs(withUnknown);
    expect(ordered.map((d) => d.kind)).toEqual(["vision", "something-new"]);
    expect(ordered).toHaveLength(2);
  });

  it("does NOT mutate its input (the caller holds it in React state)", () => {
    const input = [doc("arch", "arch.md"), doc("vision", "vision.md")];
    const before = input.map((d) => d.kind);

    orderDocs(input);

    expect(input.map((d) => d.kind)).toEqual(before);
  });

  it("returns an empty array for an empty input", () => {
    expect(orderDocs([])).toEqual([]);
  });
});

describe("docsView (which single view the Docs panel shows)", () => {
  it("shows the list when docs are present", () => {
    expect(docsView([doc("vision", "vision.md")], null)).toBe("list");
  });

  it("shows 'loading' before the first fetch settles", () => {
    expect(docsView(null, null)).toBe("loading");
  });

  it("shows 'empty' for a project with genuinely no workflow docs", () => {
    expect(docsView([], null)).toBe("empty");
  });

  it("⚠️ shows ERROR, not 'empty', when the fetch FAILED", () => {
    // THE case this function exists for. A failed `docs_list` sets `error` AND leaves
    // `docs = []`, so a naive emptiness check would tell the user "this project has no
    // docs" — a confident wrong answer to a question the app could not actually answer.
    // A permission failure, a bad root, or a backend bug must all read as errors.
    expect(docsView([], "permission denied")).toBe("error");
    expect(docsView(null, "boom")).toBe("error");
    expect(docsView([doc("vision", "vision.md")], "partial failure")).toBe(
      "error",
    );
  });

  it("returns exactly one view for every reachable state (mutually exclusive)", () => {
    // The JSX renders three independent conditionals; without a single decider it can
    // show two at once or none. Enumerate the state space and assert each maps to one
    // known view — the exhaustiveness the component relies on.
    const states: Array<[readonly DocEntry[] | null, string | null]> = [
      [null, null],
      [null, "err"],
      [[], null],
      [[], "err"],
      [[doc("vision", "vision.md")], null],
      [[doc("vision", "vision.md")], "err"],
    ];
    const views = states.map(([d, e]) => docsView(d, e));

    expect(views).toEqual([
      "loading",
      "error",
      "empty",
      "error",
      "list",
      "error",
    ]);
    for (const v of views) {
      expect(["loading", "error", "empty", "list"]).toContain(v);
    }
  });
});

describe("the kind-string contract with the Rust backend", () => {
  // ⚠️ This coupling is STRINGLY-TYPED across the Rust/TS boundary and nothing else
  // asserts it. The backend's `doc_entry_serde_shape_is_snake_case` pins the DTO FIELD
  // names; these pin the `kind` VALUES, which is a separate contract. Without this, a
  // backend kind rename would silently demote that doc to the unknown-kind tail with a
  // raw-filename label — and every test on both sides would stay green.
  //
  // Kept in sync by hand: the source of truth is `PRODUCT_DOCS` + `STATE_DOCS` in
  // src-tauri/src/docs/mod.rs, plus the two glob-assigned kinds (`wbs`, `wip`).
  const BACKEND_KINDS = [
    // PRODUCT_DOCS
    "vision",
    "roadmap",
    "research",
    "arch",
    "context",
    "design-priors",
    "transitions",
    // STATE_DOCS
    "backlog",
    "backlog-quality-findings",
    "session",
    // glob-assigned
    "wbs",
    "wip",
  ] as const;

  it("every backend kind has an explicit rank (none falls into the unknown tail)", () => {
    // An unranked kind sorts last and reads as an afterthought — for a doc that is
    // actually part of the curated set, that is a silent demotion, not a fallback.
    // Probe: a ranked kind must sort BEFORE a deliberately-unknown one. Comparing two
    // UNKNOWNS would be arbitrary (equal rank → filename tiebreak), which is exactly how
    // a first version of this test silently failed to fire — so the sentinel filename is
    // chosen to lose the tiebreak too ("aaa" < any real kind's filename), meaning the
    // only way `kind` can come first is by having a real rank.
    const unranked = BACKEND_KINDS.filter((kind) => {
      const [first] = orderDocs([
        {
          rel_path: `x/${kind}.md`,
          kind,
          file_name: `${kind}.md`,
          mtime_ms: 0,
        },
        {
          rel_path: "x/aaa.md",
          kind: "definitely-unknown",
          file_name: "aaa.md",
          mtime_ms: 0,
        },
      ]);
      return first.kind !== kind;
    });

    expect(
      unranked,
      "these backend kinds have no rank in KIND_ORDER and would sort into the unknown " +
        "tail — add them, or fix the drift against src-tauri/src/docs/mod.rs",
    ).toEqual([]);
  });

  it("every backend kind produces a non-filename label, except the multi-file kinds", () => {
    // `wbs`/`wip` label by filename BY DESIGN (a project holds several). Every other
    // backend kind must have a curated human label — falling back to the raw filename
    // means KIND_LABELS drifted from the backend.
    const MULTI_FILE = ["wbs", "wip"];
    const unlabelled = BACKEND_KINDS.filter(
      (kind) =>
        !MULTI_FILE.includes(kind) &&
        labelFor({
          rel_path: `x/${kind}.md`,
          kind,
          file_name: `${kind}.md`,
          mtime_ms: 0,
        }) === `${kind}.md`,
    );

    expect(
      unlabelled,
      "these backend kinds fall back to a raw filename label — add them to KIND_LABELS",
    ).toEqual([]);
  });
});

describe("labelFor", () => {
  it("gives single-file kinds a curated human label", () => {
    expect(labelFor(doc("vision", "vision.md"))).toBe("Vision");
    expect(labelFor(doc("arch", "arch.md"))).toBe("Architecture");
    expect(labelFor(doc("design-priors", "design-priors.md"))).toBe(
      "Design priors",
    );
    expect(labelFor(doc("session", ".session.md", "state"))).toBe(
      "Session pointer",
    );
  });

  it("labels multi-file kinds by FILENAME, since one project can hold several", () => {
    // "WBS" three times over would be useless — the filename is the only distinguisher.
    expect(labelFor(doc("wbs", "wbs.md"))).toBe("wbs.md");
    expect(labelFor(doc("wbs", "m11-wbs-parked.md"))).toBe("m11-wbs-parked.md");
    expect(labelFor(doc("wip", "some-feature.md", "state/wip"))).toBe(
      "some-feature.md",
    );
  });

  it("falls back to the filename for an unknown kind — a real name beats a fabricated one", () => {
    expect(labelFor(doc("something-new", "new-doc.md"))).toBe("new-doc.md");
  });
});
