import { svelte } from "@sveltejs/vite-plugin-svelte";
// vitest/config's defineConfig is vite's plus the `test` block, so build and
// test configuration stay in one file.
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [svelte()],
  // Assets resolve under /dashboard/ so main.ts's single static mount and the
  // relaxed-CSP path predicate can both match on one prefix.
  base: "/dashboard/",
  build: {
    // Written into the Nest dist tree, which is what the Dockerfile runtime
    // stage already copies. Root `pnpm build` runs `nest build` first because
    // nest-cli's deleteOutDir wipes dist.
    outDir: "../dist/dashboard",
    emptyOutDir: true,
    // Vite's preload polyfill is injected as an inline <script>; without it the
    // built document has no inline script and CSP can stay script-src 'self'.
    modulePreload: { polyfill: false },
  },
  server: {
    proxy: { "/api": "http://localhost:3000" },
    // The shared type and limit modules live in ../src.
    fs: { allow: [".."] },
  },
  // Without this Svelte resolves to its server build under vitest and mount()
  // throws lifecycle_function_unavailable.
  resolve: process.env["VITEST"] ? { conditions: ["browser"] } : undefined,
  test: {
    environment: "jsdom",
    include: ["src/**/*.spec.ts"],
    coverage: {
      // The bar covers src/lib — the session, API, settings-contract and
      // formatting modules, where the security invariants and the value
      // coercion live. Components are not in it: they are declarative markup
      // whose behaviour is the store's, and the invariant that does depend on
      // rendering (the unauthenticated shell) is asserted by mounting the real
      // App in shell.spec.ts. 80% matches the backend's stated bar, and unlike
      // jest.config.ts this one is enforced — `pnpm test` fails below it.
      include: ["src/lib/**"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
