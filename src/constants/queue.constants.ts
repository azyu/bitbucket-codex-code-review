export const REVIEW_QUEUE_NAME = "review-job" as const;

/** attempts/backoff는 job마다 설정 스냅샷에서 넣는다 (WebhookController.enqueueReview) */
export const REVIEW_QUEUE_CONFIG = {
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
  },
} as const;
