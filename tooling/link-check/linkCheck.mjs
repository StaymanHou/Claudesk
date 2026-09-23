// Link check: run the real production build (rollup) over both webview entries
// (`main` = index.html, `pip` = pip.html, from vite.config.ts) and fail if the
// build fails, e.g. a static import that cannot be bound. Writes nothing
// (`write: false`). ⚠️ Both entries are ASSERTED, not assumed: the build output's
// entry chunks must include every required name, so narrowing
// `rollupOptions.input` to one entry exits 1 instead of silently checking half
// the app.
//
// Why a build and not a test: under Vitest, importing a module whose consumer
// names a deleted export does NOT throw. The module runner reads the binding as
// a property, so it is silently `undefined` (probed 2026-09-23). In the webview
// the same import is a `SyntaxError: Importing binding name … is not found`
// that aborts `main.tsx` before React mounts (the M13.5 WP3 blank app). Rollup
// is a strict ESM linker over the same esbuild-transformed TS, so it rejects
// the import at build time: `"x" is not exported by "a.ts", imported by "b.tsx"`.
//
// What it does NOT prove:
//   - A destructured DYNAMIC import (`const { X } = await import("./y")`) is a
//     property read at runtime, so a missing `X` is `undefined`, not an error.
//     main.tsx's probe harnesses use this shape: URL-flag-gated lazy chunks that
//     DO ship in the bundle. Rollup links their own static imports; only the
//     names destructured at the `import()` site go unchecked.
//   - Dependency (node_modules) CJS interop differs between this bundled build
//     and the unbundled dev server; a missing export from a CJS dependency may
//     pass here.
//   - It does not boot or render anything. Evaluation- and mount-time throws are
//     src/__tests__/appBoot.test.tsx's job.
//
// Usage: `node tooling/link-check/linkCheck.mjs [root] [--entries a,b]`. `root`
// defaults to the cwd (the repo, via `pnpm check:link`); `--entries` defaults to
// `main,pip`. linkCheck.test.ts passes fixture projects (and their own entry
// names) so the SAME code path is exercised on known-broken graphs.
import { build } from "vite";
import process from "node:process";

let root = process.cwd();
let required = ["main", "pip"];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--entries") required = args[++i].split(",");
  else root = args[i];
}

let result;
try {
  result = await build({
    root,
    logLevel: "error",
    build: { write: false },
  });
} catch (err) {
  console.error(
    "check:link — FAILED: the build failed (rollup's reason follows)",
  );
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

// `write: false` returns the RollupOutput (an array of them for a multi-output
// config). Entry chunks carry the rollup input's name.
const outputs = Array.isArray(result) ? result : [result];
const built = outputs.flatMap((o) =>
  o.output.filter((c) => c.type === "chunk" && c.isEntry).map((c) => c.name),
);
const missing = required.filter((name) => !built.includes(name));
if (missing.length > 0) {
  console.error(
    `check:link — FAILED: required entry chunk(s) missing from the build: ` +
      `${missing.join(", ")} (built: ${built.join(", ") || "none"}). ` +
      `An entry that is not built is not link-checked.`,
  );
  process.exit(1);
}
console.log(`check:link — every entry linked cleanly (${built.join(", ")})`);
