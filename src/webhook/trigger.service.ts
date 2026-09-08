import { Injectable } from "@nestjs/common";
import { ServiceLogger } from "@lib/logger";

const CODEX_MENTION_REGEX = /(?:^|\s)@codex(?:\s+review)?(?:\s|$)/i;
const CODEX_FORCE_REGEX =
  /(?:^|\s)@codex(?:\s+review)?\s+--force(?:\s|$)/i;
// 값은 그대로 codex CLI argv(`--model <value>`)로 넘어가므로 첫 글자를 영숫자로
// 제한해 플래그로 해석될 여지를 없앤다.
const CODEX_MODEL_REGEX = /--model[:=\s]\s*([A-Za-z0-9][\w.-]*)/i;

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

  /** 댓글이 동일 commit 재리뷰를 강제하는지 확인 */
  isForceReview(commentRaw: string): boolean {
    return CODEX_FORCE_REGEX.test(commentRaw);
  }

  /** 댓글에 지정된 리뷰 모델(`--model:<name>`)을 추출. 없으면 undefined */
  parseModelOverride(commentRaw: string): string | undefined {
    return CODEX_MODEL_REGEX.exec(commentRaw)?.[1];
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
