import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DRAFT_KEY_PREFIX,
  clearDraft,
  loadDraft,
  saveDraft,
} from "../draftStore";

// F-a WP2 Phase 2 — per-project draft persistence.
//
// ⚠️ The vitest env has NO DOM, so `localStorage` is `undefined` rather than merely
// throwing. The repo pattern is an in-memory shim via `vi.stubGlobal` (see
// `filmstripOrder.test.ts`), with `vi.stubGlobal("localStorage", undefined)` for the
// storage-unavailable path.

let store: Record<string, string>;

beforeEach(() => {
  store = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  });
});

describe("draftStore — round-trip", () => {
  it("returns exactly what was saved, interior newlines intact", () => {
    // ⚠️ The motivating input is a dictated passage. Newlines and multi-byte characters
    // must survive verbatim — this is the whole point of the durable buffer.
    const body = "first line\nsecond line\n\nfourth after a blank\né— “quotes”";
    saveDraft("/Users/me/proj", body);
    expect(loadDraft("/Users/me/proj")).toBe(body);
  });

  it("returns '' for a project with no stored draft", () => {
    expect(loadDraft("/Users/me/never-typed-here")).toBe("");
  });

  it("clearDraft removes the draft", () => {
    saveDraft("/Users/me/proj", "something");
    clearDraft("/Users/me/proj");
    expect(loadDraft("/Users/me/proj")).toBe("");
  });
});

describe("draftStore — project keying", () => {
  it("two different projects do NOT collide", () => {
    saveDraft("/Users/me/alpha", "alpha draft");
    saveDraft("/Users/me/beta", "beta draft");
    expect(loadDraft("/Users/me/alpha")).toBe("alpha draft");
    expect(loadDraft("/Users/me/beta")).toBe("beta draft");
  });

  it("canonicalizes on BOTH read and write — a trailing slash is the same project", () => {
    // ⚠️ Mutation-proved in both directions: dropping canonicalization on either side
    // splits one project's draft into two keys, and the operator loses text on a path
    // spelling they cannot see.
    saveDraft("/Users/me/proj/", "written with a trailing slash");
    expect(loadDraft("/Users/me/proj")).toBe("written with a trailing slash");

    saveDraft("/Users/me/proj", "written without");
    expect(loadDraft("/Users/me/proj/")).toBe("written without");

    // Exactly ONE key exists for the two spellings.
    const keys = Object.keys(store).filter((k) =>
      k.startsWith(DRAFT_KEY_PREFIX),
    );
    expect(keys).toHaveLength(1);
  });

  it("clearDraft canonicalizes too — clearing via either spelling works", () => {
    saveDraft("/Users/me/proj", "text");
    clearDraft("/Users/me/proj/");
    expect(loadDraft("/Users/me/proj")).toBe("");
  });

  it("uses one key PER PROJECT, namespaced under the claudesk prefix", () => {
    // Pins the per-key decision (P2.2) rather than a single shared map: two projects must
    // produce two keys, so a corrupt value or a concurrent write cannot cross between them.
    saveDraft("/Users/me/alpha", "a");
    saveDraft("/Users/me/beta", "b");
    const keys = Object.keys(store).filter((k) =>
      k.startsWith(DRAFT_KEY_PREFIX),
    );
    expect(keys).toHaveLength(2);
    expect(keys.every((k) => k.startsWith("claudesk."))).toBe(true);
  });
});

describe("draftStore — an empty draft is stored as a DELETION", () => {
  it("saving '' removes the key rather than leaving an empty value behind", () => {
    saveDraft("/Users/me/proj", "text");
    expect(Object.keys(store)).toHaveLength(1);

    saveDraft("/Users/me/proj", "");
    expect(Object.keys(store)).toHaveLength(0);
    expect(loadDraft("/Users/me/proj")).toBe("");
  });
});

describe("verify-codify — the approved properties, on REALISTIC input", () => {
  // The build-time tests above use short, convenient values. These exercise the inputs the
  // feature actually exists for, and pin two rules that were implicit until now.

  it("round-trips a DICTATION-SCALE draft verbatim", () => {
    // ⚠️ THE MOTIVATING INPUT. F-a exists for long single-take dictation, and until now the
    // largest value any test stored was a few dozen characters. A store that works on
    // "hello" and truncates or mangles at scale would have passed every earlier test.
    const paragraph =
      "This is a dictated paragraph with é accents, “curly quotes”, an em—dash, " +
      "and a trailing thought.\n\n";
    const body = paragraph.repeat(400); // ~40k chars, a realistic long utterance
    saveDraft("/Users/me/proj", body);
    const back = loadDraft("/Users/me/proj");
    expect(back).toBe(body);
    expect(back.length).toBe(body.length); // explicit: no silent truncation
  });

  it("a WHITESPACE-ONLY draft is PRESERVED, not treated as empty", () => {
    // ⚠️ The empty-draft rule is exact equality (`draft === ""`), NOT a trim. That is
    // deliberate: trimming would mutate the operator's text, and a dictation can legitimately
    // open with a space or a newline. This test exists because "tidying" the check to
    // `draft.trim() === ""` is a plausible future edit that would SILENTLY DISCARD content
    // — and nothing else in the suite would notice.
    saveDraft("/Users/me/proj", "   ");
    expect(loadDraft("/Users/me/proj")).toBe("   ");

    saveDraft("/Users/me/other", "\n\n");
    expect(loadDraft("/Users/me/other")).toBe("\n\n");
  });

  it("preserves leading and trailing whitespace exactly", () => {
    // Same rule, the in-between case: the store is a buffer, not a formatter.
    const body = "  indented start and a trailing space  ";
    saveDraft("/Users/me/proj", body);
    expect(loadDraft("/Users/me/proj")).toBe(body);
  });

  it("handles project paths with spaces and non-ASCII characters", () => {
    // Real macOS paths: "~/My Project", non-Latin directory names. The key is a raw string
    // concatenation, so these must work without escaping — but nothing pinned it.
    const paths = [
      "/Users/me/My Project",
      "/Users/me/проект",
      "/Users/me/a-b_c.d",
    ];
    for (const path of paths) {
      saveDraft(path, `draft for ${path}`);
    }
    for (const path of paths) {
      expect(loadDraft(path), path).toBe(`draft for ${path}`);
    }
  });

  it("canonicalizes a path with MULTIPLE trailing slashes to the same project", () => {
    // `canonicalizeProjectPath` strips `/+$`, so `//` collapses too. Pinned because the
    // regex could plausibly be narrowed to a single `/$` by someone reading it quickly.
    saveDraft("/Users/me/proj", "one draft");
    expect(loadDraft("/Users/me/proj//")).toBe("one draft");
    expect(loadDraft("/Users/me/proj///")).toBe("one draft");
  });
});

describe("draftStore — never throws", () => {
  it("loadDraft returns '' when localStorage is UNDEFINED (the real vitest/node shape)", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => loadDraft("/Users/me/proj")).not.toThrow();
    expect(loadDraft("/Users/me/proj")).toBe("");
  });

  it("saveDraft and clearDraft are silent no-ops when localStorage is UNDEFINED", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => saveDraft("/Users/me/proj", "text")).not.toThrow();
    expect(() => clearDraft("/Users/me/proj")).not.toThrow();
  });

  it("loadDraft returns '' when the getter THROWS (private mode / disabled storage)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError: storage disabled");
      },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(() => loadDraft("/Users/me/proj")).not.toThrow();
    expect(loadDraft("/Users/me/proj")).toBe("");
  });

  it("saveDraft does not throw when the setter THROWS (quota exhausted)", () => {
    // ⚠️ The realistic failure for THIS feature: a long dictation is exactly the value
    // that can exceed the per-origin quota. It must degrade to "not persisted", never to
    // an exception thrown into a React render.
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    });
    expect(() => saveDraft("/Users/me/proj", "x".repeat(10_000))).not.toThrow();
  });

  it("clearDraft does not throw when the remover THROWS", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(() => clearDraft("/Users/me/proj")).not.toThrow();
  });

  it("loadDraft returns '' when the stored value is a NON-STRING", () => {
    // A shimmed or corrupted storage can hand back a non-string; the consumer is a text
    // buffer and must never receive one.
    vi.stubGlobal("localStorage", {
      getItem: () => ({ not: "a string" }) as unknown as string,
      setItem: () => {},
      removeItem: () => {},
    });
    expect(loadDraft("/Users/me/proj")).toBe("");
  });
});
