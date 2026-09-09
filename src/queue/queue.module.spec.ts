import "reflect-metadata";
import { BullModule } from "@nestjs/bullmq";
import { REVIEW_QUEUE_CONFIG } from "../constants/queue.constants";
import { QueueModule } from "./queue.module";
import { WebhookModule } from "../webhook/webhook.module";

type DynamicModuleLike = {
  module?: unknown;
  providers?: Array<{ useValue?: { defaultJobOptions?: unknown } }>;
};

const importsOf = (module: unknown): unknown[] =>
  (Reflect.getMetadata("imports", module as object) as unknown[]) ?? [];

const isBullRegistration = (imported: unknown): boolean =>
  typeof imported === "object" &&
  imported !== null &&
  (imported as DynamicModuleLike).module === BullModule;

describe("QueueModule queue registration", () => {
  it("leaves retry settings to each immutable job snapshot", () => {
    expect(REVIEW_QUEUE_CONFIG.defaultJobOptions).toEqual({
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  });

  it("keeps the producer module on the same queue instance", () => {
    const registration = importsOf(QueueModule).find(isBullRegistration);
    expect(registration).toBeDefined();
    const webhookImports = importsOf(WebhookModule);
    expect(webhookImports).toContain(QueueModule);
    expect(webhookImports.some(isBullRegistration)).toBe(false);
  });
});
