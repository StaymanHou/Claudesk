import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  LOCAL_SURFACES,
  isRemoteKey,
  remoteAuthority,
  workspaceSurfaces,
  type WorkspaceSurfaces,
} from "../workspaceSurfaces";

// M17 WP6 (AC-1) — the workspace-kind funnel.

const REMOTE = "ssh://me@mini-host/Users/me/proj";
const LOCAL = "/Users/me/proj";

describe("workspaceSurfaces", () => {
  it("a remote key makes every listed surface absent", () => {
    const s = workspaceSurfaces(REMOTE);
    const present = (Object.keys(s) as (keyof WorkspaceSurfaces)[]).filter(
      (k) => s[k],
    );
    expect(present).toEqual([]);
  });

  it("a local key makes every surface present", () => {
    const s = workspaceSurfaces(LOCAL);
    expect(Object.values(s).every((v) => v === true)).toBe(true);
    expect(s).toBe(LOCAL_SURFACES);
  });

  it("names the surfaces the spec lists (a dropped field fails here, not silently)", () => {
    expect(Object.keys(LOCAL_SURFACES).sort()).toEqual(
      [
        "editor",
        "diff",
        "terminal",
        "fileTree",
        "finder",
        "projectSearch",
        "sublimeText",
        "sublimeMerge",
        "finderReveal",
        "defaultApp",
        "supervisor",
        "turnJump",
        "fsWatch",
      ].sort(),
    );
  });
});

describe("isRemoteKey / remoteAuthority", () => {
  it("keys on the ssh:// scheme only", () => {
    expect(isRemoteKey(REMOTE)).toBe(true);
    expect(isRemoteKey(LOCAL)).toBe(false);
    expect(isRemoteKey("")).toBe(false);
    expect(isRemoteKey("/tmp/ssh://x")).toBe(false);
  });

  it("returns the user@host authority of a remote key, null for a local one", () => {
    expect(remoteAuthority(REMOTE)).toBe("me@mini-host");
    expect(remoteAuthority(LOCAL)).toBeNull();
  });
});

// ⚠️ ONE remote test for the frontend. The five ad hoc `startsWith(REMOTE_KEY_PREFIX)` sites were
// migrated onto `isRemoteKey`; a sixth that re-derives the scheme check would be a second source
// of truth the funnel cannot see. Source-level on purpose: the question is "where does this
// string appear", which only the source can answer.
describe("the scheme check lives in the funnel only", () => {
  const SRC = join(__dirname, "..", "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "__tests__" || name === "node_modules") continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        files.push(p);
      }
    }
  };
  walk(SRC);

  it("scans a real tree (anti-vacuity)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith("workspaceSurfaces.ts"))).toBe(true);
  });

  it("no production module but workspaceSurfaces.ts names REMOTE_KEY_PREFIX or the ssh:// literal", () => {
    const offenders = files
      .filter((f) => !f.endsWith(join("state", "workspaceSurfaces.ts")))
      .filter((f) => {
        // Strip comments: prose may mention the scheme; code must not test it.
        const code = readFileSync(f, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|[^:])\/\/.*$/gm, "$1");
        return /REMOTE_KEY_PREFIX|["'`]ssh:\/\//.test(code);
      })
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
