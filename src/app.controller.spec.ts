import { HttpException } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { CodexService } from "./codex/codex.service";
import { ICodexAuthStatus } from "./codex/interfaces/codex.interfaces";

const OK_STATUS: ICodexAuthStatus = {
  status: "ok",
  reason: null,
  authMode: "chatgpt",
  issuedAt: "2026-09-05T16:03:54.000Z",
  expiresAt: "2026-09-15T16:03:54.000Z",
  expiresInSeconds: 3600,
  lastRefresh: "2026-09-05T16:03:55.571058Z",
};

// The ten dashboard tests that used to live here evaluated the old Alpine
// application out of a template-literal string. The page is now a built Svelte
// bundle, and the invariants they covered moved with it:
//   - invariants 1, 3, 4, 5, 6 → dashboard/src/lib/store.spec.ts
//   - invariant 8             → dashboard/src/lib/shell.spec.ts
//   - invariant 7             → src/dashboard-csp.spec.ts
describe("AppController", () => {
  let appController: AppController;
  let getAuthStatus: jest.Mock;

  beforeEach(() => {
    getAuthStatus = jest.fn().mockResolvedValue(OK_STATUS);
    appController = new AppController(new AppService(), {
      getAuthStatus,
    } as unknown as CodexService);
  });

  it("should return health text", () => {
    expect(appController.getHealth()).toBe("Code Review Service is healthy");
  });

  it("returns the codex auth status when the session is valid", async () => {
    await expect(appController.getCodexAuthHealth()).resolves.toEqual(OK_STATUS);
  });

  // tools-infra의 admin.py / rotate-repo-token.sh가 /health 200을 배포 성공
  // 판정으로 쓴다 — 인증 만료가 배포 실패로 보이면 안 된다.
  it("keeps /health healthy even when the codex session is expired", () => {
    getAuthStatus.mockResolvedValue({ ...OK_STATUS, status: "expired" });

    expect(appController.getHealth()).toBe("Code Review Service is healthy");
  });

  it.each(["expired", "unknown", "unsupported_mode"] as const)(
    "answers 503 with the status body when codex auth is %s",
    async (status) => {
      getAuthStatus.mockResolvedValue({ ...OK_STATUS, status });

      const error = await appController
        .getCodexAuthHealth()
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(503);
      expect((error as HttpException).getResponse()).toMatchObject({ status });
    },
  );
});
