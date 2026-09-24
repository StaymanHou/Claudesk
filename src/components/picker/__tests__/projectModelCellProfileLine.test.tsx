// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { ProjectModelCell } from "../ProjectModelCell";
import type { Profile } from "../../../state/profiles";

// F-b — the PROFILE line: the FIRST line of the model cell's stack, above model + drive mode,
// always prefixed "Profile:" (operator, Phase 4 verify-human 2026-09-24 — it replaced a separate
// row column). The gate is at its pre-seed OFF here (no mock), which is itself a property under
// test: the profile line is lite-IDE core and must exist regardless.

const neo: Profile = {
  name: "neo",
  config_dir: "/u/.config/claude-neo",
  provenance: "adopted",
};

function renderCell(profile: string | null, profiles: Profile[] = [neo]) {
  const html = renderToStaticMarkup(
    <ProjectModelCell
      projectPath="/tmp/proj"
      projectLabel="proj"
      seedModel={null}
      profile={profile}
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

describe("the profile line (F-b)", () => {
  it("is the FIRST line of the stack, above the model line", () => {
    const doc = renderCell(null);
    const lines = [...doc.querySelectorAll(".picker-recent-cell-line")].map(
      (l) => l.getAttribute("data-testid"),
    );
    expect(lines[0]).toBe("project-profile-line");
    expect(lines).toContain("picker-recent-model-line");
    expect(lines.indexOf("project-profile-line")).toBeLessThan(
      lines.indexOf("picker-recent-model-line"),
    );
  });

  it("DEFAULT reads 'Profile: default', unmarked", () => {
    const l = line(renderCell(null));
    expect(l?.textContent).toBe("Profile: default");
    expect(l?.className).not.toContain("is-set");
    expect(l?.className).not.toContain("is-failed");
  });

  it("LISTED reads 'Profile: <name>', marked as set", () => {
    const l = line(renderCell("neo"));
    expect(l?.textContent).toBe("Profile: neo");
    expect(l?.className).toContain("is-set");
  });

  it("UNLISTED reads MISSING in the failed style — never default", () => {
    const l = line(renderCell("gone"));
    expect(l?.textContent).toBe("Profile: ⚠ gone missing");
    expect(l?.className).toContain("is-failed");
    expect(line(renderCell("neo", []))?.textContent).toBe(
      "Profile: ⚠ neo missing",
    );
  });

  it("exists with the workflow gate OFF (lite-IDE core, ungated)", () => {
    // Gate is at its pre-seed OFF here: the drive-mode line is absent, the profile line is not.
    const doc = renderCell(null);
    expect(line(doc)).not.toBeNull();
    expect(
      doc.querySelector('[data-testid="picker-recent-mode-line"]'),
    ).toBeNull();
  });
});

describe("ProjectPicker — the open-time refusal is wired BEFORE the open (A.6)", () => {
  it("handleOpenRecent refuses a missing-profile row before record_open / onOpen", () => {
    // Ordering, not presence: `toContain` would pass with the refusal placed AFTER the open.
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
