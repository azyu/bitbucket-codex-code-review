import { AppController } from "./app.controller";
import { AppService } from "./app.service";

describe("AppController", () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(() => {
    appService = new AppService();
    appController = new AppController(appService);
  });

  it("should return health text", () => {
    expect(appController.getHealth()).toBe("Code Review Service is healthy");
  });

  it("should return dashboard html document", () => {
    const html = appController.getDashboard();

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="ko" data-bs-theme="auto">');
    expect(html).toContain('src="/dashboard.js"');
    expect(html).toContain('src="/dashboard-alpine.js"');
    expect(html).toContain("프로젝트 대시보드");
    expect(html).toContain("https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css");
    expect(html).toContain('x-data="dashboardApp()"');
    expect(html).toContain('aria-label="사이드 메뉴"');
    expect(html).toContain('id="theme-toggle"');
    expect(html).toContain('aria-label="자동 테마"');
    expect(html).toContain("(prefers-color-scheme: dark)");
    expect(html).toContain("저장소 작업량");
  });

  it("should return dashboard script with stats endpoint", () => {
    const script = appController.getDashboardScript();

    expect(script).toContain("/api/internal/stats/repos");
    expect(script).toContain("loadDashboard");
    expect(script).toContain("formatDuration");
    expect(script).toContain("저장소 통계를 불러오는 중");
    expect(script).toContain("평균 리뷰 시간");
    expect(script).toContain("Alpine.data");
    expect(script).toContain("setThemePreference");
    expect(script).toContain("renderRepoOverview");
    expect(script).toContain("renderHighlights");
    expect(script).toContain("toggleSidebar");
  });

  it("should return local alpine runtime script", () => {
    const script = appController.getDashboardAlpineScript();

    expect(script.length).toBeGreaterThan(1000);
    expect(script).toContain("MutationObserver");
  });
});
