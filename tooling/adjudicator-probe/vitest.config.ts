import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// M16.5 WP2 — the adjudicator re-measurement probe. Run on demand only:
//   pnpm vitest run --config tooling/adjudicator-probe/vitest.config.ts <mine|sheet|freeze|score>
// ⚠️ The `*.probe.ts` files read `~/.claude/projects` and spawn `claude -p`, so they are kept
// out of the default `vitest run` (and so out of `verify:auto`) by their suffix.
export default defineConfig({
  root: resolve(__dirname, "../.."),
  test: {
    include: ["tooling/adjudicator-probe/*.probe.ts"],
    testTimeout: 0,
    hookTimeout: 0,
  },
});
