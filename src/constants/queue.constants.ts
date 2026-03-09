export const REVIEW_QUEUE_NAME = "review-job" as const;
export const REVIEW_DLQ_NAME = "review-dlq" as const;

export const REVIEW_QUEUE_CONFIG = {
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
    attempts: 2,
    backoff: {
      type: "exponential" as const,
      delay: 10_000,
    },
  },
} as const;
