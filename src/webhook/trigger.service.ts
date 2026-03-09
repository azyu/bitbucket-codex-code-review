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
}
