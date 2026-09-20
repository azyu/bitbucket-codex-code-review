/** Codex CLI 실행 결과 */
export interface ICodexReviewResult {
  readonly rawOutput: string;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
  /** 이 실행에 실제로 넘긴 --model 값 */
  readonly model: string;
  /** 넘긴 model_reasoning_effort 값. 미설정이면 null */
  readonly reasoningEffort: string | null;
}

/**
 * codex CLI의 ChatGPT 세션 상태. auth.json을 읽어 만든 값만 담는다.
 *
 * ⚠️ 이 타입은 인증 없는 `/health/codex-auth`로 나간다 — 토큰·계정 식별자·파일 내용이
 * 새 필드로 들어가지 않게 한다. access_token JWT에는 sub·session_id·프로필이 있고
 * auth.json에는 account_id가 있지만 어느 것도 여기 넣지 않는다.
 */
export interface ICodexAuthStatus {
  /** ok = access_token 유효. 그 외는 사람이 봐야 하는 상태다 */
  readonly status: "ok" | "expired" | "unsupported_mode" | "unknown";
  /** status가 unknown일 때만. 파일에서 온 문자열이 아니라 고정 코드다 */
  readonly reason: "missing" | "malformed" | "no_token" | "bad_jwt" | null;
  /**
   * chatgpt 모드일 때만 값이 있다. 다른 모드는 null이고 status가
   * unsupported_mode로 말한다 — auth.json의 문자열을 그대로 통과시키지 않는다.
   */
  readonly authMode: "chatgpt" | null;
  readonly issuedAt: string | null;
  readonly expiresAt: string | null;
  /** 음수면 이미 만료됐다. 임계값 알람을 걸 곳이다 */
  readonly expiresInSeconds: number | null;
  /** codex가 마지막으로 토큰을 갱신한 시각. ISO로 정규화되며, 못 읽으면 null */
  readonly lastRefresh: string | null;
}
