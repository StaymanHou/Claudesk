// Codify tests for M8 WP5 — the committed demo GIFs embedded in the root README.
// Run with Node's built-in runner:
//   node --test readme-assets.nodetest.mjs
//
// Named `.nodetest.mjs` (NOT `.test.mjs`/`.spec.mjs`) on purpose — see the note
// in args.nodetest.mjs: this dev-only M8 tooling runs under `node --test`, not
// the app's vitest.
//
// What this guards (the WP5-verified behavior): the two demo GIFs that WP5
// committed to docs/demo/ and embedded near the top of README.md must (a) exist
// at the exact relative path the README's <img src> points to, (b) stay under
// the 3 MB README-embed budget, and (c) remain real animated GIFs. The catchable
// regression: a GIF gets deleted/renamed/bloated while README.md still links it,
// leaving a broken or oversized image on the project's front page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Repo root = two levels up from tooling/demo/.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const readmePath = fileURLToPath(new URL("../../README.md", import.meta.url));

const BUDGET_BYTES = 3 * 1024 * 1024; // 3 MB — GitHub inline-embed budget (per M8 WBS)

// Extract every docs/demo/<name>.gif path the README references via an <img src> /
// markdown image. The capture is intentionally narrow to docs/demo/*.gif so the
// test fails loudly if a future edit moves the committed assets elsewhere without
// updating this guard.
function referencedDemoGifs() {
  const readme = readFileSync(readmePath, "utf8");
  const matches = readme.matchAll(/docs\/demo\/[\w.-]+\.gif/g);
  return [...new Set([...matches].map((m) => m[0]))];
}

test("README references both M8 demo GIFs (filmstrip + pip)", () => {
  const refs = referencedDemoGifs();
  assert.ok(
    refs.includes("docs/demo/filmstrip.gif"),
    `README must embed docs/demo/filmstrip.gif (found: ${refs.join(", ") || "none"})`,
  );
  assert.ok(
    refs.includes("docs/demo/pip.gif"),
    `README must embed docs/demo/pip.gif (found: ${refs.join(", ") || "none"})`,
  );
});

test("every README-referenced demo GIF exists at its relative path", () => {
  for (const rel of referencedDemoGifs()) {
    const abs = repoRoot + rel;
    assert.ok(existsSync(abs), `README references ${rel} but the file is missing`);
  }
});

test("every referenced demo GIF is under the 3 MB README-embed budget", () => {
  for (const rel of referencedDemoGifs()) {
    const bytes = statSync(repoRoot + rel).size;
    assert.ok(
      bytes < BUDGET_BYTES,
      `${rel} is ${bytes} bytes, over the ${BUDGET_BYTES}-byte budget`,
    );
  }
});

test("every referenced demo GIF is a real animated GIF (magic + >1 frame)", () => {
  for (const rel of referencedDemoGifs()) {
    const buf = readFileSync(repoRoot + rel);
    const head = buf.subarray(0, 6).toString("latin1");
    assert.ok(
      head === "GIF89a" || head === "GIF87a",
      `${rel} has magic "${head}" — expected GIF89a/GIF87a`,
    );
    // The name claims "animated", so prove it: count frames, not just the magic.
    // Each frame in a GIF is preceded by a Graphic Control Extension block
    // (introducer 0x21 'extension', label 0xF9 'GCE'). A single-frame GIF89a has
    // ≤1 GCE and would pass a magic-only check — this asserts ≥2, i.e. animation.
    let frames = 0;
    for (let i = 0; i + 1 < buf.length; i++) {
      if (buf[i] === 0x21 && buf[i + 1] === 0xf9) frames++;
    }
    assert.ok(
      frames >= 2,
      `${rel} has ${frames} frame marker(s) — expected ≥2 (a static GIF, not animated)`,
    );
  }
});
