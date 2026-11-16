import { describe, expect, it } from "vitest";
import {
  promptInjectFailure,
  recycleInjectFailure,
  skillInjectFailure,
} from "../injectFailure";

// M17 WP3 P4.verify-human.2 — the toast's words. The backend's reason is shown VERBATIM.
const REASON =
  "Claude Code on host.example isn't ready for input yet (waited 15s)";

describe("injectFailure wording", () => {
  it("a skill command names the command and carries the reason", () => {
    expect(skillInjectFailure("/session-restore", REASON)).toBe(
      `/session-restore was not sent: ${REASON}`,
    );
  });

  it("a prompt says it was not sent AND where the text went", () => {
    // The panel archives + clears before the injection settles, so without "Recent" the
    // operator would believe the text was lost as well as unsent.
    expect(promptInjectFailure(REASON)).toBe(
      `Your prompt was not sent: ${REASON}. The text is in Recent.`,
    );
  });
});

describe("recycleInjectFailure (P4.6) — the two steps have opposite consequences", () => {
  it("a refused handoff says nothing was changed", () => {
    expect(recycleInjectFailure("handoff", REASON)).toBe(
      `Recycle stopped, nothing was changed: /session-handoff was not sent: ${REASON}.`,
    );
  });
  it("a refused restore says the recycle happened and what to run", () => {
    expect(recycleInjectFailure("restore", REASON)).toBe(
      `Recycled, but /session-restore was not sent: ${REASON}. Run /session-restore yourself.`,
    );
  });
});
