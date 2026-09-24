// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { ProjectProfileCell } from "../ProjectProfileCell";
import type { Profile } from "../../../state/profiles";
import { hasBaseRule } from "../../../test-support/cssRule";

// F-b P4.1 — the profile cell's resting DOM, and its CSS↔component contract in BOTH directions
// (the pattern `projectModelCellRender.test.tsx` established for the sibling cell: a class the
// stylesheet defines but the cell never emits is a dead rule; one the cell emits but the
// stylesheet never defines is a no-op className).

const neo: Profile = {
  name: "neo",
  config_dir: "/u/.config/claude-neo",
  provenance: "adopted",
};

function renderCell(seedProfile: string | null, profiles: Profile[] = [neo]) {
  const html = renderToStaticMarkup(
    <ProjectProfileCell
      projectPath="/tmp/proj"
      projectLabel="proj"
      seedProfile={seedProfile}
      profiles={profiles}
    />,
  );
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
}

const line = (doc: Document) =>
  doc.querySelector('[data-testid="project-profile-line"]');

function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const SRC = readFileSync(
  join(process.cwd(), "src", "components", "picker", "ProjectProfileCell.tsx"),
  "utf8",
);
const CSS = readFileSync(join(process.cwd(), "src", "App.css"), "utf8");

describe("ProjectProfileCell — resting states (F-b A.4 / A.6)", () => {
  it("a DEFAULT row reads 'default', unmarked", () => {
    const l = line(renderCell(null));
    expect(l?.textContent).toBe("default");
    expect(l?.className).not.toContain("is-set");
    expect(l?.className).not.toContain("is-failed");
  });

  it("a LISTED row names its profile, marked as set", () => {
    const l = line(renderCell("neo"));
    expect(l?.textContent).toBe("neo");
    expect(l?.className).toContain("is-set");
    expect(l?.className).not.toContain("is-failed");
  });

  it("an UNLISTED row reads MISSING (failed style) — never 'default'", () => {
    const l = line(renderCell("gone"));
    expect(l?.textContent).toContain("gone");
    expect(l?.textContent).toContain("missing");
    expect(l?.textContent).not.toBe("default");
    expect(l?.className).toContain("is-failed");
    // …and the same name once the list no longer carries it.
    expect(line(renderCell("neo", []))?.className).toContain("is-failed");
  });

  it("is ungated: it renders with the workflow gate at its pre-seed OFF", () => {
    // No mock here — `useWorkflowFeaturesEnabled` is at its pre-seed `false`. The cell must
    // exist regardless (lite-IDE core), and the module must not read the gate at all.
    expect(
      renderCell(null).querySelector('[data-testid="project-profile-cell"]'),
    ).not.toBeNull();
    expect(stripComments(SRC)).not.toContain("useWorkflowFeaturesEnabled");
  });
});

describe("ProjectProfileCell — CSS↔component, both directions", () => {
  it("every `.picker-recent-profile.<mod>` the stylesheet defines is emitted", () => {
    const styled = [...CSS.matchAll(/\.picker-recent-profile\.([a-z-]+)/g)].map(
      (m) => m[1],
    );
    expect(styled.length).toBeGreaterThan(0);
    for (const mod of styled) {
      expect(
        SRC.includes(`" ${mod}"`),
        `.${mod} is styled but never emitted`,
      ).toBe(true);
    }
  });

  it("every class the cell emits has a base rule (read from SOURCE — edit-only classes too)", () => {
    const classes = new Set<string>();
    for (const m of stripComments(SRC).matchAll(
      /className=(?:"([^"]*)"|\{`([^`]*)`\})/g,
    )) {
      for (const c of (m[1] ?? m[2]).matchAll(
        /\b(picker-recent-[a-z-]+|is-[a-z-]+)\b/g,
      ))
        classes.add(c[1]);
    }
    // The cell's own surface: container, select, and the shared line + its modifiers.
    for (const expected of [
      "picker-recent-profile",
      "picker-recent-profile-select",
      "picker-recent-cell-line",
      "is-editing",
      "is-set",
      "is-failed",
    ])
      expect(classes, expected).toContain(expected);
    for (const cls of classes) {
      if (cls.startsWith("is-")) continue; // modifiers are checked per-base above + by cssModifierAudit
      expect(hasBaseRule(CSS, cls), `.${cls} is emitted but has no rule`).toBe(
        true,
      );
    }
  });
});

describe("ProjectPicker — the open-time refusal is wired BEFORE the open (A.6)", () => {
  it("handleOpenRecent refuses a missing-profile row before record_open / onOpen", () => {
    // Ordering, not presence: `toContain` would pass with the refusal placed AFTER the open
    // (lesson entry 18). No test renders ProjectPicker, so this pins the caller.
    const src = stripComments(
      readFileSync(
        join(process.cwd(), "src", "components", "picker", "ProjectPicker.tsx"),
        "utf8",
      ),
    );
    const start = src.indexOf("async function handleOpenRecent(");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(
      start,
      src.indexOf("async function handleOpenFolder(", start),
    );
    const refusal = body.indexOf("missingProfileRefusal(");
    const returnAfterRefusal = body.indexOf("return;", refusal);
    expect(refusal).toBeGreaterThan(-1);
    expect(returnAfterRefusal).toBeGreaterThan(refusal);
    expect(returnAfterRefusal).toBeLessThan(
      body.indexOf('invoke("record_open"'),
    );
    expect(returnAfterRefusal).toBeLessThan(body.indexOf("onOpen("));
  });
});
