import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// Flat config (ESLint v9). Config objects layer in order: global ignores,
// JS recommended, TS recommended, then a TS/TSX block for app code, a Node
// block for the WP4 probe scripts, and the M8 demo-tooling env blocks (.mjs =
// Node+browser for Playwright page.evaluate; .js = browser, rendered in the
// demo page). The two `react/...-react: off` rules shim the new JSX transform
// (React 17+) so `import React` isn't required.
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src-tauri/target/**",
      "src-tauri/gen/**",
      // Gitignored dev-only scratch git repos (verify-self fixtures, CLAUDE.md
      // "Scratch workspaces for verify-self"). Not app code — never lint them.
      "tmp/**",
      "src-tauri/tmp/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
    },
  },
  {
    // WP4 probe — standalone Node measurement/fixture scripts (run by hand, not bundled).
    files: ["probe/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  {
    // M8 demo tooling — the .mjs scripts are Node (build/capture/render/extract +
    // the `node --test` nodetests). They drive Playwright, so a `page.evaluate`
    // body legitimately references window/document — allow both env globals.
    files: ["tooling/demo/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // M8 demo tooling — the plain .js files (shell/timeline/*At) run INSIDE the
    // rendered demo page (browser), not Node. Script sourceType (no import/export).
    files: ["tooling/demo/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.browser },
    },
  },
);
