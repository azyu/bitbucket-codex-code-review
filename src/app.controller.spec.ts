import { AppController } from "./app.controller";
import { AppService } from "./app.service";

// The ten dashboard tests that used to live here evaluated the old Alpine
// application out of a template-literal string. The page is now a built Svelte
// bundle, and the invariants they covered moved with it:
//   - invariants 1, 3, 4, 5, 6 → dashboard/src/lib/store.spec.ts
//   - invariant 8             → dashboard/src/lib/shell.spec.ts
//   - invariant 7             → src/dashboard-csp.spec.ts
describe("AppController", () => {
  let appController: AppController;

  beforeEach(() => {
    appController = new AppController(new AppService());
  });

  it("should return health text", () => {
    expect(appController.getHealth()).toBe("Code Review Service is healthy");
  });
});
