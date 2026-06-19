import { describe, expect, it } from "vitest";
import { pruneToastMessage } from "../pruneToast";
import type { RecentProject } from "../ProjectPicker";

const proj = (path: string): RecentProject => ({ project_path: path });

describe("pruneToastMessage", () => {
  it("returns null when nothing was pruned (no toast)", () => {
    expect(pruneToastMessage([])).toBeNull();
  });

  it("uses the singular noun for exactly one dropped project", () => {
    const msg = pruneToastMessage([proj("/gone/one")]);
    expect(msg).toBe("Removed 1 project whose folder no longer exists.");
  });

  it("uses the plural noun for multiple dropped projects", () => {
    const msg = pruneToastMessage([proj("/gone/one"), proj("/gone/two")]);
    expect(msg).toBe("Removed 2 projects whose folder no longer exists.");
  });
});
