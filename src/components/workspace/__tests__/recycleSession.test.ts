import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ⚠️ Each factory returns a WRAPPER ARROW that calls the mock lazily — it must not reference
// the `const` directly. `vi.mock` is hoisted above these declarations, so a direct reference
// throws `Cannot access 'invokeMock' before initialization` at module-load time and the whole
// file fails to collect (0 tests run, which reads as a suite that "isn't there" rather than one
// that failed). This indirection is the repo's established convention — see `cleanExit.test.ts`.
const invokeMock = vi.fn();
const listenMock = vi.fn();
const injectCommandMock = vi.fn();
const markSessionCleanMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, handler: unknown) => listenMock(name, handler),
}));
vi.mock("../autoResumeFire", () => ({
  injectCommand: (...args: unknown[]) => injectCommandMock(...args),
}));
vi.mock("../../../state/cleanExit", () => ({
  markSessionClean: (...args: unknown[]) => markSessionCleanMock(...args),
}));

import {
  HANDOFF_COMMAND,
  recycleSession,
  RESTORE_COMMAND,
  RESTORE_SETTLE_MS,
  SESSION_MD_REL,
  waitForFreshSessionId,
  type RecycleInputs,
} from "../recycleSession";
import { FS_CHANGE_EVENT } from "../../../state/fsChange";
import { WORKSPACE_STATUS_EVENT } from "../../../state/workspaceStatus";

// M13 WP3 Phase 2 — the callable operation's contract.
//
// These tests drive the REAL `recycleSession` with the two Tauri event sources stubbed, because
// the property under test is the ORDERED SEQUENCE OF EFFECTS — and the ordering is where the
// operation can be wrong in ways that destroy an operator's work:
//
//   • marking the clean-exit route on a FAILED handoff → the next open silently skips `--continue`
//   • killing the session on a FAILED handoff → the work the handoff was meant to preserve is gone
//   • injecting the restore into the OLD session id → writes to a dead PTY, restore never happens
//
// ⚠️ The negative arm is asserted as hard as the positive one, per the phase's Observable
// Outcomes. A test that only proves the happy path would pass on an implementation that recycles
// unconditionally — which is the single most damaging way to get this wrong.

/** Event-source doubles: capture each subscriber so a test can drive signals by hand. */
type Handler = (event: { payload: unknown }) => void;
let fsHandlers: Handler[] = [];
let statusHandlers: Handler[] = [];
let unlistenCalls = 0;

/** The ordered log of every externally-visible effect, in the order it happened. */
let effects: string[] = [];

const WS = "ws-1";
const PROJECT = "/Users/dev/proj";
const OLD_SID = "sid-old";
const NEW_SID = "sid-new";
const SESSION_MD = "workflow-system/state/.session.md";

function baseInputs(over: Partial<RecycleInputs> = {}): RecycleInputs {
  return {
    workspaceId: WS,
    projectPath: PROJECT,
    ccSessionId: OLD_SID,
    relaunch: () => effects.push("relaunch"),
    awaitFreshSessionId: async () => {
      effects.push("awaitFreshSessionId");
      return NEW_SID;
    },
    restoreSettleMs: 0,
    completionTimeoutMs: 50,
    ...over,
  };
}

/** Emit an `fs-change` naming `.session.md` for this workspace. */
function emitSessionMdWrite() {
  for (const h of fsHandlers) {
    h({
      payload: {
        workspace_id: WS,
        paths: [SESSION_MD],
        kind: "modified",
        git_meta: false,
      },
    });
  }
}

/** Emit the `workspace-status` event the backend maps from a `Stop` hook. */
function emitStop() {
  for (const h of statusHandlers) {
    h({ payload: { workspace_id: WS, state: "idle" } });
  }
}

/** Let queued microtasks (the async stat inside the fs handler) drain. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  fsHandlers = [];
  statusHandlers = [];
  unlistenCalls = 0;
  effects = [];
  vi.clearAllMocks();

  listenMock.mockImplementation((name: string, handler: Handler) => {
    if (name === FS_CHANGE_EVENT) fsHandlers.push(handler);
    if (name === WORKSPACE_STATUS_EVENT) statusHandlers.push(handler);
    return Promise.resolve(() => {
      unlistenCalls += 1;
    });
  });

  // `stat_file` — the baseline read and each post-event read. Default: file absent.
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === "stat_file") return Promise.reject(new Error("ENOENT"));
    return Promise.resolve();
  });

  injectCommandMock.mockImplementation(
    async (_sid: string, command: string) => {
      effects.push(`inject:${command}`);
    },
  );
  markSessionCleanMock.mockImplementation((_p: string, route: string) => {
    effects.push(`markClean:${route}`);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the success path — the full ordered sequence", () => {
  it("performs handoff → markClean → relaunch → restore, IN THAT ORDER", async () => {
    // `stat_file`: absent at baseline (no `.session.md`), then present after the write.
    invokeMock.mockImplementationOnce(() =>
      Promise.reject(new Error("ENOENT")),
    );
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "stat_file")
        return Promise.resolve({ mtime_ms: 5_000, size: 800 });
      return Promise.resolve();
    });

    const promise = recycleSession(baseInputs());
    await tick();
    emitSessionMdWrite();
    await tick();
    emitStop();
    const outcome = await promise;

    expect(outcome).toEqual({ ok: true });
    // ⚠️ Asserted as an ORDERED array, so a reordering fails. Each position matters:
    // the clean mark must precede the kill, and the restore must follow the fresh id.
    expect(effects).toEqual([
      `inject:${HANDOFF_COMMAND}`,
      "markClean:recycle-session",
      "relaunch",
      "awaitFreshSessionId",
      `inject:${RESTORE_COMMAND}`,
    ]);
  });

  it("injects the restore into the FRESH session id, never the killed one", async () => {
    // The silent-failure shape: typing into the pre-recycle id writes to a dead PTY, so the
    // restore never happens and the only symptom is a console.warn nobody reads.
    invokeMock.mockImplementationOnce(() =>
      Promise.reject(new Error("ENOENT")),
    );
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "stat_file"
        ? Promise.resolve({ mtime_ms: 5_000, size: 800 })
        : Promise.resolve(),
    );

    const promise = recycleSession(baseInputs());
    await tick();
    emitSessionMdWrite();
    await tick();
    emitStop();
    await promise;

    const restoreCall = injectCommandMock.mock.calls.find(
      (c) => c[1] === RESTORE_COMMAND,
    );
    expect(restoreCall?.[0]).toBe(NEW_SID);
    const handoffCall = injectCommandMock.mock.calls.find(
      (c) => c[1] === HANDOFF_COMMAND,
    );
    expect(handoffCall?.[0]).toBe(OLD_SID);
  });

  it("samples the baseline BEFORE injecting the handoff", async () => {
    // ⚠️ Load-bearing ordering: a baseline read after the injection can race the write and come
    // back NEWER than it, making the real write look stale and failing every Recycle.
    const order: string[] = [];
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "stat_file") {
        order.push("stat");
        return Promise.resolve({ mtime_ms: 1_000, size: 10 });
      }
      return Promise.resolve();
    });
    injectCommandMock.mockImplementation(async () => {
      order.push("inject");
    });

    const promise = recycleSession(baseInputs({ completionTimeoutMs: 10 }));
    await promise;

    expect(order[0]).toBe("stat");
    expect(order[1]).toBe("inject");
  });
});

describe("⚠️ the FAILURE arms — nothing is torn down", () => {
  it("run 2's shape (Stop, no write) does NOT markClean and does NOT relaunch", async () => {
    // The captured failure: CC returns a clean `Stop` having written nothing. Treating it as
    // success would kill a session whose handoff never happened.
    const promise = recycleSession(baseInputs());
    await tick();
    emitStop();
    const outcome = await promise;

    expect(outcome).toEqual({ ok: false, reason: "no-fresh-write" });
    expect(effects).toEqual([`inject:${HANDOFF_COMMAND}`]);
    expect(markSessionCleanMock).not.toHaveBeenCalled();
  });

  it("a STALE write followed by Stop does NOT markClean and does NOT relaunch", async () => {
    // Baseline newer than the write ⇒ the pointer is left over from an earlier session.
    invokeMock.mockImplementationOnce(() =>
      Promise.resolve({ mtime_ms: 9_000, size: 800 }),
    );
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "stat_file"
        ? Promise.resolve({ mtime_ms: 5_000, size: 800 })
        : Promise.resolve(),
    );

    const promise = recycleSession(baseInputs());
    await tick();
    emitSessionMdWrite();
    await tick();
    emitStop();
    const outcome = await promise;

    expect(outcome).toEqual({ ok: false, reason: "no-fresh-write" });
    expect(markSessionCleanMock).not.toHaveBeenCalled();
    expect(effects).toEqual([`inject:${HANDOFF_COMMAND}`]);
  });

  it("a timeout does NOT markClean and does NOT relaunch", async () => {
    const outcome = await recycleSession(
      baseInputs({ completionTimeoutMs: 10 }),
    );
    expect(outcome).toEqual({ ok: false, reason: "timeout" });
    expect(markSessionCleanMock).not.toHaveBeenCalled();
    expect(effects).toEqual([`inject:${HANDOFF_COMMAND}`]);
  });

  it("a null session id is refused before anything is injected", async () => {
    const outcome = await recycleSession(baseInputs({ ccSessionId: null }));
    expect(outcome).toEqual({ ok: false, reason: "no-session" });
    expect(injectCommandMock).not.toHaveBeenCalled();
    expect(effects).toEqual([]);
  });

  it("reports failure when the respawn yields no session id — the flag stays CLEARED", async () => {
    // The handoff DID complete, so the clean mark is correct and must NOT be rolled back; only
    // the restore was missed. Reporting success here would hide a session the operator must
    // restore by hand.
    invokeMock.mockImplementationOnce(() =>
      Promise.reject(new Error("ENOENT")),
    );
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "stat_file"
        ? Promise.resolve({ mtime_ms: 5_000, size: 800 })
        : Promise.resolve(),
    );

    const promise = recycleSession(
      baseInputs({ awaitFreshSessionId: async () => null }),
    );
    await tick();
    emitSessionMdWrite();
    await tick();
    emitStop();
    const outcome = await promise;

    // ⚠️ A DISTINCT reason from the null-session arm. Verify-self caught these sharing one
    // string: they have opposite operator consequences (nothing happened vs. your session was
    // recycled and needs a manual restore), so a caller rendering a message cannot tell them
    // apart. The two assertions below — this reason, and the `no-session` one in the null-id
    // test — are what keep them distinguishable.
    expect(outcome).toEqual({ ok: false, reason: "restore-not-injected" });
    expect(markSessionCleanMock).toHaveBeenCalledWith(
      PROJECT,
      "recycle-session",
    );
    expect(
      injectCommandMock.mock.calls.some((c) => c[1] === RESTORE_COMMAND),
    ).toBe(false);
  });
});

describe("signal filtering and subscription hygiene", () => {
  it("ignores fs-change events for OTHER workspaces", async () => {
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "stat_file"
        ? Promise.resolve({ mtime_ms: 5_000, size: 800 })
        : Promise.resolve(),
    );

    const promise = recycleSession(baseInputs({ completionTimeoutMs: 30 }));
    await tick();
    for (const h of fsHandlers) {
      h({
        payload: {
          workspace_id: "ws-OTHER",
          paths: [SESSION_MD],
          kind: "modified",
          git_meta: false,
        },
      });
    }
    await tick();
    emitStop();
    const outcome = await promise;

    // The other workspace's write is not evidence, so the Stop lands with no fresh write.
    expect(outcome).toEqual({ ok: false, reason: "no-fresh-write" });
  });

  it("ignores status events for OTHER workspaces", async () => {
    const promise = recycleSession(baseInputs({ completionTimeoutMs: 30 }));
    await tick();
    for (const h of statusHandlers) {
      h({ payload: { workspace_id: "ws-OTHER", state: "idle" } });
    }
    const outcome = await promise;
    // The foreign Stop must not decide this operation; only the timeout ends it.
    expect(outcome).toEqual({ ok: false, reason: "timeout" });
  });

  it("ignores non-idle status events (only Stop→idle counts)", async () => {
    const promise = recycleSession(baseInputs({ completionTimeoutMs: 30 }));
    await tick();
    for (const h of statusHandlers) {
      h({ payload: { workspace_id: WS, state: "running" } });
      h({ payload: { workspace_id: WS, state: "awaiting_input" } });
    }
    const outcome = await promise;
    expect(outcome).toEqual({ ok: false, reason: "timeout" });
  });

  it("ignores fs-change batches that do not name .session.md", async () => {
    const promise = recycleSession(baseInputs({ completionTimeoutMs: 30 }));
    await tick();
    for (const h of fsHandlers) {
      h({
        payload: {
          workspace_id: WS,
          paths: ["src/main.rs", "README.md"],
          kind: "modified",
          git_meta: false,
        },
      });
    }
    await tick();
    emitStop();
    const outcome = await promise;
    expect(outcome).toEqual({ ok: false, reason: "no-fresh-write" });
  });

  it("unsubscribes BOTH sources on a terminal state", async () => {
    // A leaked listener would keep feeding a completed operation and, worse, accumulate one
    // subscription per Recycle for the app's lifetime.
    const promise = recycleSession(baseInputs());
    await tick();
    emitStop();
    await promise;
    expect(unlistenCalls).toBe(2);
  });

  it("unsubscribes on the timeout arm too", async () => {
    await recycleSession(baseInputs({ completionTimeoutMs: 10 }));
    expect(unlistenCalls).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2.7 / P2.8 — caller-side guards.
// ─────────────────────────────────────────────────────────────────────────────

describe("P2.7 — the auto-resume latch stays closed across a recycle", () => {
  it("injects /session-restore EXACTLY ONCE on a successful recycle", async () => {
    // ⚠️ Finding E, pinned rather than assumed. `hasFiredRef` in XtermPane is consume-once for
    // the pane's whole lifetime and is deliberately NOT cleared by relaunch — because M12 shipped
    // a defect where a relaunch re-fired `/session-restore` against a `.session.md` the first
    // fire had already deleted. Recycle therefore owns the ONLY restore injection.
    //
    // ⚠️ If someone "fixes" that latch so the automatic arm also fires after a relaunch, this
    // test is what catches the resulting double-restore. Do not delete it as redundant with the
    // ordered-effects test above: that one asserts the sequence, this one asserts the COUNT.
    invokeMock.mockImplementationOnce(() =>
      Promise.reject(new Error("ENOENT")),
    );
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "stat_file"
        ? Promise.resolve({ mtime_ms: 5_000, size: 800 })
        : Promise.resolve(),
    );

    const promise = recycleSession(baseInputs());
    await tick();
    emitSessionMdWrite();
    await tick();
    emitStop();
    await promise;

    const restores = injectCommandMock.mock.calls.filter(
      (c) => c[1] === RESTORE_COMMAND,
    );
    expect(restores).toHaveLength(1);
  });

  it("labels its injections 'recycle', not 'auto-resume' or 'skill-button'", async () => {
    // `console.warn` is this path's ONLY failure channel, and `injectCommand` defaults the prefix
    // to `auto-resume`. An unlabelled Recycle failure would be reported as M12's AUTOMATIC arm
    // misfiring — pointing the one available diagnostic at the wrong feature (the exact bug WP2
    // added the `label` parameter to fix).
    const promise = recycleSession(baseInputs({ completionTimeoutMs: 10 }));
    await promise;
    expect(injectCommandMock).toHaveBeenCalledWith(
      OLD_SID,
      HANDOFF_COMMAND,
      undefined,
      "recycle",
    );
  });
});

describe("P2.8 — the funnel is the ONLY route to the recycle clean-exit mark", () => {
  it("no production module outside the funnel sends the 'recycle-session' route", async () => {
    // ⚠️ A caller-side guard, not a machine-side one. The standing defect in this codebase is a
    // correct mechanism behind a caller that does not honor it — and the state this protects is
    // the unclean-exit flag: marking it clean WITHOUT the completion check is precisely how a
    // recycle would silently discard a session whose handoff never happened.
    //
    // ⚠️ Guards the STATE-MUTATING call, not enum membership. WP1's retracted `AppQuit` finding
    // is the cautionary case: auditing one mechanism's callers and generalizing to a second
    // writer produced a confident, wrong conclusion. `CleanExitRoute::ALL` containing the variant
    // proves nothing about who can send it.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const srcRoot = path.resolve(__dirname, "../../..");

    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "__tests__" || entry.name === "node_modules")
            continue;
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        // The funnel itself is the sanctioned sender.
        if (full.endsWith(path.join("workspace", "recycleSession.ts")))
          continue;
        // Strip comments so prose ABOUT the route cannot satisfy or trip the guard — the
        // `?raw`-guard lesson: a bare identifier is otherwise matched by a module's own docs.
        const src = fs
          .readFileSync(full, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        // ⚠️ Match the CALL SHAPE, not the bare string. A predicate of `includes("recycle-session")`
        // was tried first and flagged `state/cleanExit.ts`, whose only match is the TYPE UNION
        // that DECLARES the route (`export type CleanExitRoute = … | "recycle-session"`). That is
        // the vocabulary definition — the very thing every sender must reference — not a send.
        // ⚠️ The tempting fix was to exempt `cleanExit.ts` by path; that would have been wrong in
        // the dangerous direction, since a real errant `markSessionClean(…, "recycle-session")`
        // added to that same file later would then go unseen. Narrowing the PREDICATE keeps the
        // file in scope. (Same lesson as `[[raw-guard-identifier-satisfied-by-own-comments]]`:
        // assert the call, not the identifier.)
        if (/markSessionClean\s*\([^)]*"recycle-session"/s.test(src)) {
          offenders.push(full);
        }
      }
    };
    walk(srcRoot);

    expect(offenders).toEqual([]);
  });

  it("is not vacuous — the funnel itself DOES send that route", async () => {
    // Anti-vacuity companion. Without this, the guard above passes forever if the funnel stops
    // marking the route at all — a green test over a feature that silently regressed.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const funnel = fs.readFileSync(
      path.resolve(__dirname, "../recycleSession.ts"),
      "utf8",
    );
    expect(funnel).toContain(
      'markSessionClean(projectPath, "recycle-session")',
    );
  });
});

describe("⚠️ the two caller-failure reasons stay DISTINGUISHABLE", () => {
  it("no-session and restore-not-injected are different values", async () => {
    // Verify-self caught these sharing one `"no-session"` string. This test is what stops a
    // future edit from re-collapsing them: the two situations are structurally OPPOSITE —
    //   • no-session           → nothing happened; no handoff, no kill, no work at risk
    //   • restore-not-injected → the handoff SUCCEEDED, the flag was marked, CC WAS recycled;
    //                            only the restore was missed, so the operator must run it
    // A Phase 3 caller renders a message from this value, and telling someone "nothing
    // happened" when their session was just recycled is the failure this pins against.
    const nothingHappened = await recycleSession(
      baseInputs({ ccSessionId: null }),
    );

    invokeMock.mockImplementationOnce(() =>
      Promise.reject(new Error("ENOENT")),
    );
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "stat_file"
        ? Promise.resolve({ mtime_ms: 5_000, size: 800 })
        : Promise.resolve(),
    );
    const promise = recycleSession(
      baseInputs({ awaitFreshSessionId: async () => null }),
    );
    await tick();
    emitSessionMdWrite();
    await tick();
    emitStop();
    const recycledButNotRestored = await promise;

    expect(nothingHappened).toEqual({ ok: false, reason: "no-session" });
    expect(recycledButNotRestored).toEqual({
      ok: false,
      reason: "restore-not-injected",
    });
    // The load-bearing assertion: whatever the strings are, they must not be EQUAL.
    expect(nothingHappened).not.toEqual(recycledButNotRestored);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify-codify — the cross-boundary constants.
// ─────────────────────────────────────────────────────────────────────────────

describe("verify-codify: constants that mirror another source of truth", () => {
  // Coverage audit at codify found three exported constants with NO test. Two of them mirror a
  // value owned elsewhere, which is the shape that drifts silently — the third
  // (RECYCLE_TIMEOUT_MS) is a local budget owned here, so there is nothing to drift against and
  // asserting `180_000 === 180_000` would be a tautology. Only the mirrors are pinned.

  it("⚠️ SESSION_MD_REL matches Rust's announce::SESSION_MD_REL verbatim", async () => {
    // The one constant that CANNOT be imported — it lives across the language boundary. If the
    // workflow system ever relocates `.session.md`, Rust changes and this copy silently does not;
    // Recycle would then wait forever for a write to a path nobody produces, and time out with a
    // reason ("timeout") that points at the wrong cause entirely.
    //
    // ⚠️ Reads the RUST SOURCE, not a second TS copy — a test comparing two TS constants proves
    // only that I typed the same string twice. Same method as `autoResumeFire.test.ts`'s
    // Rust↔TS byte-payload mirror.
    const fs = await import("node:fs");
    const url = await import("node:url");
    const rustSrc = fs.readFileSync(
      url.fileURLToPath(
        new URL("../../../../src-tauri/src/announce/mod.rs", import.meta.url),
      ),
      "utf8",
    );
    const match = rustSrc.match(
      /pub const SESSION_MD_REL:\s*&str\s*=\s*"([^"]+)"/,
    );
    // Non-vacuity floor: if the Rust constant is renamed or removed, fail loudly rather than
    // skipping the comparison and reporting green.
    expect(
      match,
      "announce::SESSION_MD_REL not found in the Rust source — the mirror this test pins no " +
        "longer exists under that name, so the comparison below would be vacuous",
    ).not.toBeNull();
    expect(SESSION_MD_REL).toBe(match?.[1]);
  });

  it("RESTORE_SETTLE_MS is DERIVED from M12's INJECT_SETTLE_MS, not a copy", async () => {
    // Pins the fix made at codify: the value was hardcoded `1_500` with a comment claiming it
    // mirrored M12. Retuning INJECT_SETTLE_MS would have left this stale, and the symptom — a
    // restore typed into a TUI not yet reading stdin — is a DROPPED command with no error.
    const { INJECT_SETTLE_MS } = await import("../../../state/predictAction");
    expect(RESTORE_SETTLE_MS).toBe(INJECT_SETTLE_MS);
  });

  it("the handoff/restore commands are the real companion-skill names", () => {
    // ⚠️ `/session-resume` and `/session-pause` DO NOT EXIST — they were renamed to
    // `/session-restore` / `/session-handoff` at M9 WP5. Typing a dead command would make CC print
    // "unknown command" and the composite marker would never fire. The command name is the only
    // sanctioned cross-repo coupling (arch §4c), so it is worth pinning literally.
    expect(HANDOFF_COMMAND).toBe("/session-handoff");
    expect(RESTORE_COMMAND).toBe("/session-restore");
  });
});

describe("waitForFreshSessionId — the respawn handshake (M13 WP3 P3.1)", () => {
  it("⚠️ does NOT return the KILLED id, even while the ref still holds it", async () => {
    // THE TRAP this helper exists for. After `relaunch()` the caller's mirrored id still holds
    // the OLD value until the respawn resolves and pushes a new one, so a naive "wait until not
    // null" poll returns the id of the session just killed — and `/session-restore` gets typed
    // into a dead PTY, vanishing into `injectCommand`'s `.catch` with only a console.warn.
    const ref = { current: "sid-old" as string | null };
    const got = await waitForFreshSessionId(ref, "sid-old", 150, 20);
    expect(got).toBeNull();
  });

  it("returns the fresh id when an ASYNCHRONOUS writer updates the ref", async () => {
    // The real timing: `Workspace` mirrors the prop into the ref inside an EFFECT (a render-phase
    // ref write is an eslint error and invisible to React's update model), so the value lands
    // after commit — strictly later than the call that started the poll.
    const ref = { current: "sid-old" as string | null };
    setTimeout(() => {
      ref.current = "sid-new";
    }, 60);
    expect(await waitForFreshSessionId(ref, "sid-old", 2_000, 20)).toBe(
      "sid-new",
    );
  });

  it("returns null on timeout rather than throwing", async () => {
    // The caller maps null → `restore-not-injected`, a reportable outcome. A throw would have to
    // be caught somewhere or it would reject the whole operation and lose the fact that the
    // handoff itself succeeded.
    const ref = { current: null as string | null };
    await expect(
      waitForFreshSessionId(ref, "sid-old", 80, 20),
    ).resolves.toBeNull();
  });

  it("treats a null ref as not-yet-respawned, not as a fresh id", async () => {
    // `null !== "sid-old"` is true, so a predicate testing only inequality would return null as
    // if it were a session id. Both conditions are required.
    const ref = { current: null as string | null };
    setTimeout(() => {
      ref.current = "sid-new";
    }, 60);
    expect(await waitForFreshSessionId(ref, "sid-old", 2_000, 20)).toBe(
      "sid-new",
    );
  });
});

describe("⚠️ the measured latencies have exactly ONE authority", () => {
  // M13 WP4 P4.4 codify. The figures were restated across NINE lines in FIVE files, which is
  // verbatim the failure `CLAUDE.md` names: *"duplication is the expensive half — the same
  // rationale in six places drifts asymmetrically"*, flagged in FOUR CONSECUTIVE REVIEWS of one
  // file. WP4 collapsed them to `RECYCLE_TIMEOUT_MS`'s doc comment, where a figure is actually
  // load-bearing (it derives the constant). ⚠️ Nothing stopped that from re-accumulating, so a
  // paydown without a guard is a paydown that silently undoes itself.
  //
  // ⚠️ EN DASH (U+2013), not a hyphen. The verify-self pass first reported ZERO matches because
  // a shell mangled the character — which reads as a STRONGER pass than the truth. These are
  // TS string literals, so the bytes are exact and no shell is involved.
  //
  // ⚠️ SCOPE, stated because the guard otherwise claims more than it enforces (code-quality
  // review): this polices **non-test modules under `src/` only**. Deliberately OUT of scope, and
  // still carrying figures today:
  //   - `src/state/__tests__/recycleMachine.test.ts:106` — a test NAME; renaming churns the
  //     suite for nothing, and a test name is not a site a reader treats as authority.
  //   - `workflow-system/product/*.md` (`wbs.md`, `roadmap.md`) — the WBS/roadmap are the
  //     *historical record* of what WP1 measured; rewriting them to point at code would erase
  //     the provenance that makes the authority's table trustworthy.
  // The invariant this enforces is therefore narrower than "the figure appears once anywhere":
  // it is "no PRODUCTION MODULE restates a figure", which is where asymmetric drift actually
  // costs a reader deciding whether the constant is still right.
  const FIGURES = ["28\u201352", "51.9", "9\u201312"];

  /** Every non-test module under `src/` that could restate a figure. */
  async function nonTestSources(): Promise<string[]> {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(__dirname, "../../..");
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          if (entry !== "__tests__") walk(full);
        } else if (/\.(tsx?|css)$/.test(entry)) {
          out.push(full);
        }
      }
    };
    walk(root);
    return out;
  }

  it("no production module outside the authority restates a measured figure", async () => {
    const fs = await import("node:fs");
    const files = await nonTestSources();
    const offenders = files.filter((f) => {
      if (f.endsWith("recycleSession.ts")) return false; // THE authority
      const src = fs.readFileSync(f, "utf8");
      return FIGURES.some((fig) => src.includes(fig));
    });
    expect(
      offenders.map((f) => f.split("/src/")[1]),
      "these modules restate a latency figure — point at RECYCLE_TIMEOUT_MS instead; the " +
        "figures live in exactly one place so they cannot drift apart",
    ).toEqual([]);
  });

  it("is not vacuous — the authority itself DOES carry every figure", async () => {
    // Without this, the guard above passes trivially if the figures are deleted everywhere,
    // which would "fix" duplication by destroying the measurement — the wrong direction.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const authority = fs.readFileSync(
      path.resolve(__dirname, "../recycleSession.ts"),
      "utf8",
    );
    for (const fig of FIGURES) {
      expect(authority, `the authority must still carry ${fig}`).toContain(fig);
    }
  });

  it("the walker reaches a non-trivial set, and really sees the pointer sites", async () => {
    // A walker resolving to the wrong root or returning [] would make the arm above pass having
    // scanned nothing — the vacuous-guard shape this repo keeps hitting.
    const files = await nonTestSources();
    const rel = files.map((f) => f.split("/src/")[1]);
    expect(files.length).toBeGreaterThan(50);
    for (const site of [
      "App.css",
      "components/workspace/Workspace.tsx",
      "components/workspace/recycleButton.ts",
      "state/recycleMachine.ts",
    ]) {
      expect(rel, `the walker must reach ${site}`).toContain(site);
    }
  });
});
