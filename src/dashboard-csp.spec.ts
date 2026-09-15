import {
  DASHBOARD_BASE_PATH,
  DASHBOARD_CSP_DIRECTIVES,
  isDashboardPath,
} from "./dashboard-csp";

/**
 * Invariant 7: the dashboard CSP may tighten, never loosen. The old policy
 * carried `'unsafe-eval'` for Alpine's expression evaluator and three external
 * origins for Bootstrap and Google Fonts; none of them has a consumer now.
 */
describe("dashboard CSP", () => {
  const directives: Record<string, readonly string[]> =
    DASHBOARD_CSP_DIRECTIVES;

  it("does not allow eval — Alpine was its only consumer", () => {
    expect(directives["scriptSrc"]).not.toContain("'unsafe-eval'");
  });

  it("does not allow inline script — the Vite build emits none", () => {
    expect(directives["scriptSrc"]).not.toContain("'unsafe-inline'");
    expect(directives["scriptSrc"]).toEqual(["'self'"]);
  });

  it("names no external origin in any directive", () => {
    const external = Object.entries(directives).flatMap(([directive, sources]) =>
      sources
        .filter((source) => /^https?:/.test(source))
        .map((source) => `${directive}: ${source}`),
    );

    expect(external).toEqual([]);
  });

  it("does not allow inline style either — style: directives use CSSOM", () => {
    expect(directives["styleSrc"]).toEqual(["'self'"]);
  });

  it("keeps API calls and images first-party", () => {
    expect(directives["connectSrc"]).toEqual(["'self'"]);
    expect(directives["imgSrc"]).toEqual(["'self'", "data:"]);
    expect(directives["fontSrc"]).toEqual(["'self'"]);
    expect(directives["defaultSrc"]).toEqual(["'self'"]);
  });
});

/**
 * The prefix predicate replaces the exact-match Set that used to be duplicated
 * between `setGlobalPrefix`'s exclude list and the CSP selector. Vite emits
 * content-hashed filenames, so every asset has to match by prefix or it gets
 * the default policy with no visible error.
 */
describe("isDashboardPath", () => {
  it("matches the document and every hashed asset under it", () => {
    expect(isDashboardPath("/dashboard")).toBe(true);
    expect(isDashboardPath("/dashboard/")).toBe(true);
    expect(isDashboardPath("/dashboard/index.html")).toBe(true);
    expect(isDashboardPath("/dashboard/assets/index-CRPOvp0k.js")).toBe(true);
    expect(isDashboardPath("/dashboard/assets/index-BMspk1dJ.css")).toBe(true);
  });

  it("does not match a sibling route that shares the prefix", () => {
    expect(isDashboardPath("/dashboardx")).toBe(false);
    expect(isDashboardPath("/dashboard-alpine.js")).toBe(false);
    expect(isDashboardPath("/api/internal/settings")).toBe(false);
    expect(isDashboardPath("/health")).toBe(false);
    expect(isDashboardPath("/")).toBe(false);
  });

  it("agrees with the base path the static mount is registered under", () => {
    expect(DASHBOARD_BASE_PATH).toBe("/dashboard");
    expect(isDashboardPath(DASHBOARD_BASE_PATH)).toBe(true);
  });
});
