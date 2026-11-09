// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mountPicker, teardownLive } from "./livePicker";

// M16.5 WP5 (5.7) — the picker page on a live mount (the consuming surface): not-open
// projects first by LAST CLOSED, then an "Open" group at the bottom whose rows carry the
// "open" mark and NO continue announcement / no-fire door (clicking one only switches).

let host: HTMLDivElement;

afterEach(teardownLive);

async function mount(openProjectPaths: string[]) {
  ({ el: host } = await mountPicker({
    // Backend order (descending last_opened_at), as `sort_by_recency` returns it.
    projects: [
      {
        project_path: "/p/open-now",
        display_name: "open-now",
        last_opened_at: 900,
      },
      {
        project_path: "/p/opened-late",
        display_name: "opened-late",
        last_opened_at: 800,
        last_closed_at: 100,
      },
      {
        project_path: "/p/closed-late",
        display_name: "closed-late",
        last_opened_at: 200,
        last_closed_at: 700,
      },
    ],
    // Both an open and a not-open project have a "continue" prediction.
    announce: { "/p/open-now": "continue", "/p/closed-late": "continue" },
    profiles: [],
    openProjectPaths,
  }));
}

function rows() {
  return [...host.querySelectorAll('[data-testid="picker-recents"] > li')].map(
    (li) =>
      li.getAttribute("data-testid") === "picker-open-group"
        ? "[OPEN]"
        : (li.querySelector(".picker-recent-name")?.textContent ?? "?"),
  );
}

const rowFor = (name: string) =>
  [...host.querySelectorAll('[data-testid="picker-recents"] > li')].find(
    (li) => li.querySelector(".picker-recent-name")?.textContent === name,
  )!;

describe("ProjectPicker order — live", () => {
  it("with nothing open: last closed first, no Open group", async () => {
    await mount([]);
    // The backend's order was open-now, opened-late, closed-late; the ruled order differs.
    expect(rows()).toEqual(["open-now", "closed-late", "opened-late"]);
  });

  it("with a workspace open: it moves to an Open group at the bottom, marked", async () => {
    await mount(["/p/open-now"]);
    expect(rows()).toEqual([
      "closed-late",
      "opened-late",
      "[OPEN]",
      "open-now",
    ]);
    // The "Open" label is a heading, not a row; the project rows stay plain list items.
    const items = [
      ...host.querySelectorAll('[data-testid="picker-recents"] > li'),
    ];
    const label = items.find(
      (li) => li.getAttribute("data-testid") === "picker-open-group",
    )!;
    expect(label.getAttribute("role")).toBe("presentation");
    expect(
      items.filter((li) => li !== label).map((li) => li.getAttribute("role")),
    ).toEqual([null, null, null]);
    const open = rowFor("open-now");
    expect(open.getAttribute("data-open")).toBe("true");
    expect(
      open.querySelector('[data-testid="picker-recent-open"]'),
    ).not.toBeNull();
    expect(
      rowFor("closed-late").querySelector('[data-testid="picker-recent-open"]'),
    ).toBeNull();
  });

  it("an open row shows no continue badge and no no-fire door; a closed one still does", async () => {
    await mount(["/p/open-now"]);
    const open = rowFor("open-now");
    const closed = rowFor("closed-late");
    // Positive control first: the same prediction DOES render on the not-open row.
    expect(
      closed.querySelector('[data-testid="picker-recent-announce"]'),
    ).not.toBeNull();
    expect(
      closed.querySelector('[data-testid="picker-recent-nofire"]'),
    ).not.toBeNull();
    expect(
      open.querySelector('[data-testid="picker-recent-announce"]'),
    ).toBeNull();
    expect(
      open.querySelector('[data-testid="picker-recent-nofire"]'),
    ).toBeNull();
  });
});
