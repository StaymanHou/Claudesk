// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { RightPanelHost } from "../RightPanelHost";
import "../../../test-support/cm6JsdomShims";
import {
  CATCH_UP_TOAST_MS,
  CHECKING_TEXT,
  type DocsNotice,
} from "../docs/remoteDocsCatchUp";

// M17 WP6 (AC-2, AC-3, AC-7) — the REAL RightPanelHost mounted with a remote key: every OUT surface
// renders NO DOM and invokes nothing; the Prompt tab (and Docs, gate ON) stay. A local mount beside
// it is the positive control, so "absent" cannot pass because the selectors are simply wrong.

vi.mock("../../../state/useWorkflowFeaturesEnabled", () => ({
  useWorkflowFeaturesEnabled: () => gate.enabled,
}));
const gate = { enabled: false };

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const REMOTE = "ssh://me@mini-host/Users/me/proj";
const LOCAL = "/tmp/scratch/wp6-local";

/** Every command an OUT surface invokes (the backend refuses each for a remote key). */
const OUT_COMMANDS = [
  "fs_tree",
  "fs_index",
  "git_file_statuses",
  "git_changed_files",
  "git_file_hunks",
  "git_recent_commits",
  "git_commit_diff",
  "read_file",
  "stat_file",
  "stat_media",
  "write_file",
  "project_search",
  "project_replace",
  "sublime_open",
  "smerge_open",
  "finder_open",
  "open_in_default_app",
  "term_spawn",
  // (`docs_list` / `docs_read` left this list at M17 WP7: they route by target now.)
  "workspace_watch_start",
];

/** The OUT surfaces' DOM, by test id. */
const OUT_TESTIDS = [
  "panel-tab-editor",
  "panel-tab-diff",
  "panel-tab-terminal",
  "file-tree-rail",
  "sublime-open",
  "smerge-open",
  "finder-open",
  "open-default-app",
  "term-tab-row",
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const calls: string[] = [];
/** Every notice the host raised through `onSurfaceUnavailable` (AC-4). */
const notices: string[] = [];
/** M17 WP7 — every Docs catch-up toast the host raised through `onDocsNotice`. */
const docsNotices: DocsNotice[] = [];

async function settle(ms = 30) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function mount(projectPath: string, gateOn: boolean, visible = true) {
  gate.enabled = gateOn;
  calls.length = 0;
  notices.length = 0;
  docsNotices.length = 0;
  mockWindows("main");
  mockIPC(
    (cmd) => {
      calls.push(cmd);
      switch (cmd) {
        case "fs_tree":
          return [];
        case "fs_index":
          return [];
        case "git_file_statuses":
          return {};
        case "docs_list":
          return [];
        case "remote_poll_catch_up":
          return { kind: "unchanged" };
        case "git_changed_files":
        case "git_recent_commits":
          return [];
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
        workspaceId="ws-wp6"
        projectPath={projectPath}
        visible={visible}
        workspaceProfile={null}
        collapsed={false}
        onSurfaceUnavailable={(n) => notices.push(n)}
        onDocsNotice={(n) => docsNotices.push(n)}
      />,
    ),
  );
  await settle();
  await settle();
  return host;
}

async function chord(key: string, shift: boolean) {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        metaKey: true,
        shiftKey: shift,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await settle();
}

const byId = (el: Element, id: string) =>
  el.querySelector(`[data-testid="${id}"]`);

afterEach(async () => {
  await act(async () => root?.unmount());
  await settle();
  host?.remove();
  root = null;
  host = null;
  clearMocks();
});

describe("a remote workspace's right half", () => {
  for (const gateOn of [false, true]) {
    it(`renders no OUT surface (gate ${gateOn ? "ON" : "OFF"})`, async () => {
      const el = await mount(REMOTE, gateOn);
      for (const id of OUT_TESTIDS) expect(byId(el, id), id).toBeNull();
      expect(el.querySelector(".editor-split"), "editor slot").toBeNull();
      expect(el.querySelector('[id^="panel-diff-"]'), "diff slot").toBeNull();
      expect(
        el.querySelector('[id^="panel-terminal-"]'),
        "terminal slot",
      ).toBeNull();
      // The IN surfaces stay.
      expect(byId(el, "panel-tab-prompt")).not.toBeNull();
      expect(byId(el, "pip-toggle")).not.toBeNull();
      expect(byId(el, "panel-tab-docs") !== null).toBe(gateOn);
      // And nothing reached for the local disk / a local app / a local shell.
      expect(calls.filter((c) => OUT_COMMANDS.includes(c))).toEqual([]);
    });
  }

  it("opens on Prompt with the gate OFF", async () => {
    const el = await mount(REMOTE, false);
    expect(byId(el, "panel-tab-prompt")?.getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  // P2.verify-human.2 — operator decision A (2026-11-17): with one panel left (gate OFF), the tab
  // row STAYS, holding the single Prompt tab plus the PiP toggle. It is not hidden.
  it("keeps the tab row with exactly one tab when only Prompt remains (decision A)", async () => {
    const el = await mount(REMOTE, false);
    const row = el.querySelector('.right-panel-toggle[role="tablist"]');
    expect(row).not.toBeNull();
    const tabs = [...row!.querySelectorAll('[role="tab"]')].map((t) =>
      t.getAttribute("data-testid"),
    );
    expect(tabs).toEqual(["panel-tab-prompt"]);
    expect(row!.querySelector('[data-testid="pip-toggle"]')).not.toBeNull();
  });

  // M17 WP7 — the WP6 placeholder note is gone: `docs_list` routes by target in the backend, so
  // the remote workspace mounts the real DocsPanel and lists through it (gate ON only).
  it("opens on Docs with the gate ON and lists through the real DocsPanel (docs_list invoked)", async () => {
    const el = await mount(REMOTE, true);
    expect(byId(el, "panel-tab-docs")?.getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(byId(el, "docs-panel-remote-note")).toBeNull();
    expect(byId(el, "docs-panel")).not.toBeNull();
    expect(calls).toContain("docs_list");
  });

  it("with the gate OFF a remote workspace reads no docs (no Docs tab, no docs_list)", async () => {
    const el = await mount(REMOTE, false);
    expect(byId(el, "panel-tab-docs")).toBeNull();
    expect(byId(el, "docs-panel")).toBeNull();
    expect(calls).not.toContain("docs_list");
  });

  it("the OUT chords open nothing (⌘⇧E/D/T, ⌘P, ⌘⇧F, ⌘N, ⌘T)", async () => {
    const el = await mount(REMOTE, false);
    for (const [key, shift] of [
      ["E", true],
      ["D", true],
      ["T", true],
      ["p", false],
      ["f", true],
      ["n", false],
      ["t", false],
    ] as const) {
      await chord(key, shift);
    }
    for (const id of OUT_TESTIDS) expect(byId(el, id), id).toBeNull();
    expect(byId(el, "file-finder")).toBeNull();
    expect(byId(el, "project-search")).toBeNull();
    expect(byId(el, "panel-tab-prompt")?.getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(calls.filter((c) => OUT_COMMANDS.includes(c))).toEqual([]);
  });
});

// M17 WP7 (P3.verify-human.2) — the consuming surface of the remote poller's on-screen rule: the
// REAL RightPanelHost + DocsPanel. A remote workspace is polled only while it is centre stage AND
// Docs is the fronted tab; a return is an announced catch-up, the opening show is silent.
describe("a remote workspace's Docs polling follows what is on screen", () => {
  const clickTab = async (el: Element, id: string) => {
    await act(async () => {
      (byId(el, id) as HTMLElement).click();
    });
    await settle();
  };
  const polls = () => calls.filter((c) => c.startsWith("remote_poll_"));

  it("catches up silently on the opening show, pauses on Prompt, announces the return to Docs", async () => {
    const el = await mount(REMOTE, true);
    expect(polls()).toEqual(["remote_poll_catch_up"]);
    expect(docsNotices).toEqual([]);

    await clickTab(el, "panel-tab-prompt");
    expect(polls()).toEqual(["remote_poll_catch_up", "remote_poll_pause"]);

    await clickTab(el, "panel-tab-docs");
    expect(polls()).toEqual([
      "remote_poll_catch_up",
      "remote_poll_pause",
      "remote_poll_catch_up",
    ]);
    expect(docsNotices).toEqual([
      { text: CHECKING_TEXT, kind: "info" },
      {
        text: "Remote docs checked: no changes.",
        kind: "info",
        autoDismissMs: CATCH_UP_TOAST_MS,
      },
    ]);
  });

  it("a workspace that is not centre stage is never polled, even with Docs fronted", async () => {
    await mount(REMOTE, true, false);
    expect(polls()).toEqual(["remote_poll_pause"]);
  });

  it("a LOCAL workspace never touches the remote poller (positive control)", async () => {
    const el = await mount(LOCAL, true);
    await clickTab(el, "panel-tab-prompt");
    await clickTab(el, "panel-tab-docs");
    expect(polls()).toEqual([]);
    expect(docsNotices).toEqual([]);
  });
});

describe("positive control: a LOCAL workspace's right half is unchanged", () => {
  it("renders every OUT surface the remote one hides", async () => {
    const el = await mount(LOCAL, false);
    for (const id of OUT_TESTIDS.filter((i) => i !== "term-tab-row"))
      expect(byId(el, id), id).not.toBeNull();
    expect(byId(el, "term-tab-row")).not.toBeNull();
    expect(byId(el, "panel-tab-editor")?.getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("⌘P opens the finder and ⌘⇧F opens search (the chord assertions above are not vacuous)", async () => {
    const el = await mount(LOCAL, false);
    await chord("p", false);
    expect(byId(el, "file-finder")).not.toBeNull();
    await chord("p", false);
    await chord("f", true);
    expect(byId(el, "project-search")).not.toBeNull();
  });

  // M17 WP7 Phase 1 — every tab click routes through `selectPanel`, which now REQUIRES the kind
  // (fail-closed). Clicking each tab on a LOCAL workspace must still front exactly that tab.
  it("each tab click fronts exactly that tab (the selectPanel call sites, live)", async () => {
    const el = await mount(LOCAL, false);
    for (const tab of ["diff", "terminal", "prompt", "editor"]) {
      await act(async () =>
        (byId(el, `panel-tab-${tab}`) as HTMLElement).click(),
      );
      await settle();
      const selected = [
        ...el.querySelectorAll(
          '[data-testid^="panel-tab-"][aria-selected="true"]',
        ),
      ].map((t) => t.getAttribute("data-testid"));
      expect(selected, tab).toEqual([`panel-tab-${tab}`]);
    }
  });
});

// M17 WP6 (AC-4) — a chord for an ABSENT surface is consumed and answered with exactly one
// plain-words notice; the same chords on a LOCAL workspace raise none.
describe("chords for absent surfaces say so (AC-4)", () => {
  const CHORDS = [
    ["E", true, "The editor isn't available on a remote workspace."],
    ["D", true, "The diff viewer isn't available on a remote workspace."],
    ["T", true, "The terminal panel isn't available on a remote workspace."],
    ["p", false, "Go to File isn't available on a remote workspace."],
    ["f", true, "Find in Files isn't available on a remote workspace."],
    ["n", false, "New File isn't available on a remote workspace."],
    ["t", false, "The terminal panel isn't available on a remote workspace."],
  ] as const;

  for (const [key, shift, text] of CHORDS) {
    it(`⌘${shift ? "⇧" : ""}${key} on a remote workspace: one notice, key consumed`, async () => {
      await mount(REMOTE, false);
      let defaultPrevented = false;
      await act(async () => {
        const ev = new KeyboardEvent("keydown", {
          key,
          metaKey: true,
          shiftKey: shift,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(ev);
        defaultPrevented = ev.defaultPrevented;
      });
      await settle();
      expect(notices).toEqual([text]);
      expect(defaultPrevented).toBe(true);
    });
  }

  it("the same chords on a LOCAL workspace raise no notice (positive control)", async () => {
    await mount(LOCAL, false);
    for (const [key, shift] of CHORDS) await chord(key, shift);
    expect(notices).toEqual([]);
  });

  it("⌘W and ⌘1 on a remote workspace are consumed silently (no window close, no notice)", async () => {
    await mount(REMOTE, false);
    for (const key of ["w", "1"]) {
      let prevented = false;
      await act(async () => {
        const ev = new KeyboardEvent("keydown", {
          key,
          metaKey: true,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(ev);
        prevented = ev.defaultPrevented;
      });
      expect(prevented, key).toBe(true);
    }
    expect(notices).toEqual([]);
  });
});
