// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

// F-b ruling 4 on the picker's row cell: with the gate ON, a row on a non-default profile has
// no drive-mode line at all. The gate is mocked ON here (the sibling
// `projectModelCellRender.test.tsx` covers the pre-seed OFF shape), so the ONLY variable
// between the two cases below is the row's profile — the default row is the positive control.
vi.mock("../../../state/useWorkflowFeaturesEnabled", () => ({
  useWorkflowFeaturesEnabled: () => true,
}));

const { ProjectModelCell } = await import("../ProjectModelCell");

function renderCell(profile: string | null) {
  const html = renderToStaticMarkup(
    <ProjectModelCell
      projectPath="/tmp/proj"
      projectLabel="proj"
      seedModel={null}
      seedDriveMode="autopilot"
      profile={profile}
    />,
  );
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
}

const modeLine = (doc: Document) =>
  doc.querySelector('[data-testid="picker-recent-mode-line"]');

describe("ProjectModelCell × profile, gate ON (F-b ruling 4)", () => {
  it("DEFAULT profile: the drive-mode line exists (positive control)", () => {
    const doc = renderCell(null);
    expect(modeLine(doc)).not.toBeNull();
    expect(doc.body.textContent).toContain("autopilot");
  });

  it("NON-DEFAULT profile: no drive-mode line and no drive-mode vocabulary", () => {
    const doc = renderCell("neo");
    expect(modeLine(doc)).toBeNull();
    expect(
      doc.querySelector('[data-testid="picker-recent-mode-select"]'),
    ).toBeNull();
    expect(doc.body.textContent).not.toContain("autopilot");
    expect(doc.body.innerHTML).not.toContain("Drive Mode");
  });
});
