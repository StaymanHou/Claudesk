// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasBaseRule } from "../../../test-support/cssRule";
import { mountPicker, teardownLive } from "./livePicker";

// paydown-2026-11-08 WP5 Phase 2 — the picker row is honest about an untrusted folder.
//
// The backend announces `"restore-manual"` for a restore row whose folder Claude Code has not
// trusted: the fire will withhold `/session-restore` there (CC's trust dialog would take the
// injected `\r` as "No, exit"). The row must not promise the command runs, and must not offer a
// `⊘` door that would do exactly what the row click does. A trusted `"restore"` row is the
// control and must render byte-identically to before.

afterEach(teardownLive);

async function mount() {
  const { el } = await mountPicker({
    projects: [
      {
        project_path: "/p/trusted",
        display_name: "trusted",
        last_opened_at: 3,
      },
      {
        project_path: "/p/untrusted",
        display_name: "untrusted",
        last_opened_at: 2,
      },
      {
        project_path: "/p/crashed",
        display_name: "crashed",
        last_opened_at: 1,
      },
    ],
    announce: {
      "/p/trusted": "restore",
      "/p/untrusted": "restore-manual",
      "/p/crashed": "continue",
    },
    gateOn: true,
  });
  return el;
}

function row(el: ParentNode, name: string) {
  const button = [
    ...el.querySelectorAll<HTMLElement>('[data-testid="picker-recent"]'),
  ].find((b) => b.querySelector(".picker-recent-name")?.textContent === name);
  if (!button) throw new Error(`no picker row named ${name}`);
  const badge = button.querySelector<HTMLElement>(
    '[data-testid="picker-recent-announce"]',
  );
  return {
    text: badge?.textContent ?? null,
    title: badge?.title ?? null,
    manual: badge?.dataset.manual ?? null,
    className: badge?.className ?? null,
    noFire: button.querySelector('[data-testid="picker-recent-nofire"]'),
  };
}

describe("an untrusted folder's restore row", () => {
  it("announces the command as typed by hand, with no ⊘ door", async () => {
    const r = row(await mount(), "untrusted");
    // No glyph at all: `↻` would promise a re-run, and a `⌨︎` was rejected at verify-human.
    expect(r.text).toBe("/session-restore");
    expect(r.manual).toBe("true");
    expect(r.className).toContain("picker-recent-announce--manual");
    expect(r.title).toContain("will not type /session-restore");
    expect(r.title).not.toContain("will run");
    expect(r.noFire).toBeNull();
  });

  it("control: a trusted restore row is unchanged — ↻, 'will run', and its ⊘ door", async () => {
    const r = row(await mount(), "trusted");
    expect(r.text).toBe("↻ /session-restore");
    expect(r.manual).toBeNull();
    expect(r.className).toBe("picker-recent-announce");
    expect(r.title).toBe("Opening this project will run /session-restore");
    expect(r.noFire).not.toBeNull();
  });

  it("control: the continue arm is untouched", async () => {
    const r = row(await mount(), "crashed");
    expect(r.text).toBe("↻ continue");
    expect(r.noFire).not.toBeNull();
  });
});

describe("the manual badge's CSS is the other half of the contract", () => {
  // The row test above proves the class is EMITTED; this proves it is STYLED. Deleting the rule
  // would leave the class unstyled — the untrusted row would read as a green "will run" badge —
  // with every DOM assertion still green. `cssModifierAudit` covers only `.is-*` / `.has-*`
  // modifiers, so it does not see this `--manual` one. Read via `node:fs`: a Vitest `?raw` import
  // of a `.css` file returns processed text, not the source. Resolved from the project root
  // (Vitest's cwd): under jsdom `import.meta.url` is not a `file:` URL.
  const css = readFileSync(resolve("src/App.css"), "utf8");

  it("App.css has a BASE rule for the manual modifier, in the pause control's amber", () => {
    expect(css.length).toBeGreaterThan(1000);
    expect(hasBaseRule(css, "picker-recent-announce--manual")).toBe(true);
    const start = css.indexOf(".picker-recent-announce--manual");
    const block = css.slice(start, css.indexOf("}", start));
    expect(block).toContain("color: #ffcf8a");
  });
});
