import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DashboardAuthGuard } from "./dashboard-auth.guard";

function context(authorization?: string) {
  const setHeader = jest.fn();
  const executionContext = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { executionContext, setHeader };
}

describe("DashboardAuthGuard", () => {
  const guard = new DashboardAuthGuard({
    getOrThrow: () => "dashboard-secret-key-at-least-32!",
  } as unknown as ConfigService);

  it("accepts only the exact Bearer key and disables response caching", () => {
    const valid = context("Bearer dashboard-secret-key-at-least-32!");
    expect(guard.canActivate(valid.executionContext)).toBe(true);
    expect(valid.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");

    for (const authorization of [
      undefined,
      "dashboard-secret-key-at-least-32!",
      "Bearer wrong-dashboard-secret-key!!",
    ]) {
      const invalid = context(authorization);
      expect(() => guard.canActivate(invalid.executionContext)).toThrow(
        UnauthorizedException,
      );
      expect(invalid.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "no-store",
      );
    }
  });
});
