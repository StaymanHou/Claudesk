// @vitest-environment jsdom
// M16.5 WP6 — the consuming surface: per-result / per-file replace from the Find Results tab,
// on the REAL RightPanelHost (overlay → search → tab → hover button) with mocked IPC. The
// backend scopes are covered in Rust; this pins the wiring that only the host owns:
//   - a button sends `project_replace` with ITS row's scope, the query that PRODUCED the
//     results (not the edited field) and the CURRENT replacement text;
//   - every replace is followed by a re-search with that same query (WBS 6.3);
//   - a failure opens the overlay with a "Replace failed:" error;
//   - Replace All acts on that same shown query (paydown 2026-11-04 WP7, ruling R1).
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { RightPanelHost } from "../RightPanelHost";
import "../../../test-support/cm6JsdomShims";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom gaps (ResizeObserver, matchMedia, Range rects) are patched by the shared shim module.

const PROJECT = "/tmp/scratch/replace-fixture";
const RESULTS = [
  {
    file: "a.txt",
    matches: [
      { line: 2, start: 0, end: 3, line_text: "foo foo" },
      { line: 2, start: 4, end: 7, line_text: "foo foo" },
    ],
  },
  { file: "b.txt", matches: [{ line: 1, start: 0, end: 3, line_text: "foo" }] },
];

type Call = { cmd: string; args: Record<string, unknown> };
const calls: Call[] = [];
let replaceError: string | null = null;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function settle(ms = 30) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function mount() {
  calls.length = 0;
  replaceError = null;
  mockWindows("main");
  mockIPC(
    (cmd, payload) => {
      calls.push({ cmd, args: (payload ?? {}) as Record<string, unknown> });
      switch (cmd) {
        case "fs_tree":
          return [];
        case "git_file_statuses":
          return {};
        case "project_search":
          return RESULTS;
        case "project_replace":
          if (replaceError) throw replaceError;
          return { files_changed: 1, matches_replaced: 1 };
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <RightPanelHost
        workspaceId="ws-test"
        projectPath={PROJECT}
        visible={true}
        workspaceProfile={null}
        collapsed={false}
      />,
    ),
  );
  await settle();
}

afterEach(async () => {
  await act(async () => root?.unmount());
  await settle();
  host?.remove();
  root = null;
  host = null;
  clearMocks();
});

const q = (sel: string) => document.querySelector(sel);

async function typeInto(testid: string, value: string) {
  const el = q(`[data-testid="${testid}"]`) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function chordSearch() {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F",
        code: "KeyF",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await settle();
}

/** Open ⌘⇧F, search `foo` with replacement `bar`, close the overlay. */
async function searchFoo() {
  await chordSearch();
  await typeInto("project-search-input", "foo");
  await typeInto("project-search-replace", "bar");
  await act(async () => {
    (q('[data-testid="project-search-go"]') as HTMLElement).click();
  });
  await settle();
  await settle(); // lazy SyntheticView chunk
  await act(async () => {
    q('[data-testid="project-search-input"]')!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await settle();
}

async function press(el: Element) {
  await act(async () => {
    el.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
    (el as HTMLElement).click();
  });
  await settle();
}

const buttons = (testid: string) => [
  ...document.querySelectorAll(`[data-testid="${testid}"]`),
];
const after = (i: number) => calls.slice(i).map((c) => c.cmd);

describe("Find Results hover replace — live RightPanelHost (M16.5 WP6)", () => {
  it("a row button replaces THAT match with the current text, then re-searches", async () => {
    await mount();
    await searchFoo();
    expect(buttons("find-replace-match")).toHaveLength(3);
    expect(buttons("find-replace-file")).toHaveLength(2);

    const mark = calls.length;
    await press(buttons("find-replace-match")[1]); // a.txt, the SECOND foo
    expect(after(mark)).toEqual(["project_replace", "project_search"]);
    const replace = calls[mark].args;
    expect(replace.root).toBe(PROJECT);
    expect(replace.replacement).toBe("bar");
    expect(replace.scope).toEqual({
      kind: "match",
      path: "a.txt",
      line: 2,
      start: 4,
      end: 7,
      line_text: "foo foo",
    });
    expect(replace.query).toEqual(calls[mark + 1].args.query);
    expect(replace.query).toMatchObject({ pattern: "foo" });
  });

  it("a file button sends a file scope for its own file", async () => {
    await mount();
    await searchFoo();
    const mark = calls.length;
    await press(buttons("find-replace-file")[1]); // b.txt header
    expect(after(mark)).toEqual(["project_replace", "project_search"]);
    expect(calls[mark].args.scope).toEqual({ kind: "file", path: "b.txt" });
  });

  it("uses the query that produced the results, not the edited field", async () => {
    await mount();
    await searchFoo();
    await chordSearch(); // reopen, edit the pattern WITHOUT searching
    await typeInto("project-search-input", "zzz");
    await typeInto("project-search-replace", "");
    const mark = calls.length;
    await press(buttons("find-replace-match")[0]);
    expect(calls[mark].args.query).toMatchObject({ pattern: "foo" });
    expect(calls[mark + 1].args.query).toMatchObject({ pattern: "foo" });
    // The replacement IS live: the field now reads empty.
    expect(calls[mark].args.replacement).toBe("");
  });

  // Paydown 2026-11-04 WP7, ruling R1. Editing the field nulls the counts and disables
  // Replace All, but a ROW replace re-searches with the SHOWN query and re-enables it while
  // the field still holds the edited, never-searched pattern. Replace All must then act on
  // the shown query too, or it would replace a pattern nobody saw results for.
  it("Replace All uses the shown results' query after a row replace re-enabled it", async () => {
    await mount();
    await searchFoo();
    await chordSearch(); // reopen, edit the pattern WITHOUT searching
    await typeInto("project-search-input", "zzz");
    const replaceAll = () =>
      q('[data-testid="project-search-replace-all"]') as HTMLButtonElement;
    expect(replaceAll().disabled).toBe(true);
    await press(buttons("find-replace-match")[0]); // re-searches `foo`
    expect(replaceAll().disabled).toBe(false);
    expect(
      (q('[data-testid="project-search-input"]') as HTMLInputElement).value,
    ).toBe("zzz");

    await act(async () => replaceAll().click());
    await settle();
    const mark = calls.length;
    await press(q('[data-testid="confirm-replace"]')!);
    expect(after(mark)).toEqual(["project_replace", "project_search"]);
    expect(calls[mark].args.scope).toBeUndefined();
    expect(calls[mark].args.query).toEqual({
      pattern: "foo",
      regex: false,
      case_sensitive: false,
      whole_word: false,
    });
    expect(calls[mark + 1].args.query).toEqual(calls[mark].args.query);
  });

  it("a refused replace still re-searches and opens the overlay with the error", async () => {
    await mount();
    await searchFoo();
    expect(q('[data-testid="project-search"]')).toBeNull();
    replaceError = "a.txt changed since the search; search again";
    const mark = calls.length;
    await press(buttons("find-replace-match")[0]);
    expect(after(mark)).toEqual(["project_replace", "project_search"]);
    expect(q('[data-testid="project-search"]')).not.toBeNull();
    expect(q('[data-testid="project-search-error"]')?.textContent).toBe(
      "Replace failed: a.txt changed since the search; search again",
    );
  });
});
