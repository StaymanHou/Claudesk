// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  click,
  mountWorkspace,
  uncaught,
  unmountWorkspace,
} from "./liveWorkspace";
import { ABSENT_HOST_NOTE_TESTID } from "../absentHostNote";

vi.mock(
  "../XtermPane",
  async () => (await import("./liveWorkspace")).xtermPaneModule,
);
vi.mock(
  "../RightPanelHost",
  async () => (await import("./liveWorkspace")).rightPanelModule,
);
vi.mock(
  "../../../state/useWorkflowFeaturesEnabled",
  async () => (await import("./liveWorkspace")).gateModule,
);

// M18 WP4 (§R.1, D8) — the absent-host note, rendered by the REAL `Workspace` (the consuming
// surface): a remote workspace whose host has no workflow system shows one plain-words line in
// the skill-row slot INSTEAD of the row, with a button to Settings. Gate OFF: neither exists.

// A MagicDNS-style host, so the SHORT host (`mini-host`) and the full `user@host` differ.
const REMOTE = "ssh://me@mini-host.tail0000.ts.net/Users/me/proj";
const FULL = "me@mini-host.tail0000.ts.net";
const NOTE = `[data-testid="${ABSENT_HOST_NOTE_TESTID}"]`;
const ROW = '[data-testid="workspace-skill-row"]';

const hosts = (state: string | null) => ({
  remote_host_substrates:
    state === null ? {} : { [FULL]: { state, root: null, head: null } },
});

afterEach(async () => {
  await unmountWorkspace();
});

describe("the absent-host note (M18 WP4)", () => {
  it("gate ON, host ABSENT: the note names the account and Settings → Remote hosts; no skill row", async () => {
    const opened: number[] = [];
    const el = await mountWorkspace({
      gate: true,
      projectPath: REMOTE,
      ipcAnswers: hosts("absent"),
      onOpenSettings: () => opened.push(1),
    });
    const note = el.querySelector(NOTE);
    // Operator, WP4 P3.verify-human.1: the SHORT host in the text, the full user@host in the
    // tooltip (the picker row's split).
    expect(note?.textContent).toContain(
      "The workflow system isn't installed for mini-host.",
    );
    expect(note?.textContent).not.toContain(FULL);
    expect(note?.textContent).toContain("Settings → Remote hosts");
    expect(note?.querySelector("[title]")?.getAttribute("title")).toBe(
      `The workflow system isn't installed for ${FULL}. Install it in Settings → Remote hosts.`,
    );
    expect(el.querySelector(ROW)).toBeNull();
    await click(
      el.querySelector(`[data-testid="${ABSENT_HOST_NOTE_TESTID}-settings"]`),
    );
    expect(opened).toEqual([1]);
    expect(uncaught).toEqual([]);
  });

  it("gate ON, host UNKNOWN (the probe could not answer): the couldn't-check wording", async () => {
    const el = await mountWorkspace({
      gate: true,
      projectPath: REMOTE,
      ipcAnswers: hosts("unknown"),
    });
    expect(el.querySelector(NOTE)?.textContent).toContain(
      "Claudesk couldn't check whether the workflow system is installed for mini-host.",
    );
    expect(el.querySelector(ROW)).toBeNull();
  });

  it("gate ON, host not seeded yet: no note (no flash) and no row", async () => {
    const el = await mountWorkspace({
      gate: true,
      projectPath: REMOTE,
      ipcAnswers: hosts(null),
    });
    expect(el.querySelector(NOTE)).toBeNull();
    expect(el.querySelector(ROW)).toBeNull();
  });

  it("gate ON, host DEVELOPER: the skill row, no note (positive control)", async () => {
    const el = await mountWorkspace({
      gate: true,
      projectPath: REMOTE,
      ipcAnswers: hosts("developer"),
    });
    expect(el.querySelector(ROW)).not.toBeNull();
    expect(el.querySelector(NOTE)).toBeNull();
  });

  it("gate OFF, host ABSENT: no note and no row (the OFF invariant, rendered)", async () => {
    const el = await mountWorkspace({
      gate: false,
      projectPath: REMOTE,
      ipcAnswers: hosts("absent"),
    });
    expect(el.querySelector(NOTE)).toBeNull();
    expect(el.querySelector(ROW)).toBeNull();
  });

  it("a LOCAL workspace never gets the note, gate ON", async () => {
    const el = await mountWorkspace({ gate: true });
    expect(el.querySelector(NOTE)).toBeNull();
    expect(el.querySelector(ROW)).not.toBeNull();
  });
});

// The REAL wiring of the note's Settings button: App opens Settings, CenterStage forwards it to
// every Workspace. A source question (which prop App passes), so a source guard: the render test
// above uses a stub callback and cannot see App drop the prop, which would make the button vanish
// silently (it renders only when `onOpenSettings` is defined). Flattened: Prettier may reflow it.
describe("the note's Settings button is wired to App's Settings panel", () => {
  it("App passes onOpenSettings → setShowSettings(true); CenterStage forwards it", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const flat = (rel: string) =>
      readFileSync(join(__dirname, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
        .replace(/\s+/g, "");
    // ⚠️ Anchored INSIDE the `<CenterStage … />` element: App passes the same prop to another
    // component too, so a whole-file `toContain` would pass with this wiring deleted.
    const app = flat("../../../App.tsx");
    const start = app.indexOf("<CenterStage");
    expect(start, "App renders <CenterStage").toBeGreaterThan(-1);
    const centerStage = app.slice(start, app.indexOf("/>", start));
    expect(centerStage).toContain("onOpenSettings={()=>setShowSettings(true)}");
    expect(flat("../CenterStage.tsx")).toContain(
      "onOpenSettings={onOpenSettings}",
    );
  });
});
