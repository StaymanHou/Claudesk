// Link check: run the real production build (rollup) over BOTH webview entries
// (`index.html` + `pip.html`, from vite.config.ts) and fail if any static
// import cannot be bound. Writes nothing (`write: false`).
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
//     main.tsx's dev-only probe harnesses use this shape.
//   - Dependency (node_modules) CJS interop differs between this bundled build
//     and the unbundled dev server; a missing export from a CJS dependency may
//     pass here.
//   - It does not boot or render anything. Evaluation- and mount-time throws are
//     src/__tests__/appBoot.test.tsx's job.
//
// Usage: `node tooling/link-check/linkCheck.mjs [root]`. `root` defaults to the
// cwd (the repo, via `pnpm check:link`). linkCheck.test.ts passes a fixture
// project so the SAME code path is exercised on a known-broken graph.
import { build } from "vite";
import process from "node:process";

const root = process.argv[2] ?? process.cwd();

try {
  await build({
    root,
    logLevel: "error",
    build: { write: false },
  });
  console.log("check:link — every entry linked cleanly");
} catch (err) {
  console.error("check:link — FAILED: an import cannot be bound");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
