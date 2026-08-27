export const REVIEW_QUEUE_NAME = "review-job" as const;
export const REVIEW_DLQ_NAME = "review-dlq" as const;

/** attempts/backoff는 QUEUE_RETRY_ATTEMPTS/QUEUE_RETRY_DELAY에서 주입된다 (queue.module.ts) */
export const REVIEW_QUEUE_CONFIG = {
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
  },
} as const;
