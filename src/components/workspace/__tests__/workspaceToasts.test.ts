import { describe, expect, it } from "vitest";
import {
  EMPTY_TOASTS,
  MAX_TOASTS,
  toastsReducer,
  type ToastAction,
  type ToastState,
} from "../workspaceToasts";

const run = (...actions: ToastAction[]): ToastState =>
  actions.reduce(toastsReducer, EMPTY_TOASTS);

const err = (text: string): ToastAction => ({
  type: "push",
  text,
  kind: "error",
});
const info = (text: string): ToastAction => ({
  type: "push",
  text,
  kind: "info",
});
const hook = (text: string): ToastAction => ({
  type: "push",
  text,
  kind: "error",
  source: "hook",
});
const texts = (s: ToastState) => s.toasts.map((t) => t.text);

describe("toastsReducer", () => {
  it("each push is its own row with its own kind; a later one erases nothing", () => {
    const s = run(info("started again"), err("hook failed"), info("withheld"));
    expect(s.toasts.map((t) => [t.text, t.kind])).toEqual([
      ["started again", "info"],
      ["hook failed", "error"],
      ["withheld", "info"],
    ]);
    expect(new Set(s.toasts.map((t) => t.id)).size).toBe(3);
  });

  it("a text already showing is not added twice (same state object back)", () => {
    const once = run(err("a"));
    expect(toastsReducer(once, err("a"))).toBe(once);
  });

  it("dismiss removes only that row", () => {
    const s = run(err("a"), info("b"));
    const b = s.toasts[1]!.id;
    expect(texts(toastsReducer(s, { type: "dismiss", id: b }))).toEqual(["a"]);
    // An unknown id is a no-op.
    expect(toastsReducer(s, { type: "dismiss", id: 999 })).toBe(s);
  });

  it("a dismissed hook warning stays dismissed; a different one still shows", () => {
    const shown = run(hook("W1"));
    const gone = toastsReducer(shown, {
      type: "dismiss",
      id: shown.toasts[0]!.id,
    });
    expect(texts(gone)).toEqual([]);
    expect(toastsReducer(gone, hook("W1"))).toBe(gone); // the respawn re-read
    expect(texts(toastsReducer(gone, hook("W2")))).toEqual(["W2"]);
    // The latch is the hook's only: a dismissed ERROR from elsewhere may come back.
    const e = run(err("refused"));
    const eGone = toastsReducer(e, { type: "dismiss", id: e.toasts[0]!.id });
    expect(texts(toastsReducer(eGone, err("refused")))).toEqual(["refused"]);
    // …and dismissing a non-hook row latches nothing: a hook warning with that text still shows.
    expect(texts(toastsReducer(eGone, hook("refused")))).toEqual(["refused"]);
  });

  it("docs replaces only its own row (fresh id), and its null clears only that row", () => {
    const s0 = run(err("refused"), {
      type: "docs",
      notice: { text: "checking…", kind: "info" },
    });
    const firstDocsId = s0.toasts[1]!.id;
    const s1 = toastsReducer(s0, {
      type: "docs",
      notice: { text: "no changes", kind: "info", autoDismissMs: 5000 },
    });
    expect(texts(s1)).toEqual(["refused", "no changes"]);
    expect(s1.toasts[1]!.id).not.toBe(firstDocsId);
    expect(s1.toasts[1]!.autoDismissMs).toBe(5000);
    const s2 = toastsReducer(s1, { type: "docs", notice: null });
    expect(texts(s2)).toEqual(["refused"]);
    expect(toastsReducer(s2, { type: "docs", notice: null })).toBe(s2);
  });

  it("past MAX_TOASTS the oldest info row goes first, then the oldest error", () => {
    const s = run(err("e1"), info("i1"), err("e2"), info("i2"), err("e3"));
    expect(MAX_TOASTS).toBe(4);
    expect(texts(s)).toEqual(["e1", "e2", "i2", "e3"]);
    const allErr = run(err("a"), err("b"), err("c"), err("d"), err("e"));
    expect(texts(allErr)).toEqual(["b", "c", "d", "e"]);
  });
});
