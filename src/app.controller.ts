import {
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { AppService } from "./app.service";
import { CodexService } from "./codex/codex.service";
import { ICodexAuthStatus } from "./codex/interfaces/codex.interfaces";

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly codexService: CodexService,
  ) {}

  @Get("health")
  getHealth(): string {
    return this.appService.getHealth();
  }

  /**
   * codex ChatGPT 세션 상태. ok면 200, 그 외 503.
   *
   * `/health`와 분리한 이유: tools-infra의 `admin.py`와 `rotate-repo-token.sh`가
   * `/health`의 200을 **배포 성공 판정**으로 쓴다. 인증 만료로 그쪽이 503이 되면
   * 멀쩡한 배포가 실패로 보고된다.
   *
   * 이 경로의 한계는 getAuthStatus()의 주석을 볼 것 — refresh_token 유효성은
   * 판정하지 못한다.
   */
  @Get("health/codex-auth")
  @Header("Cache-Control", "no-store")
  async getCodexAuthHealth(): Promise<ICodexAuthStatus> {
    const status = await this.codexService.getAuthStatus();
    if (status.status !== "ok") {
      throw new HttpException(status, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return status;
  }
}
