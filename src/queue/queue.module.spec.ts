import "reflect-metadata";
import { BullModule, getQueueOptionsToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { DEFAULTS } from "../config/configuration";
import { REVIEW_QUEUE_NAME } from "../constants/queue.constants";
import { QueueModule } from "./queue.module";
import { WebhookModule } from "../webhook/webhook.module";

type ProviderLike = {
  provide?: unknown;
  useFactory?: (...args: unknown[]) => unknown;
};
type DynamicModuleLike = { module?: unknown; providers?: ProviderLike[] };

const importsOf = (module: unknown): unknown[] =>
  (Reflect.getMetadata("imports", module as object) as unknown[]) ?? [];

const isBullRegistration = (imported: unknown): boolean =>
  typeof imported === "object" &&
  imported !== null &&
  (imported as DynamicModuleLike).module === BullModule;

const buildConfigService = (values: Record<string, unknown>): ConfigService =>
  ({
    get: jest.fn((key: string, defaultValue?: unknown) =>
      key in values ? values[key] : defaultValue,
    ),
  }) as unknown as ConfigService;

/** registerQueueAsync가 감싼 factory는 (depHolder, ...inject) 순서로 호출된다 */
const resolveQueueOptions = async (
  values: Record<string, unknown>,
): Promise<{ defaultJobOptions?: Record<string, unknown> }> => {
  const registration = importsOf(QueueModule).find(
    isBullRegistration,
  ) as DynamicModuleLike;
  expect(registration).toBeDefined();

  const optionsProvider = (registration.providers ?? []).find(
    (provider) => provider.provide === getQueueOptionsToken(REVIEW_QUEUE_NAME),
  );
  expect(optionsProvider?.useFactory).toBeDefined();

  return (await optionsProvider!.useFactory!(
    { getDependencyRef: () => ({}) },
    buildConfigService(values),
  )) as { defaultJobOptions?: Record<string, unknown> };
};

describe("QueueModule queue registration", () => {
  it("registers the review queue with retries enabled", async () => {
    const options = await resolveQueueOptions({});

    expect(options.defaultJobOptions).toMatchObject({
      attempts: DEFAULTS.QUEUE_RETRY_ATTEMPTS,
      backoff: { type: "exponential", delay: DEFAULTS.QUEUE_RETRY_DELAY },
    });
    expect(
      options.defaultJobOptions?.["attempts"] as number,
    ).toBeGreaterThan(1);
  });

  it("takes attempts/backoff from QUEUE_RETRY_* config", async () => {
    const options = await resolveQueueOptions({
      "queue.retryAttempts": 5,
      "queue.retryDelay": 1234,
    });

    expect(options.defaultJobOptions).toMatchObject({
      attempts: 5,
      backoff: { type: "exponential", delay: 1234 },
    });
  });

  it("keeps the producer module on the same queue instance", () => {
    const webhookImports = importsOf(WebhookModule);

    expect(webhookImports).toContain(QueueModule);
    // 자체 registerQueue는 defaultJobOptions 없는 별개 인스턴스를 만든다 — 금지
    expect(webhookImports.some(isBullRegistration)).toBe(false);
  });
});
