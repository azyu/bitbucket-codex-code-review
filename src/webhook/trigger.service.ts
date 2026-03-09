import { Injectable } from "@nestjs/common";
import { ServiceLogger } from "@lib/logger";

const CODEX_MENTION_REGEX = /(?:^|\s)@codex(?:\s+review)?(?:\s|$)/i;

@Injectable()
export class TriggerService {
  private readonly logger = new ServiceLogger(TriggerService.name);

  /** 댓글에서 @codex 멘션 패턴이 포함되어 있는지 확인 */
  hasCodexMention(commentRaw: string): boolean {
    const result = CODEX_MENTION_REGEX.test(commentRaw);
    this.logger.debug(
      `Mention check: "${commentRaw.substring(0, 100)}" => ${result}`,
    );
    return result;
  }

  /** PR 이벤트에서 자동 리뷰를 트리거해야 하는지 확인 */
  shouldAutoReview(eventKey: string, triggerMode: string): boolean {
    const autoEvents = ["pullrequest:created", "pullrequest:updated"];
    return (
      autoEvents.includes(eventKey) &&
      (triggerMode === "auto" || triggerMode === "both")
    );
  }

  /** 댓글 멘션 트리거가 활성화되어 있는지 확인 */
  shouldMentionReview(triggerMode: string): boolean {
    return triggerMode === "mention" || triggerMode === "both";
  }
}
