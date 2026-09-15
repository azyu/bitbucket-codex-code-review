/**
 * Content-Security-Policy for the dashboard, and the predicate that decides
 * which requests get it.
 *
 * Extracted from `main.ts` so both are testable. The old dashboard listed its
 * three exact paths in two places — this Set and `setGlobalPrefix`'s exclude —
 * and an asset added to only one of them produced either a 404 or the default
 * CSP, silently. Vite emits content-hashed filenames, so exact matching is not
 * an option any more: everything the dashboard serves lives under one prefix
 * and is matched by prefix.
 */

export const DASHBOARD_BASE_PATH = "/dashboard";

/**
 * Every relaxation the old policy carried is gone, and nothing replaced it:
 *
 * - `'unsafe-eval'` existed only for Alpine's expression evaluator.
 * - `'unsafe-inline'` for scripts is unnecessary because the Vite build emits
 *   no inline script (`modulePreload.polyfill` is off).
 * - `'unsafe-inline'` for styles is unnecessary because the templates carry no
 *   static `style` attribute; the three `style:` directives compile to
 *   `element.style.setProperty`, which is CSSOM and not subject to CSP.
 * - jsdelivr, fonts.googleapis and fonts.gstatic are gone with Bootstrap and
 *   the web fonts — one self-hosted stylesheet and a system font stack.
 *
 * The result is stricter than helmet's own default in every directive it sets.
 */
export const DASHBOARD_CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"],
  fontSrc: ["'self'"],
  connectSrc: ["'self'"],
  imgSrc: ["'self'", "data:"],
} as const;

/**
 * True for the dashboard document and every asset it loads.
 *
 * Requires the exact base path or a `/`-delimited child, so a sibling route
 * that merely starts with the same letters (`/dashboardx`) keeps the default,
 * stricter policy.
 */
export function isDashboardPath(pathname: string): boolean {
  return (
    pathname === DASHBOARD_BASE_PATH ||
    pathname.startsWith(`${DASHBOARD_BASE_PATH}/`)
  );
}
