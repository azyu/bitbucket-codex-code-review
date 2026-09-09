import { Injectable } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const alpineRequire = createRequire(__filename);

const ICON_DASHBOARD = String.raw`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13.5h8V4.5H3zm10 6h8v-15h-8zM3 19.5h8v-4H3z" fill="currentColor"/></svg>`;
const ICON_REPORTS = String.raw`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5m1 3v1.5h12V7.5zm0 4v1.5h7.5V11.5zm0 4v1.5H10v-1.5z" fill="currentColor"/></svg>`;
const ICON_ACTIVITY = String.raw`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h3l2.5-5 4 10 2.5-5H20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_TABLE = String.raw`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15v13h-15zm0 4h15M10 5.5v13M15.5 5.5v13" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
const ICON_API = String.raw`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8 4 12l4 4m8-8 4 4-4 4m-5-9-2 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_MENU = String.raw`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const ICON_MONITOR = String.raw`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15v10h-15zm5 13h5M12 15.5v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_SUN = String.raw`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5v2.25m0 10.5V19.5m7.5-7.5h-2.25M6.75 12H4.5m12.8 5.3-1.6-1.6M8.3 8.3 6.7 6.7m10.6 0-1.6 1.6M8.3 15.7l-1.6 1.6M12 8.25A3.75 3.75 0 1 1 8.25 12 3.75 3.75 0 0 1 12 8.25" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const ICON_MOON = String.raw`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15.5A6.5 6.5 0 0 1 10.5 8a6.2 6.2 0 0 1 .4-2.1A7.75 7.75 0 1 0 18 15.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_REFRESH = String.raw`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14-4m-2-2v5h5m-5 3a8 8 0 0 0 14 4m2 2v-5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_SPARK = String.raw`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.9 4.7L19 9.5l-4.2 2.2L13 16.5l-1.8-4.8L7 9.5l5.1-1.8z" fill="currentColor"/></svg>`;
const ICON_INFO = String.raw`<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 7v4M8 5.2v.1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

const ALPINE_SCRIPT = readFileSync(
  alpineRequire.resolve("alpinejs/dist/cdn.min.js"),
  "utf8",
);

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="ko" data-bs-theme="auto">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>코드 리뷰 통계 대시보드</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap"
      rel="stylesheet"
    />
    <link
      href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css"
      rel="stylesheet"
    />
    <script>
      (function () {
        const storageKey = "dashboard-theme-preference";
        const storedPreference = window.localStorage.getItem(storageKey);
        const preference =
          storedPreference === "light" ||
          storedPreference === "dark" ||
          storedPreference === "auto"
            ? storedPreference
            : "auto";
        const resolvedTheme =
          preference === "auto" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : preference === "auto"
              ? "light"
              : preference;
        document.documentElement.setAttribute("data-bs-theme", resolvedTheme);
        document.documentElement.dataset.bsThemePreference = preference;
      })();
    </script>
    <style>
      :root {
        color-scheme: light dark;
        --dashboard-accent: #3d7cff;
        --dashboard-accent-strong: #245ff0;
        --dashboard-surface: rgba(255, 255, 255, 0.82);
        --dashboard-sidebar: rgba(248, 250, 252, 0.9);
        --dashboard-ring: rgba(61, 124, 255, 0.22);
        --dashboard-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
      }

      [data-bs-theme="dark"] {
        --dashboard-accent: #7aa2ff;
        --dashboard-accent-strong: #98b6ff;
        --dashboard-surface: rgba(12, 18, 30, 0.84);
        --dashboard-sidebar: rgba(9, 15, 26, 0.92);
        --dashboard-ring: rgba(122, 162, 255, 0.2);
        --dashboard-shadow: 0 24px 60px rgba(2, 6, 23, 0.42);
      }

      [x-cloak] {
        display: none !important;
      }

      html {
        scroll-behavior: smooth;
      }

      body {
        min-height: 100vh;
        font-family: "IBM Plex Sans", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(61, 124, 255, 0.16), transparent 28%),
          radial-gradient(circle at top right, rgba(16, 185, 129, 0.12), transparent 22%),
          linear-gradient(180deg, rgba(148, 163, 184, 0.06), transparent 18%),
          var(--bs-body-bg);
      }

      h1,
      h2,
      h3,
      .brand-heading,
      .metric-value {
        font-family: "Sora", sans-serif;
      }

      .dashboard-shell {
        max-width: 1440px;
      }

      .layout-shell {
        min-height: calc(100vh - 2rem);
      }

      .sidebar-panel,
      .surface-panel,
      .metric-card {
        border: 1px solid var(--bs-border-color-translucent);
        box-shadow: var(--dashboard-shadow);
        backdrop-filter: blur(16px);
      }

      .sidebar-panel {
        position: sticky;
        top: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        padding: 1.25rem;
        border-radius: 1.5rem;
        background:
          linear-gradient(180deg, rgba(61, 124, 255, 0.08), transparent 28%),
          var(--dashboard-sidebar);
      }

      .brand-mark {
        width: 2.5rem;
        height: 2.5rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 0.95rem;
        color: white;
        background: linear-gradient(135deg, var(--dashboard-accent), #14b8a6);
        box-shadow: 0 12px 24px rgba(61, 124, 255, 0.22);
      }

      .brand-mark svg,
      .nav-entry svg,
      .utility-button svg,
      .theme-icon-button svg,
      .mobile-menu-button svg,
      .status-dot svg {
        width: 1rem;
        height: 1rem;
        flex: 0 0 auto;
      }

      .sidebar-group-title,
      .eyebrow {
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--bs-secondary-color);
      }

      .nav-stack {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }

      .nav-entry {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.8rem 0.9rem;
        border-radius: 1rem;
        color: var(--bs-secondary-color);
        text-decoration: none;
        transition:
          background-color 180ms ease,
          color 180ms ease,
          transform 180ms ease,
          border-color 180ms ease;
      }

      .nav-entry:hover,
      .nav-entry:focus-visible,
      .nav-entry.is-active {
        color: var(--bs-body-color);
        background: rgba(61, 124, 255, 0.1);
        outline: none;
        transform: translateX(2px);
      }

      .nav-entry.is-active {
        border: 1px solid var(--dashboard-ring);
      }

      .nav-entry-main {
        display: inline-flex;
        align-items: center;
        gap: 0.75rem;
        min-width: 0;
      }

      .nav-entry-label {
        font-size: 0.95rem;
        font-weight: 600;
      }

      .nav-entry-badge {
        padding: 0.15rem 0.45rem;
        border-radius: 999px;
        font-size: 0.72rem;
        color: var(--dashboard-accent-strong);
        background: rgba(61, 124, 255, 0.12);
      }

      .workspace-topbar {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1.25rem;
      }

      .workspace-copy {
        max-width: 40rem;
        margin: 0.75rem 0 0;
        color: var(--bs-secondary-color);
        line-height: 1.65;
      }

      .workspace-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .theme-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.25rem;
        border-radius: 999px;
        background: var(--dashboard-surface);
        border: 1px solid var(--bs-border-color-translucent);
        height: 2.75rem;
      }

      .theme-icon-button,
      .mobile-menu-button {
        width: 2.25rem;
        height: 2.25rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--bs-secondary-color);
        transition:
          background-color 180ms ease,
          color 180ms ease,
          border-color 180ms ease,
          transform 180ms ease;
      }

      .theme-icon-button:hover,
      .theme-icon-button:focus-visible,
      .theme-icon-button.is-active,
      .mobile-menu-button:hover,
      .mobile-menu-button:focus-visible {
        color: var(--bs-body-color);
        background: rgba(61, 124, 255, 0.12);
        border-color: var(--dashboard-ring);
        outline: none;
      }

      .theme-icon-button.is-active {
        box-shadow: inset 0 0 0 1px var(--dashboard-ring);
      }

      .utility-button {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        min-height: 2.75rem;
        padding: 0 1rem;
        border-radius: 999px;
        border: 1px solid var(--bs-border-color-translucent);
        background: var(--dashboard-surface);
        color: var(--bs-body-color);
        text-decoration: none;
        transition:
          background-color 180ms ease,
          border-color 180ms ease,
          transform 180ms ease;
      }

      .utility-button:hover,
      .utility-button:focus-visible {
        background: rgba(61, 124, 255, 0.12);
        border-color: var(--dashboard-ring);
        outline: none;
        transform: translateY(-1px);
      }

      .utility-button--ghost {
        min-height: 2.25rem;
        padding: 0 0.85rem;
        font-size: 0.85rem;
      }

      .review-output-block {
        max-height: 18rem;
        overflow: auto;
        padding: 0.85rem 1rem;
        border-radius: 0.5rem;
        background: rgba(15, 23, 42, 0.06);
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        font-size: 0.82rem;
        line-height: 1.45;
        white-space: pre-wrap;
        word-break: break-word;
        margin: 0;
      }

      .toolbar-strip {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.65rem;
        min-height: 2.75rem;
        padding: 0 1rem;
        border-radius: 999px;
        border: 1px solid var(--dashboard-ring);
        background: rgba(61, 124, 255, 0.1);
        color: var(--bs-body-color);
      }

      .status-dot {
        width: 1.25rem;
        height: 1.25rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        color: white;
        background: var(--dashboard-accent);
      }

      .status-dot.is-error {
        background: var(--bs-danger);
      }

      .metric-card {
        height: 100%;
        padding: 1.2rem;
        border-radius: 1.35rem;
        background:
          linear-gradient(180deg, rgba(61, 124, 255, 0.08), transparent 40%),
          var(--dashboard-surface);
      }

      .metric-label {
        margin-bottom: 0.7rem;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--bs-secondary-color);
      }

      .metric-value {
        font-size: clamp(1.7rem, 3vw, 2.35rem);
        font-weight: 700;
        line-height: 1;
        letter-spacing: -0.05em;
      }

      .metric-detail {
        margin-top: 0.7rem;
        color: var(--bs-secondary-color);
        line-height: 1.55;
      }

      .surface-panel {
        padding: 1.25rem;
        border-radius: 1.5rem;
        background: var(--dashboard-surface);
      }

      .surface-panel-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 1rem;
      }

      .surface-panel-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
      }

      .surface-panel-copy {
        margin: 0.3rem 0 0;
        color: var(--bs-secondary-color);
        line-height: 1.6;
      }

      .overview-list,
      .highlight-list {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
      }

      .overview-item,
      .highlight-item {
        padding: 0.95rem 1rem;
        border-radius: 1.1rem;
        border: 1px solid rgba(148, 163, 184, 0.16);
        background: rgba(148, 163, 184, 0.06);
      }

      .overview-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0.65rem;
      }

      .overview-name,
      .highlight-title {
        font-weight: 600;
      }

      .overview-progress {
        height: 0.5rem;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.2);
        overflow: hidden;
      }

      .overview-progress > span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--dashboard-accent), #14b8a6);
      }

      .highlight-value {
        margin-top: 0.35rem;
        font-size: 1.1rem;
        font-weight: 700;
      }

      .table-wrapper {
        overflow: auto;
      }

      .table-dashboard {
        margin: 0;
      }

      .table-dashboard thead th {
        padding: 0.95rem 1rem;
        font-size: 0.73rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--bs-secondary-color);
        border-bottom-width: 1px;
      }

      .table-dashboard tbody td {
        padding: 1rem;
        vertical-align: top;
        border-color: rgba(148, 163, 184, 0.12);
      }

      .table-dashboard tbody tr:hover {
        background: rgba(61, 124, 255, 0.05);
      }

      .repo-name {
        font-weight: 700;
      }

      .repo-subcopy {
        margin-top: 0.35rem;
        color: var(--bs-secondary-color);
        font-size: 0.92rem;
      }

      .data-badge {
        display: inline-flex;
        align-items: center;
        padding: 0.35rem 0.55rem;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 600;
      }

      .data-badge.status-completed {
        color: #0f766e;
        background: rgba(13, 148, 136, 0.14);
      }

      .data-badge.status-failed {
        color: #b91c1c;
        background: rgba(220, 38, 38, 0.14);
      }

      .data-badge.status-superseded {
        color: #a16207;
        background: rgba(234, 179, 8, 0.16);
      }

      .data-badge.status-unknown {
        color: var(--bs-secondary-color);
        background: rgba(148, 163, 184, 0.16);
      }

      .api-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.45rem 0.75rem;
        border-radius: 999px;
        background: rgba(61, 124, 255, 0.08);
        color: var(--dashboard-accent-strong);
      }

      .info-tip {
        position: relative;
        display: inline-flex;
        align-items: center;
        margin-left: 0.45rem;
        color: var(--bs-secondary-color);
        cursor: help;
      }

      .info-tip > svg {
        width: 0.95rem;
        height: 0.95rem;
      }

      .info-tip .info-tip-text {
        visibility: hidden;
        opacity: 0;
        position: absolute;
        left: 50%;
        bottom: calc(100% + 0.5rem);
        transform: translateX(-50%);
        min-width: 12rem;
        max-width: 18rem;
        padding: 0.55rem 0.75rem;
        border-radius: 0.65rem;
        font-size: 0.82rem;
        font-weight: 400;
        line-height: 1.5;
        text-transform: none;
        letter-spacing: normal;
        white-space: normal;
        color: var(--bs-body-color);
        background: var(--dashboard-surface);
        border: 1px solid var(--bs-border-color-translucent);
        box-shadow: var(--dashboard-shadow);
        backdrop-filter: blur(12px);
        transition: opacity 160ms ease, visibility 160ms ease;
        z-index: 10;
        pointer-events: none;
      }

      .info-tip:hover .info-tip-text,
      .info-tip:focus-within .info-tip-text {
        visibility: visible;
        opacity: 1;
      }

      @media (max-width: 991.98px) {
        #sidebar-nav {
          display: none;
        }

        #sidebar-nav.is-open {
          display: flex;
        }

        .workspace-topbar {
          flex-direction: column;
        }

        .workspace-actions {
          width: 100%;
          justify-content: space-between;
        }

        .toolbar-strip {
          flex-direction: column;
          align-items: stretch;
        }
      }

      @media (min-width: 992px) {
        #sidebar-nav {
          display: flex !important;
        }
      }
    </style>
  </head>
  <body>
    <main
      class="container-fluid dashboard-shell px-3 px-lg-4 py-3 py-lg-4"
      x-data="dashboardApp()"
      x-init="init()"
      x-cloak
    >
      <section :class="{ 'd-none': authenticated }" class="surface-panel mx-auto mt-5" style="max-width:32rem" aria-labelledby="dashboard-login-title">
        <div class="surface-panel-header">
          <div>
            <h1 id="dashboard-login-title" class="surface-panel-title">대시보드 잠금 해제</h1>
            <p class="surface-panel-copy">관리자 키는 이 탭의 메모리에만 유지되며 새로고침하면 삭제됩니다.</p>
          </div>
        </div>
        <form @submit.prevent="unlock()" class="p-4 pt-0">
          <label for="dashboard-secret-key" class="form-label">Dashboard secret key</label>
          <input id="dashboard-secret-key" type="password" class="form-control" x-model="keyInput" autocomplete="off" required />
          <div class="text-danger small mt-2" :class="{ 'd-none': !loginError }" x-text="loginError"></div>
          <button type="submit" class="btn btn-primary mt-3" :disabled="loginLoading" x-text="loginLoading ? '확인 중…' : '잠금 해제'"></button>
        </form>
      </section>
      <div class="row g-3 g-xl-4 layout-shell" :class="{ 'd-none': !authenticated }">
        <aside class="col-12 col-lg-3 col-xxl-2">
          <div class="d-flex d-lg-none justify-content-between align-items-center mb-3">
            <div class="fw-semibold">Code Review</div>
            <button
              type="button"
              class="mobile-menu-button"
              aria-label="사이드 메뉴"
              :aria-expanded="String(sidebarOpen)"
              @click="toggleSidebar()"
            >
              ${ICON_MENU}
            </button>
          </div>

          <nav
            id="sidebar-nav"
            class="sidebar-panel"
            aria-label="사이드 메뉴"
            :class="{ 'is-open': sidebarOpen }"
          >
            <div class="brand-heading fw-semibold">Code Review</div>

            <div>
              <div class="sidebar-group-title mb-2">개요</div>
              <div class="nav-stack">
                <a
                  href="#overview-section"
                  class="nav-entry"
                  :class="{ 'is-active': activeAnchor === '#overview-section' }"
                  @click="handleAnchorClick('#overview-section')"
                >
                  <span class="nav-entry-main">
                    ${ICON_DASHBOARD}
                    <span class="nav-entry-label">대시보드</span>
                  </span>
                  <span class="nav-entry-badge">Live</span>
                </a>
                <a
                  href="#summary-cards"
                  class="nav-entry"
                  :class="{ 'is-active': activeAnchor === '#summary-cards' }"
                  @click="handleAnchorClick('#summary-cards')"
                >
                  <span class="nav-entry-main">
                    ${ICON_REPORTS}
                    <span class="nav-entry-label">지표 요약</span>
                  </span>
                </a>
                <a
                  href="#repo-intelligence"
                  class="nav-entry"
                  :class="{ 'is-active': activeAnchor === '#repo-intelligence' }"
                  @click="handleAnchorClick('#repo-intelligence')"
                >
                  <span class="nav-entry-main">
                    ${ICON_ACTIVITY}
                    <span class="nav-entry-label">활동 분석</span>
                  </span>
                </a>
              </div>
            </div>

            <div>
              <div class="sidebar-group-title mb-2">운영</div>
              <div class="nav-stack">
                <a
                  href="#repo-table-section"
                  class="nav-entry"
                  :class="{ 'is-active': activeAnchor === '#repo-table-section' }"
                  @click="handleAnchorClick('#repo-table-section')"
                >
                  <span class="nav-entry-main">
                    ${ICON_TABLE}
                    <span class="nav-entry-label">저장소 테이블</span>
                  </span>
                </a>
                <a
                  href="#recent-reviews-section"
                  class="nav-entry"
                  :class="{ 'is-active': activeAnchor === '#recent-reviews-section' }"
                  @click="handleAnchorClick('#recent-reviews-section')"
                >
                  <span class="nav-entry-main">
                    ${ICON_ACTIVITY}
                    <span class="nav-entry-label">최근 리뷰</span>
                  </span>
                </a>
                <a
                  href="#settings-section"
                  class="nav-entry"
                  :class="{ 'is-active': activeAnchor === '#settings-section' }"
                  @click="handleAnchorClick('#settings-section')"
                >
                  <span class="nav-entry-main">
                    ${ICON_API}
                    <span class="nav-entry-label">Runtime 설정</span>
                  </span>
                </a>
                <a
                  href="#api-section"
                  class="nav-entry"
                  :class="{ 'is-active': activeAnchor === '#api-section' }"
                  @click="handleAnchorClick('#api-section')"
                >
                  <span class="nav-entry-main">
                    ${ICON_API}
                    <span class="nav-entry-label">내부 API</span>
                  </span>
                </a>
              </div>
            </div>

          </nav>
        </aside>

        <section class="col-12 col-lg-9 col-xxl-10">
          <header id="overview-section" class="workspace-topbar mb-4">
            <div class="workspace-actions" style="margin-left:auto">
              <div id="theme-toggle" class="theme-toggle" role="group" aria-label="테마 선택">
                <button
                  type="button"
                  class="theme-icon-button"
                  :class="{ 'is-active': themePreference === 'auto' }"
                  aria-label="자동 테마"
                  title="자동 테마"
                  @click="setThemePreference('auto')"
                >
                  ${ICON_MONITOR}
                </button>
                <button
                  type="button"
                  class="theme-icon-button"
                  :class="{ 'is-active': themePreference === 'light' }"
                  aria-label="라이트 테마"
                  title="라이트 테마"
                  @click="setThemePreference('light')"
                >
                  ${ICON_SUN}
                </button>
                <button
                  type="button"
                  class="theme-icon-button"
                  :class="{ 'is-active': themePreference === 'dark' }"
                  aria-label="다크 테마"
                  title="다크 테마"
                  @click="setThemePreference('dark')"
                >
                  ${ICON_MOON}
                </button>
              </div>

              <button id="refresh" type="button" class="utility-button" @click="loadDashboard()">
                ${ICON_REFRESH}
                <span>새로고침</span>
              </button>
              <button type="button" class="utility-button utility-button--ghost" @click="logout()">잠금</button>
            </div>
          </header>


          <section id="summary-cards" class="row g-3 mb-4">
            <template x-for="card in summaryCards()" :key="card.label">
              <div class="col-12 col-sm-6 col-xxl-3">
                <article class="metric-card">
                  <div class="metric-label"><span x-text="card.label"></span>
                    <span class="info-tip" tabindex="0">${ICON_INFO}<span class="info-tip-text" x-text="card.detail"></span></span>
                  </div>
                  <div class="metric-value" x-text="card.value"></div>
                </article>
              </div>
            </template>
          </section>

          <section id="repo-intelligence" class="row g-3 mb-4">
            <div class="col-12 col-xl-7">
              <article class="surface-panel h-100">
                <div class="surface-panel-header">
                  <div>
                    <h2 class="surface-panel-title">저장소 작업량
                      <span class="info-tip" tabindex="0">${ICON_INFO}<span class="info-tip-text">리뷰 실행 수와 토큰 사용량을 기준으로 가장 바쁜 저장소를 추립니다.</span></span>
                    </h2>
                  </div>
                </div>
                <div class="overview-list">
                  <template x-if="repos.length === 0">
                    <div class="overview-item text-secondary">표시할 저장소 활동이 없습니다.</div>
                  </template>
                  <template x-for="repo in renderRepoOverview()" :key="repo.workspaceSlug + '/' + repo.repoSlug">
                    <div class="overview-item">
                      <div class="overview-meta">
                        <div>
                          <div class="overview-name" x-text="repo.workspaceSlug + '/' + repo.repoSlug"></div>
                          <div class="text-secondary small mt-1">
                            토큰 <span x-text="formatInteger(repo.tokens.totalTokens)"></span>
                            · 실패 <span x-text="formatInteger(repo.counts.failed)"></span>
                          </div>
                        </div>
                        <div class="text-end">
                          <div class="fw-semibold"><span x-text="formatInteger(repo.counts.total)"></span>건</div>
                          <div class="text-secondary small" x-text="formatDuration(repo.durations.reviewAvgMs)"></div>
                        </div>
                      </div>
                      <div class="overview-progress">
                        <span :style="'width:' + repo.progressWidth + '%'"></span>
                      </div>
                    </div>
                  </template>
                </div>
              </article>
            </div>

            <div class="col-12 col-xl-5">
              <article class="surface-panel h-100">
                <div class="surface-panel-header">
                  <div>
                    <h2 class="surface-panel-title">하이라이트
                      <span class="info-tip" tabindex="0">${ICON_INFO}<span class="info-tip-text">지금 당장 판단에 쓸 만한 값만 짧게 요약합니다.</span></span>
                    </h2>
                  </div>
                </div>
                <div class="highlight-list">
                  <template x-if="repos.length === 0">
                    <div class="highlight-item text-secondary">하이라이트를 계산할 데이터가 없습니다.</div>
                  </template>
                  <template x-for="item in renderHighlights()" :key="item.title">
                    <div class="highlight-item">
                      <div class="highlight-title" x-text="item.title"></div>
                      <div class="highlight-value" x-text="item.value"></div>
                      <div class="text-secondary small mt-1" x-text="item.detail"></div>
                    </div>
                  </template>
                </div>
              </article>
            </div>
          </section>

          <section id="repo-table-section" class="surface-panel mb-4">
            <div class="surface-panel-header">
              <div>
                <h2 class="surface-panel-title">저장소 실행 내역
                  <span class="info-tip" tabindex="0">${ICON_INFO}<span class="info-tip-text">최근 활동 순으로 정렬된 저장소별 리뷰 통계입니다.</span></span>
                </h2>
              </div>
            </div>

            <div class="table-wrapper">
              <table class="table table-hover align-middle table-dashboard">
                <thead>
                  <tr>
                    <th>저장소</th>
                    <th>리뷰 수</th>
                    <th>Codex 평균</th>
                    <th>전체 평균</th>
                    <th>토큰</th>
                    <th>최근 실행</th>
                  </tr>
                </thead>
                <tbody>
                  <template x-if="repos.length === 0">
                    <tr>
                      <td colspan="6" class="px-4 py-5 text-center text-secondary">리뷰 실행 데이터가 없습니다.</td>
                    </tr>
                  </template>
                  <template x-for="repo in repos" :key="repo.workspaceSlug + '/' + repo.repoSlug">
                    <tr>
                      <td>
                        <div class="repo-name" x-text="repo.workspaceSlug + '/' + repo.repoSlug"></div>
                        <div class="repo-subcopy">
                          최근 실행
                          <span x-text="formatDate(repo.latestReview && repo.latestReview.createdAt)"></span>
                        </div>
                      </td>
                      <td>
                        <div class="fw-semibold">총 <span x-text="formatInteger(repo.counts.total)"></span>건</div>
                        <div class="repo-subcopy">
                          완료 <span x-text="formatInteger(repo.counts.completed)"></span>
                          / 실패 <span x-text="formatInteger(repo.counts.failed)"></span>
                          / 대체 <span x-text="formatInteger(repo.counts.superseded)"></span>
                        </div>
                      </td>
                      <td x-text="formatDuration(repo.durations.codexAvgMs)"></td>
                      <td x-text="formatDuration(repo.durations.reviewAvgMs)"></td>
                      <td>
                        <div class="fw-semibold" x-text="formatInteger(repo.tokens.totalTokens)"></div>
                        <div class="repo-subcopy">
                          캐시 적중 <span x-text="formatInteger(repo.tokens.cachedInputTokens)"></span>
                        </div>
                      </td>
                      <td>
                        <span
                          class="data-badge"
                          :class="statusClass(repo.latestReview && repo.latestReview.reviewStatus)"
                          x-text="statusLabel(repo.latestReview && repo.latestReview.reviewStatus)"
                        ></span>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </section>

          <section id="recent-reviews-section" class="surface-panel mb-4">
            <div class="surface-panel-header">
              <div>
                <h2 class="surface-panel-title">최근 리뷰
                  <span class="info-tip" tabindex="0">${ICON_INFO}<span class="info-tip-text">최근 실행된 리뷰 ${10}건 — 토큰·지연·상태·에러 메시지를 한눈에 확인.</span></span>
                </h2>
                <p class="surface-panel-copy">PR 단위로 어떤 리뷰가 어떻게 처리됐는지 보여줍니다. 본문 펼치기는 토글 시 별도로 불러옵니다.</p>
              </div>
            </div>

            <div class="table-wrapper">
              <table class="table table-hover align-middle table-dashboard">
                <thead>
                  <tr>
                    <th>실행 시각</th>
                    <th>저장소 / PR</th>
                    <th>상태 · 트리거</th>
                    <th>지연(코덱스/전체)</th>
                    <th>토큰(in / cache / out)</th>
                    <th>모델</th>
                    <th>커밋</th>
                    <th>에러</th>
                    <th class="text-end">본문</th>
                  </tr>
                </thead>
                <tbody>
                  <template x-if="recentReviews.length === 0">
                    <tr>
                      <td colspan="9" class="px-4 py-5 text-center text-secondary" x-text="recentLoading ? '최근 리뷰를 불러오는 중…' : '최근 리뷰 데이터가 없습니다.'"></td>
                    </tr>
                  </template>
                </tbody>
                <template x-for="review in recentReviews" :key="review.id">
                  <tbody>
                    <tr>
                      <td x-text="formatDate(review.createdAt)"></td>
                      <td>
                        <div class="repo-name" x-text="review.workspaceSlug + '/' + review.repositorySlug"></div>
                        <div class="repo-subcopy">
                          PR #<span x-text="review.pullRequestId"></span>
                        </div>
                      </td>
                      <td>
                        <span
                          class="data-badge"
                          :class="statusClass(review.reviewStatus)"
                          x-text="statusLabel(review.reviewStatus)"
                        ></span>
                        <div class="repo-subcopy" x-text="review.triggerType"></div>
                      </td>
                      <td>
                        <div x-text="formatDuration(review.durationMs)"></div>
                        <div class="repo-subcopy">
                          전체 <span x-text="formatDuration(review.totalDurationMs)"></span>
                        </div>
                      </td>
                      <td>
                        <div class="fw-semibold" x-text="formatInteger(review.inputTokens)"></div>
                        <div class="repo-subcopy">
                          cache <span x-text="formatInteger(review.cachedInputTokens)"></span>
                          · out <span x-text="formatInteger(review.outputTokens)"></span>
                        </div>
                      </td>
                      <td>
                        <div x-text="review.codexModel || '-'"></div>
                        <div class="repo-subcopy" :class="{ 'd-none': !review.codexReasoningEffort }" x-text="review.codexReasoningEffort"></div>
                      </td>
                      <td>
                        <code x-text="shortCommit(review.headCommitHash)"></code>
                      </td>
                      <td>
                        <template x-if="review.errorMessage">
                          <span class="repo-subcopy" x-text="review.errorMessage"></span>
                        </template>
                        <template x-if="!review.errorMessage">
                          <span class="text-secondary">-</span>
                        </template>
                      </td>
                      <td class="text-end">
                        <button
                          type="button"
                          class="utility-button utility-button--ghost"
                          @click="toggleReviewOutput(review.id)"
                          x-text="expandedReviewId === review.id ? '접기' : '펼치기'"
                        ></button>
                      </td>
                    </tr>
                    <template x-if="expandedReviewId === review.id">
                      <tr>
                        <td colspan="9">
                          <template x-if="expandedLoading">
                            <div class="text-secondary">본문을 불러오는 중…</div>
                          </template>
                          <template x-if="!expandedLoading && expandedReviewError">
                            <div class="text-danger" x-text="expandedReviewError"></div>
                          </template>
                          <template x-if="!expandedLoading && !expandedReviewError && expandedReviewOutput">
                            <pre class="review-output-block" x-text="expandedReviewOutput"></pre>
                          </template>
                          <template x-if="!expandedLoading && !expandedReviewError && !expandedReviewOutput">
                            <div class="text-secondary">본문이 비어 있습니다.</div>
                          </template>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </template>
              </table>
            </div>
          </section>

          <section id="settings-section" class="surface-panel mb-4">
            <div class="surface-panel-header">
              <div>
                <h2 class="surface-panel-title">Runtime 설정</h2>
                <p class="surface-panel-copy">저장한 값은 새 webhook/job부터 적용됩니다. 비밀은 빈 칸이면 유지됩니다.</p>
              </div>
            </div>
            <form class="p-4 pt-0" @submit.prevent="saveGlobalSettings()">
              <div class="row g-3">
                <div class="col-md-6"><label class="form-label" for="global-model">Model</label><input id="global-model" class="form-control" maxlength="64" x-model="settingsForm.model" required /></div>
                <div class="col-md-6"><label class="form-label" for="global-reasoning">Reasoning</label><select id="global-reasoning" class="form-select" x-model="settingsForm.reasoningEffort"><option value="">default</option><option>none</option><option>low</option><option>medium</option><option>high</option><option>xhigh</option><option>max</option></select></div>
                <div class="col-md-6"><label class="form-label" for="global-codex-timeout">Codex timeout (ms)</label><input id="global-codex-timeout" type="number" min="1" class="form-control" x-model.number="settingsForm.timeoutMs" required /></div>
                <div class="col-md-6"><label class="form-label" for="global-openai-base-url">OpenAI HTTPS base URL</label><input id="global-openai-base-url" type="url" class="form-control" x-model="settingsForm.openaiBaseUrl" /></div>
                <div class="col-md-4"><label class="form-label" for="global-trigger">Trigger</label><select id="global-trigger" class="form-select" x-model="settingsForm.triggerMode"><option>mention</option><option>auto</option><option>both</option></select></div>
                <div class="col-md-4"><label class="form-label" for="global-retry-attempts">Retry attempts</label><input id="global-retry-attempts" type="number" min="1" class="form-control" x-model.number="settingsForm.retryAttempts" required /></div>
                <div class="col-md-4"><label class="form-label" for="global-retry-delay">Retry delay (ms)</label><input id="global-retry-delay" type="number" min="0" class="form-control" x-model.number="settingsForm.retryDelay" required /></div>
                <div class="col-md-6"><label class="form-label" for="global-worker-concurrency">Worker concurrency</label><input id="global-worker-concurrency" type="number" min="1" class="form-control" x-model.number="settingsForm.workerConcurrency" required /></div>
                <div class="col-md-6"><label class="form-label" for="global-clone-timeout">Git clone timeout (ms)</label><input id="global-clone-timeout" type="number" min="1" class="form-control" x-model.number="settingsForm.cloneTimeoutMs" required /></div>
                <div class="col-12"><label class="form-label" for="global-custom-prompt">Custom prompt</label><textarea id="global-custom-prompt" class="form-control" rows="5" x-model="settingsForm.customPrompt"></textarea></div>
                <div class="col-md-4"><label class="form-label" for="global-openai-key">OpenAI API key</label><input id="global-openai-key" type="password" class="form-control" x-model="settingsSecrets.openaiApiKey" autocomplete="off" /><div class="small text-secondary" x-text="secretStatus(settingsDocument && settingsDocument.global.secrets.openaiApiKey)"></div><div class="form-check"><input class="form-check-input" type="checkbox" x-model="settingsClears.openaiApiKey" id="clear-openai" /><label class="form-check-label" for="clear-openai">삭제</label></div></div>
                <div class="col-md-4"><label class="form-label" for="global-bitbucket-token">Bitbucket API token</label><input id="global-bitbucket-token" type="password" class="form-control" x-model="settingsSecrets.bitbucketApiToken" autocomplete="off" /><div class="small text-secondary" x-text="secretStatus(settingsDocument && settingsDocument.global.secrets.bitbucketApiToken)"></div><div class="form-check"><input class="form-check-input" type="checkbox" x-model="settingsClears.bitbucketApiToken" id="clear-bb-token" /><label class="form-check-label" for="clear-bb-token">삭제</label></div></div>
                <div class="col-md-4"><label class="form-label" for="global-webhook-secret">Webhook secret</label><input id="global-webhook-secret" type="password" class="form-control" x-model="settingsSecrets.webhookSecret" autocomplete="off" /><div class="small text-secondary" x-text="secretStatus(settingsDocument && settingsDocument.global.secrets.webhookSecret)"></div><div class="form-check"><input class="form-check-input" type="checkbox" x-model="settingsClears.webhookSecret" id="clear-webhook" /><label class="form-check-label" for="clear-webhook">삭제</label></div></div>
                <div class="col-md-6"><label class="form-label" for="global-legacy-username">Legacy username</label><input id="global-legacy-username" class="form-control" x-model="settingsSecrets.username" autocomplete="off" /><div class="small text-secondary" x-text="settingsDocument && settingsDocument.global.basicCredentialConfigured ? '설정됨' : '미설정'"></div></div>
                <div class="col-md-6"><label class="form-label" for="global-legacy-password">Legacy app password</label><input id="global-legacy-password" type="password" class="form-control" x-model="settingsSecrets.appPassword" autocomplete="off" /><div class="form-check"><input class="form-check-input" type="checkbox" x-model="settingsClears.basicCredential" id="clear-basic" /><label class="form-check-label" for="clear-basic">둘 다 삭제</label></div></div>
              </div>
              <div class="small mt-3" :class="settingsError ? 'text-danger' : 'text-secondary'" x-text="settingsStatus"></div>
              <button class="btn btn-primary mt-3" type="submit" :disabled="settingsSaving">Global 저장</button>
            </form>

            <hr />
            <form class="p-4 pt-2" @submit.prevent="saveRepositorySettings()">
              <h3 class="h6">Repository override</h3>
              <div class="row g-3">
                <div class="col-md-6"><label class="form-label" for="repository-workspace">Workspace slug</label><input id="repository-workspace" class="form-control" x-model="repositoryForm.workspaceSlug" required /></div>
                <div class="col-md-6"><label class="form-label" for="repository-slug">Repository slug</label><input id="repository-slug" class="form-control" x-model="repositoryForm.repositorySlug" required /></div>
                <div class="col-md-6"><label class="form-label" for="repository-model">Model (empty = inherit)</label><input id="repository-model" class="form-control" maxlength="64" x-model="repositoryForm.model" /></div>
                <div class="col-md-6"><label class="form-label" for="repository-reasoning">Reasoning (empty = inherit)</label><select id="repository-reasoning" class="form-select" x-model="repositoryForm.reasoningEffort"><option value="">inherit</option><option>none</option><option>low</option><option>medium</option><option>high</option><option>xhigh</option><option>max</option></select></div>
                <div class="col-md-6"><label class="form-label" for="repository-timeout">Timeout (empty = inherit)</label><input id="repository-timeout" type="number" min="1" class="form-control" x-model="repositoryForm.timeoutMs" /></div>
                <div class="col-12"><label class="form-label" for="repository-custom-prompt">Custom prompt (empty = inherit)</label><textarea id="repository-custom-prompt" class="form-control" rows="4" x-model="repositoryForm.customPrompt"></textarea></div>
                <div class="col-md-6"><label class="form-label" for="repository-api-token">Repository API token</label><input id="repository-api-token" type="password" class="form-control" x-model="repositoryForm.bitbucketApiToken" autocomplete="off" /><div class="small text-secondary" x-text="secretStatus(repositoryForm.bitbucketApiTokenStatus)"></div><div class="form-check"><input class="form-check-input" type="checkbox" x-model="repositoryForm.bitbucketApiTokenClear" id="clear-repo-token" /><label class="form-check-label" for="clear-repo-token">삭제하고 global 상속</label></div></div>
                <div class="col-md-6"><label class="form-label" for="repository-webhook-secret">Repository webhook secret</label><input id="repository-webhook-secret" type="password" class="form-control" x-model="repositoryForm.webhookSecret" autocomplete="off" /><div class="small text-secondary" x-text="secretStatus(repositoryForm.webhookSecretStatus)"></div><div class="form-check"><input class="form-check-input" type="checkbox" x-model="repositoryForm.webhookSecretClear" id="clear-repo-webhook" /><label class="form-check-label" for="clear-repo-webhook">삭제하고 global 상속</label></div></div>
              </div>
              <button type="button" class="btn btn-outline-secondary mt-3 me-2" @click="loadRepositorySettings()">불러오기</button>
              <button class="btn btn-primary mt-3" type="submit" :disabled="settingsSaving">Repository 저장</button>
            </form>
          </section>
          <section id="api-section" class="surface-panel">
            <div class="surface-panel-header">
              <div>
                <h2 class="surface-panel-title">내부 API
                  <span class="info-tip" tabindex="0">${ICON_INFO}<span class="info-tip-text">별도 번들 없이 same-origin API를 직접 읽습니다.</span></span>
                </h2>
              </div>
            </div>
            <div class="api-pill">
              ${ICON_API}
              <code>/api/internal/stats/repos</code>
            </div>
          </section>
        </section>
      </div>
    </main>
    <script src="/dashboard.js" defer></script>
    <script defer src="/dashboard-alpine.js"></script>
  </body>
</html>`;

const DASHBOARD_SCRIPT = `(function () {
let dashboardSecretKey = "";
const endpoint = "/api/internal/stats/repos";
const recentEndpoint = "/api/internal/reviews/recent?limit=10";
const settingsEndpoint = "/api/internal/settings";
function reviewDetailEndpoint(id) {
  return "/api/internal/reviews/" + encodeURIComponent(String(id));
}
const REVIEW_OUTPUT_MAX_CHARS = 16000;
const themeStorageKey = "dashboard-theme-preference";

function shortCommit(hash) {
  if (typeof hash !== "string" || hash.length === 0) return "-";
  return hash.slice(0, 7);
}

function truncateReviewOutput(value) {
  if (typeof value !== "string" || value.length === 0) return "";
  if (value.length <= REVIEW_OUTPUT_MAX_CHARS) return value;
  return value.slice(0, REVIEW_OUTPUT_MAX_CHARS) + "\\n\\n…(truncated, " + (value.length - REVIEW_OUTPUT_MAX_CHARS) + " more chars)";
}

function getThemePreference() {
  const storedPreference = window.localStorage.getItem(themeStorageKey);
  if (
    storedPreference === "light" ||
    storedPreference === "dark" ||
    storedPreference === "auto"
  ) {
    return storedPreference;
  }
  return "auto";
}

function resolveTheme(preference) {
  if (preference === "auto") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return preference;
}

function formatDuration(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "-";
  if (value < 1000) return value.toFixed(0) + " ms";
  if (value < 60000) return (value / 1000).toFixed(1) + "초";
  return (value / 60000).toFixed(1) + "분";
}

function formatInteger(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("ko-KR");
}

function renderRepoOverview(repos) {
  const rankedRepos = repos
    .slice()
    .sort(function (left, right) {
      return (
        right.counts.total - left.counts.total ||
        right.tokens.totalTokens - left.tokens.totalTokens
      );
    })
    .slice(0, 5);

  const maxRuns = Math.max(
    1,
    ...rankedRepos.map(function (repo) {
      return repo.counts.total;
    }),
  );

  return rankedRepos.map(function (repo) {
    return {
      ...repo,
      progressWidth: Math.max(10, Math.round((repo.counts.total / maxRuns) * 100)),
    };
  });
}

function renderHighlights(repos) {
  if (!repos.length) return [];

  const busiestRepo = repos.reduce(function (best, repo) {
    if (!best || repo.counts.total > best.counts.total) return repo;
    return best;
  }, null);

  const latestRepo = repos.reduce(function (best, repo) {
    const repoTime = new Date((repo.latestReview && repo.latestReview.createdAt) || 0).getTime();
    const bestTime = new Date((best && best.latestReview && best.latestReview.createdAt) || 0).getTime();
    return repoTime > bestTime ? repo : best;
  }, null);

  const failedRuns = repos.reduce(function (sum, repo) {
    return sum + repo.counts.failed;
  }, 0);

  const cachedTokens = repos.reduce(function (sum, repo) {
    return sum + repo.tokens.cachedInputTokens;
  }, 0);

  return [
    {
      title: "가장 바쁜 저장소",
      value: busiestRepo
        ? busiestRepo.workspaceSlug + "/" + busiestRepo.repoSlug + " · " + formatInteger(busiestRepo.counts.total) + "건"
        : "-",
      detail: "리뷰 실행 수 기준",
    },
    {
      title: "최근 갱신",
      value: latestRepo
        ? formatDate(latestRepo.latestReview && latestRepo.latestReview.createdAt)
        : "-",
      detail: latestRepo ? latestRepo.workspaceSlug + "/" + latestRepo.repoSlug : "최근 실행 없음",
    },
    {
      title: "실패 리뷰",
      value: formatInteger(failedRuns) + "건",
      detail: "누적 실패 수",
    },
    {
      title: "캐시 적중 토큰",
      value: formatInteger(cachedTokens),
      detail: "입력 캐시 누적 합계",
    },
  ];
}

document.addEventListener("alpine:init", function () {
  Alpine.data("dashboardApp", function () {
    return {
      authenticated: false,
      keyInput: "",
      loginError: "",
      loginLoading: false,
      settingsDocument: null,
      settingsRevision: 0,
      settingsSaving: false,
      settingsStatus: "",
      settingsError: false,
      settingsForm: {
        model: "",
        reasoningEffort: "",
        timeoutMs: 600000,
        customPrompt: "",
        openaiBaseUrl: "",
        triggerMode: "mention",
        retryAttempts: 3,
        retryDelay: 5000,
        workerConcurrency: 3,
        cloneTimeoutMs: 600000,
      },
      settingsSecrets: {
        openaiApiKey: "",
        bitbucketApiToken: "",
        webhookSecret: "",
        username: "",
        appPassword: "",
      },
      settingsClears: {
        openaiApiKey: false,
        bitbucketApiToken: false,
        webhookSecret: false,
        basicCredential: false,
      },
      repositoryForm: {
        workspaceSlug: "",
        repositorySlug: "",
        revision: 0,
        model: "",
        reasoningEffort: "",
        timeoutMs: "",
        customPrompt: "",
        bitbucketApiToken: "",
        webhookSecret: "",
        bitbucketApiTokenClear: false,
        webhookSecretClear: false,
        bitbucketApiTokenStatus: null,
        webhookSecretStatus: null,
      },
      repositoryLoadedIdentity: "",
      repos: [],
      recentReviews: [],
      recentLoading: false,
      expandedReviewId: null,
      expandedReviewOutput: null,
      expandedReviewError: null,
      expandedLoading: false,
      statusMessage: "저장소 통계를 불러오는 중…",
      statusError: false,
      lastUpdated: null,
      pollTimer: null,
      themePreference: getThemePreference(),
      sidebarOpen: false,
      activeAnchor: window.location.hash || "#overview-section",
      mediaQuery: null,

      init() {
        this.applyTheme(this.themePreference);
        this.bindSystemTheme();
        this.logout();

        this._hashHandler = () => {
          this.activeAnchor = window.location.hash || "#overview-section";
        };
        window.addEventListener("hashchange", this._hashHandler);

        this._visibilityHandler = () => {
          if (document.hidden) {
            this.stopPolling();
          } else if (this.authenticated) {
            this.loadDashboard();
            this.startPolling();
          }
        };
        document.addEventListener("visibilitychange", this._visibilityHandler);
      },

      destroy() {
        this.stopPolling();
        if (this._hashHandler) {
          window.removeEventListener("hashchange", this._hashHandler);
        }
        if (this._visibilityHandler) {
          document.removeEventListener("visibilitychange", this._visibilityHandler);
        }
        if (this.mediaQuery && this._mediaHandler) {
          this.mediaQuery.removeEventListener("change", this._mediaHandler);
        }
      },

      startPolling() {
        if (!this.authenticated) return;
        this.stopPolling();
        this.pollTimer = setInterval(() => this.loadDashboard(), 30000);
      },

      stopPolling() {
        if (this.pollTimer) {
          clearInterval(this.pollTimer);
          this.pollTimer = null;
        }
      },

      bindSystemTheme() {
        this.mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        this._mediaHandler = () => {
          if (this.themePreference === "auto") {
            this.applyTheme("auto");
          }
        };
        this.mediaQuery.addEventListener("change", this._mediaHandler);
      },

      applyTheme(preference) {
        document.documentElement.setAttribute("data-bs-theme", resolveTheme(preference));
        document.documentElement.dataset.bsThemePreference = preference;
      },

      setThemePreference(preference) {
        this.themePreference = preference;
        window.localStorage.setItem(themeStorageKey, preference);
        this.applyTheme(preference);
      },

      toggleSidebar() {
        this.sidebarOpen = !this.sidebarOpen;
      },

      handleAnchorClick(hash) {
        this.activeAnchor = hash;
        if (window.innerWidth < 992) {
          this.sidebarOpen = false;
        }
      },

      summaryCards() {
        const totalRepos = this.repos.length;
        const totalRuns = this.repos.reduce(function (sum, repo) {
          return sum + repo.counts.total;
        }, 0);
        const totalTokens = this.repos.reduce(function (sum, repo) {
          return sum + repo.tokens.totalTokens;
        }, 0);
        const avgReviewMs =
          this.repos.length === 0
            ? 0
            : this.repos.reduce(function (sum, repo) {
                return sum + repo.durations.reviewAvgMs;
              }, 0) / this.repos.length;

        return [
          {
            label: "저장소 수",
            value: formatInteger(totalRepos),
            detail: "현재 화면에서 추적 중인 저장소 수",
          },
          {
            label: "전체 리뷰 수",
            value: formatInteger(totalRuns),
            detail: "완료, 실패, 대체된 리뷰를 모두 포함",
          },
          {
            label: "총 토큰",
            value: formatInteger(totalTokens),
            detail: "입력 + 출력 토큰 합계",
          },
          {
            label: "평균 리뷰 시간",
            value: formatDuration(avgReviewMs),
            detail: "저장소별 평균 리뷰 시간의 평균값",
          },
        ];
      },

      renderRepoOverview() {
        return renderRepoOverview(this.repos);
      },

      renderHighlights() {
        return renderHighlights(this.repos);
      },

      statusLabel(status) {
        if (status === "completed") return "완료";
        if (status === "failed") return "실패";
        if (status === "superseded") return "대체됨";
        return "미확인";
      },

      statusClass(status) {
        if (status === "completed") return "status-completed";
        if (status === "failed") return "status-failed";
        if (status === "superseded") return "status-superseded";
        return "status-unknown";
      },

      formatDuration(value) {
        return formatDuration(value);
      },

      formatInteger(value) {
        return formatInteger(value);
      },

      formatDate(value) {
        return formatDate(value);
      },

      shortCommit(value) {
        return shortCommit(value);
      },

      setStatus(message, isError) {
        this.statusMessage = message;
        this.statusError = isError;
      },

      async authorizedFetch(url, options) {
        const request = options || {};
        const response = await fetch(url, {
          ...request,
          headers: {
            ...(request.headers || {}),
            Accept: "application/json",
            Authorization: "Bearer " + dashboardSecretKey,
          },
        });
        if (response.status === 401) {
          this.logout();
          throw new Error("Unauthorized");
        }
        return response;
      },

      async unlock() {
        this.loginLoading = true;
        this.loginError = "";
        dashboardSecretKey = this.keyInput;
        this.keyInput = "";
        try {
          const response = await this.authorizedFetch(settingsEndpoint);
          if (!response.ok) throw new Error("HTTP " + response.status);
          this.applySettingsDocument(await response.json());
          this.authenticated = true;
          await this.loadDashboard();
          this.startPolling();
        } catch (error) {
          dashboardSecretKey = "";
          this.authenticated = false;
          this.loginError = "인증에 실패했습니다.";
        } finally {
          this.loginLoading = false;
        }
      },

      logout() {
        dashboardSecretKey = "";
        this.keyInput = "";
        this.authenticated = false;
        this.repos = [];
        this.recentReviews = [];
        this.settingsDocument = null;
        this.expandedReviewId = null;
        this.expandedReviewOutput = null;
        this.repositoryForm = {
          workspaceSlug: "",
          repositorySlug: "",
          revision: 0,
          model: "",
          reasoningEffort: "",
          timeoutMs: "",
          customPrompt: "",
          bitbucketApiToken: "",
          webhookSecret: "",
          bitbucketApiTokenClear: false,
          webhookSecretClear: false,
          bitbucketApiTokenStatus: null,
          webhookSecretStatus: null,
        };
        this.repositoryLoadedIdentity = "";
        this.stopPolling();
      },

      applySettingsDocument(document) {
        this.settingsDocument = document;
        const global = document && document.global;
        if (!global) return;
        this.settingsRevision = global.revision;
        this.settingsForm = { ...this.settingsForm, ...global.values };
        this.settingsSecrets = {
          openaiApiKey: "",
          bitbucketApiToken: "",
          webhookSecret: "",
          username: "",
          appPassword: "",
        };
        this.settingsClears = {
          openaiApiKey: false,
          bitbucketApiToken: false,
          webhookSecret: false,
          basicCredential: false,
        };
      },

      async loadSettings() {
        const response = await this.authorizedFetch(settingsEndpoint);
        if (!response.ok) throw new Error("HTTP " + response.status);
        this.applySettingsDocument(await response.json());
      },

      secretMutations(values, clears, keys) {
        const mutations = {};
        keys.forEach(function (key) {
          if (clears[key]) mutations[key] = { operation: "clear" };
          else if (values[key]) mutations[key] = { operation: "replace", value: values[key] };
        });
        return mutations;
      },

      secretStatus(status) {
        if (!status || !status.configured) return "미설정";
        return status.source === "repository" ? "Repository 설정됨" : "Global 설정됨";
      },

      async saveGlobalSettings() {
        this.settingsSaving = true;
        this.settingsError = false;
        try {
          const patch = {
            expectedRevision: this.settingsRevision,
            values: { ...this.settingsForm },
            secrets: this.secretMutations(
              this.settingsSecrets,
              this.settingsClears,
              ["openaiApiKey", "bitbucketApiToken", "webhookSecret"],
            ),
          };
          if (this.settingsClears.basicCredential) {
            patch.basicCredential = { operation: "clear" };
          } else if (this.settingsSecrets.username || this.settingsSecrets.appPassword) {
            patch.basicCredential = {
              operation: "replace",
              username: this.settingsSecrets.username,
              appPassword: this.settingsSecrets.appPassword,
            };
          }
          const response = await this.authorizedFetch(settingsEndpoint + "/global", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          if (!response.ok) {
            if (response.status === 409) await this.loadSettings();
            throw new Error("HTTP " + response.status);
          }
          await this.loadSettings();
          this.settingsStatus = "Global 설정을 저장했습니다.";
        } catch (error) {
          this.settingsError = true;
          this.settingsStatus = error.message === "Unauthorized"
            ? "인증이 만료되었습니다."
            : "Global 설정 저장에 실패했습니다: " + error.message;
        } finally {
          this.settingsSaving = false;
        }
      },

      loadRepositorySettings() {
        const form = this.repositoryForm;
        const repositories =
          (this.settingsDocument && this.settingsDocument.repositories) || [];
        const document = repositories.find(function (item) {
          return item.workspaceSlug === form.workspaceSlug &&
            item.repositorySlug === form.repositorySlug;
        });
        const values = (document && document.values) || {};
        this.repositoryForm = {
          ...form,
          revision: document ? document.revision : 0,
          model: values.model || "",
          reasoningEffort: values.reasoningEffort || "",
          timeoutMs: values.timeoutMs || "",
          customPrompt: values.customPrompt || "",
          bitbucketApiToken: "",
          webhookSecret: "",
          bitbucketApiTokenClear: false,
          webhookSecretClear: false,
          bitbucketApiTokenStatus:
            document && document.secrets.bitbucketApiToken,
          webhookSecretStatus: document && document.secrets.webhookSecret,
        };
        this.repositoryLoadedIdentity = JSON.stringify([
          form.workspaceSlug,
          form.repositorySlug,
        ]);
      },

      async saveRepositorySettings() {
        const form = this.repositoryForm;
        const identity = JSON.stringify([
          form.workspaceSlug,
          form.repositorySlug,
        ]);
        if (this.repositoryLoadedIdentity !== identity) {
          this.settingsError = true;
          this.settingsStatus = "Repository identity 변경 후 불러오기를 먼저 실행하세요.";
          return;
        }
        this.settingsSaving = true;
        this.settingsError = false;
        try {
          const values = {
            model: form.model || null,
            reasoningEffort: form.reasoningEffort || null,
            timeoutMs: form.timeoutMs === "" ? null : Number(form.timeoutMs),
            customPrompt: form.customPrompt || null,
          };
          const secrets = this.secretMutations(
            {
              bitbucketApiToken: form.bitbucketApiToken,
              webhookSecret: form.webhookSecret,
            },
            {
              bitbucketApiToken: form.bitbucketApiTokenClear,
              webhookSecret: form.webhookSecretClear,
            },
            ["bitbucketApiToken", "webhookSecret"],
          );
          const path = settingsEndpoint + "/repositories/" +
            encodeURIComponent(form.workspaceSlug) + "/" +
            encodeURIComponent(form.repositorySlug);
          const response = await this.authorizedFetch(path, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedRevision: Number(form.revision),
              values,
              secrets,
            }),
          });
          if (!response.ok) {
            if (response.status === 409) {
              await this.loadSettings();
              this.loadRepositorySettings();
            }
            throw new Error("HTTP " + response.status);
          }
          await this.loadSettings();
          this.loadRepositorySettings();
          this.settingsStatus = "Repository 설정을 저장했습니다.";
        } catch (error) {
          this.settingsError = true;
          this.settingsStatus = error.message === "Unauthorized"
            ? "인증이 만료되었습니다."
            : "Repository 설정 저장에 실패했습니다: " + error.message;
        } finally {
          this.settingsSaving = false;
        }
      },

      async loadStats() {
        const response = await this.authorizedFetch(endpoint);
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        const repos = await response.json();
        this.repos = Array.isArray(repos) ? repos : [];
      },

      async loadRecent() {
        this.recentLoading = true;
        try {
          const response = await this.authorizedFetch(recentEndpoint);
          if (!response.ok) {
            throw new Error("HTTP " + response.status);
          }
          const reviews = await response.json();
          this.recentReviews = Array.isArray(reviews) ? reviews : [];
        } catch (error) {
          this.recentReviews = [];
        } finally {
          this.recentLoading = false;
        }
      },

      async toggleReviewOutput(id) {
        if (this.expandedReviewId === id) {
          this.expandedReviewId = null;
          this.expandedReviewOutput = null;
          this.expandedReviewError = null;
          this.expandedLoading = false;
          return;
        }

        this.expandedReviewId = id;
        this.expandedReviewOutput = null;
        this.expandedReviewError = null;
        this.expandedLoading = true;

        try {
          const response = await this.authorizedFetch(reviewDetailEndpoint(id));
          if (!response.ok) {
            throw new Error("HTTP " + response.status);
          }
          const detail = await response.json();
          if (this.expandedReviewId !== id) {
            return;
          }
          const output = detail && typeof detail.reviewOutput === "string"
            ? truncateReviewOutput(detail.reviewOutput)
            : "";
          this.expandedReviewOutput = output;
        } catch (error) {
          if (this.expandedReviewId === id) {
            this.expandedReviewError = "본문을 불러오지 못했습니다.";
          }
        } finally {
          if (this.expandedReviewId === id) {
            this.expandedLoading = false;
          }
        }
      },

      async loadDashboard() {
        try {
          this.setStatus("저장소 통계를 불러오는 중…", false);
          const results = await Promise.allSettled([
            this.loadStats(),
            this.loadRecent(),
          ]);
          const statsFailed = results[0].status === "rejected";
          this.lastUpdated = new Date();
          if (statsFailed) {
            const staleHint = " (이전 갱신 유지)";
            this.setStatus("저장소 통계 로드에 실패했습니다." + staleHint, true);
            return;
          }
          this.setStatus(
            this.repos.length + "개 저장소 · 최근 리뷰 " + this.recentReviews.length + "건 · " + formatDate(this.lastUpdated),
            false,
          );
        } catch (error) {
          const staleHint = this.lastUpdated
            ? " (마지막 갱신: " + formatDate(this.lastUpdated) + ")"
            : "";
          this.setStatus("대시보드 로드에 실패했습니다." + staleHint, true);
        }
      },
    };
  });
});
})();`;

@Injectable()
export class AppService {
  getHealth(): string {
    return "Code Review Service is healthy";
  }

  getDashboardPage(): string {
    return DASHBOARD_HTML;
  }

  getDashboardScript(): string {
    return DASHBOARD_SCRIPT;
  }

  getDashboardAlpineScript(): string {
    return ALPINE_SCRIPT;
  }
}
