/**
 * Korean is the default; the choice is persisted next to the theme and for the
 * same reason — it is a display preference, not operational data, so invariant
 * 1 (nothing derived from the key survives a lock) does not reach it.
 */
const STORAGE_KEY = "dashboard-locale";

export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];

const MESSAGES: Record<Locale, Record<string, string>> = {
  ko: {
    "app.title": "코드 리뷰 운영",
    "nav.overview": "개요",
    "nav.settings": "설정",
    "action.refresh": "새로고침",
    "action.refreshing": "새로고침 중…",
    "action.lock": "잠금",
    "action.open": "열기",
    "action.close": "닫기",
    "action.load": "불러오기",
    "theme.toggle": "색상 테마 전환",
    "theme.light": "라이트",
    "theme.dark": "다크",
    "locale.toggle": "언어 전환",
    "locale.ko": "한국어",
    "locale.en": "English",
    "common.loading": "불러오는 중…",
    "common.saving": "저장 중…",

    "lock.intro":
      "이 콘솔은 키로 잠겨 있습니다. 키는 이 탭의 메모리에만 보관되며, 새로고침·잠금·요청 거부 시 이 화면으로 돌아옵니다.",
    "lock.keyLabel": "대시보드 키",
    "lock.unlock": "잠금 해제",
    "lock.unlocking": "잠금 해제 중…",

    "overview.runs": "리뷰 실행",
    "overview.repositories": "저장소 {count}개",
    "overview.completed": "완료",
    "overview.ofRuns": "전체의 {percent}",
    "overview.failed": "실패",
    "overview.superseded": "대체됨 {count}건",
    "overview.reviewTime": "리뷰 시간",
    "overview.average": "평균 {duration}",
    "overview.tokens": "토큰",
    "overview.inputOutput": "입력 + 출력",
    "overview.reposHeading": "저장소",
    "overview.noRuns": "기록된 리뷰 실행이 없습니다.",
    "overview.breakdown":
      "완료 {completed}건, 실패 {failed}건, 대체됨 {superseded}건",
    "overview.runCount": "실행",
    "overview.success": "성공률",
    "overview.codexAvg": "Codex 평균",
    "overview.reviewAvg": "리뷰 평균",
    "overview.latestPr": "최근 PR",
    "overview.recent": "최근 리뷰",
    "overview.nothingYet": "아직 없습니다.",
    "column.status": "상태",
    "column.repository": "저장소",
    "column.pr": "PR",
    "column.head": "Head",
    "column.trigger": "트리거",
    "column.model": "모델",
    "column.codex": "Codex",
    "column.total": "전체",
    "column.tokens": "토큰",
    "column.when": "시각",

    "detail.aria": "리뷰 실행 상세",
    "detail.title": "리뷰 실행",
    "detail.runId": "실행 ID",
    "detail.started": "시작",
    "detail.updated": "갱신",
    "detail.trigger": "트리거",
    "detail.branch": "브랜치",
    "detail.commits": "커밋",
    "detail.codexModel": "Codex 모델",
    "detail.effort": "추론 강도",
    "detail.codexTime": "Codex 시간",
    "detail.totalTime": "전체 시간",
    "detail.inputTokens": "입력 토큰",
    "detail.cachedInput": "캐시된 입력",
    "detail.outputTokens": "출력 토큰",
    "detail.resultComment": "결과 댓글",
    "detail.error": "오류",
    "detail.snapshot": "실행 시점 설정",
    "detail.revision": "리비전",
    "detail.model": "모델",
    "detail.timeout": "타임아웃",
    "detail.triggerMode": "트리거 모드",
    "detail.retries": "재시도",
    "detail.published": "게시된 리뷰",

    "settings.notLoaded": "설정을 불러오지 못했습니다.",
    "settings.global": "전역",
    "settings.meta": "리비전 {revision} · 갱신 {updatedAt}",
    "settings.saveGlobal": "전역 저장",
    "settings.secrets": "시크릿",
    "settings.secretsNote":
      "암호화되어 저장됩니다. API는 값이 설정되었는지와 출처만 알려주며, 값 자체는 쓰기 전용입니다.",
    "settings.basicCredential": "Bitbucket basic 자격 증명",
    "settings.basicNote": "전역 전용 — 저장소 라우트는 이 값을 거부합니다.",
    "settings.basicConfigured": "현재 설정되어 있습니다.",
    "settings.basicNotConfigured": "설정되어 있지 않습니다.",
    "settings.action": "동작",
    "settings.username": "사용자 이름",
    "settings.appPassword": "앱 비밀번호",
    "settings.repoOverride": "저장소 재정의",
    "settings.repoOverrideNote":
      "체크하지 않은 필드는 저장소에 저장되고, 상속 필드는 전역 값을 따릅니다.",
    "settings.saveRepository": "저장소 저장",
    "settings.workspaceSlug": "워크스페이스 슬러그",
    "settings.repositorySlug": "저장소 슬러그",
    "settings.configured": "설정됨:",
    "settings.loadHint": "재정의를 편집하려면 저장소를 불러오세요.",
    "settings.staleIdentity":
      "불러온 뒤 식별 필드가 바뀌었습니다. 저장하기 전에 {current}를 다시 불러오세요 — 이 초안은 {loaded}의 것입니다.",

    "op.keep": "변경 안 함",
    "op.replace": "교체",
    "op.clear": "삭제",
    "secret.status.unknown": "알 수 없음",
    "secret.status.notConfigured": "설정 안 됨",
    "secret.status.inherited": "전역에서 상속",
    "secret.status.setOn": "{source}에 설정됨",
    "secret.actionAria": "{label} 동작",
    "secret.placeholder.new": "새 값",
    "secret.placeholder.none": "값을 보내지 않음",
    "secret.openaiApiKey": "OpenAI API 키",
    "secret.bitbucketApiToken": "Bitbucket API 토큰",
    "secret.webhookSecret": "웹훅 시크릿",

    "field.inherit": "상속",
    "field.unset": "(미설정)",
    "field.chars": "{length} / {max}자",
    "field.model": "Codex 모델",
    "field.reasoningEffort": "추론 강도",
    "field.reasoningEffort.hint": "비우면 미설정",
    "field.timeoutMs": "Codex 타임아웃",
    "field.customPrompt": "커스텀 리뷰 프롬프트",
    "field.openaiBaseUrl": "OpenAI base URL",
    "field.openaiBaseUrl.hint": "HTTPS만 허용, 비우면 기본값",
    "field.triggerMode": "트리거 모드",
    "field.retryAttempts": "재시도 횟수",
    "field.retryDelay": "재시도 지연",
    "field.retryDelay.hint": "ms, 0 허용",
    "field.workerConcurrency": "워커 동시 실행 수",
    "field.cloneTimeoutMs": "Git clone 타임아웃",
    "field.hint.ms": "ms",

    "time.justNow": "방금 전",
    "time.minutesAgo": "{count}분 전",
    "time.hoursAgo": "{count}시간 전",
    "time.daysAgo": "{count}일 전",

    "error.request": "요청이 실패했습니다.",
    "error.keyRejected": "키가 거부되었습니다. 다시 입력하세요.",
    "error.keyRequired": "대시보드 키를 입력하세요.",
    "error.reviewNotFound": "리뷰 실행을 찾을 수 없습니다.",
    "error.repoChanged":
      "불러온 뒤 저장소가 바뀌었습니다. 저장하기 전에 다시 불러오세요.",
    "notice.saved": "리비전 {revision}으로 저장했습니다.",
    "notice.conflictReloaded":
      "저장되지 않았습니다 — 불러온 뒤 다른 곳에서 변경되었습니다. 현재 값을 다시 불러왔으니 수정을 다시 적용하세요.",
    "notice.conflictReloadFailed":
      "저장되지 않았습니다 — 불러온 뒤 다른 곳에서 변경되었고, 현재 값을 다시 불러오지도 못했습니다. 새로고침 후 다시 시도하세요.",
  },
  en: {
    "app.title": "Code review operations",
    "nav.overview": "Overview",
    "nav.settings": "Settings",
    "action.refresh": "Refresh",
    "action.refreshing": "Refreshing…",
    "action.lock": "Lock",
    "action.open": "Open",
    "action.close": "Close",
    "action.load": "Load",
    "theme.toggle": "Toggle colour theme",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "locale.toggle": "Switch language",
    "locale.ko": "한국어",
    "locale.en": "English",
    "common.loading": "Loading…",
    "common.saving": "Saving…",

    "lock.intro":
      "This console is key-gated. The key is held in memory for this tab only — a reload, a lock, or a rejected request returns here.",
    "lock.keyLabel": "Dashboard key",
    "lock.unlock": "Unlock",
    "lock.unlocking": "Unlocking…",

    "overview.runs": "Review runs",
    "overview.repositories": "{count} repositories",
    "overview.completed": "Completed",
    "overview.ofRuns": "{percent} of runs",
    "overview.failed": "Failed",
    "overview.superseded": "{count} superseded",
    "overview.reviewTime": "Review time",
    "overview.average": "{duration} avg",
    "overview.tokens": "Tokens",
    "overview.inputOutput": "input + output",
    "overview.reposHeading": "Repositories",
    "overview.noRuns": "No review runs recorded yet.",
    "overview.breakdown":
      "{completed} completed, {failed} failed, {superseded} superseded",
    "overview.runCount": "Runs",
    "overview.success": "Success",
    "overview.codexAvg": "Codex avg",
    "overview.reviewAvg": "Review avg",
    "overview.latestPr": "Latest PR",
    "overview.recent": "Recent reviews",
    "overview.nothingYet": "Nothing yet.",
    "column.status": "Status",
    "column.repository": "Repository",
    "column.pr": "PR",
    "column.head": "Head",
    "column.trigger": "Trigger",
    "column.model": "Model",
    "column.codex": "Codex",
    "column.total": "Total",
    "column.tokens": "Tokens",
    "column.when": "When",

    "detail.aria": "Review run detail",
    "detail.title": "Review run",
    "detail.runId": "Run id",
    "detail.started": "Started",
    "detail.updated": "Updated",
    "detail.trigger": "Trigger",
    "detail.branch": "Branch",
    "detail.commits": "Commits",
    "detail.codexModel": "Codex model",
    "detail.effort": "Effort",
    "detail.codexTime": "Codex time",
    "detail.totalTime": "Total time",
    "detail.inputTokens": "Input tokens",
    "detail.cachedInput": "Cached input",
    "detail.outputTokens": "Output tokens",
    "detail.resultComment": "Result comment",
    "detail.error": "Error",
    "detail.snapshot": "Settings at run time",
    "detail.revision": "Revision",
    "detail.model": "Model",
    "detail.timeout": "Timeout",
    "detail.triggerMode": "Trigger mode",
    "detail.retries": "Retries",
    "detail.published": "Published review",

    "settings.notLoaded": "Settings are not loaded.",
    "settings.global": "Global",
    "settings.meta": "revision {revision} · updated {updatedAt}",
    "settings.saveGlobal": "Save global",
    "settings.secrets": "Secrets",
    "settings.secretsNote":
      "Stored encrypted; the API reports only whether a value is configured and where it came from. Values are write-only.",
    "settings.basicCredential": "Bitbucket basic credential",
    "settings.basicNote": "Global only — the repository route rejects it.",
    "settings.basicConfigured": "Currently configured.",
    "settings.basicNotConfigured": "Not configured.",
    "settings.action": "Action",
    "settings.username": "Username",
    "settings.appPassword": "App password",
    "settings.repoOverride": "Repository override",
    "settings.repoOverrideNote":
      "Unchecked fields are stored on the repository; inherited fields fall back to global.",
    "settings.saveRepository": "Save repository",
    "settings.workspaceSlug": "Workspace slug",
    "settings.repositorySlug": "Repository slug",
    "settings.configured": "Configured:",
    "settings.loadHint": "Load a repository to edit its override.",
    "settings.staleIdentity":
      "The identity fields changed since load. Load {current} again before saving — this draft belongs to {loaded}.",

    "op.keep": "leave unchanged",
    "op.replace": "replace",
    "op.clear": "clear",
    "secret.status.unknown": "unknown",
    "secret.status.notConfigured": "not configured",
    "secret.status.inherited": "inherited from global",
    "secret.status.setOn": "set on {source}",
    "secret.actionAria": "{label} action",
    "secret.placeholder.new": "new value",
    "secret.placeholder.none": "no value sent",
    "secret.openaiApiKey": "OpenAI API key",
    "secret.bitbucketApiToken": "Bitbucket API token",
    "secret.webhookSecret": "Webhook secret",

    "field.inherit": "inherit",
    "field.unset": "(unset)",
    "field.chars": "{length} / {max} characters",
    "field.model": "Codex model",
    "field.reasoningEffort": "Reasoning effort",
    "field.reasoningEffort.hint": "empty = unset",
    "field.timeoutMs": "Codex timeout",
    "field.customPrompt": "Custom review prompt",
    "field.openaiBaseUrl": "OpenAI base URL",
    "field.openaiBaseUrl.hint": "HTTPS only; empty = default",
    "field.triggerMode": "Trigger mode",
    "field.retryAttempts": "Retry attempts",
    "field.retryDelay": "Retry delay",
    "field.retryDelay.hint": "ms; 0 allowed",
    "field.workerConcurrency": "Worker concurrency",
    "field.cloneTimeoutMs": "Git clone timeout",
    "field.hint.ms": "ms",

    "time.justNow": "just now",
    "time.minutesAgo": "{count}m ago",
    "time.hoursAgo": "{count}h ago",
    "time.daysAgo": "{count}d ago",

    "error.request": "Request failed.",
    "error.keyRejected": "Key rejected. Enter it again.",
    "error.keyRequired": "Enter the dashboard key.",
    "error.reviewNotFound": "Review run not found.",
    "error.repoChanged":
      "Repository changed since load. Load it again before saving.",
    "notice.saved": "Saved at revision {revision}.",
    "notice.conflictReloaded":
      "Not saved — changed elsewhere since load. Reloaded; re-apply your edits.",
    "notice.conflictReloadFailed":
      "Not saved — changed elsewhere since load, and reloading the current values failed. Refresh before trying again.",
  },
};

function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

function stored(): Locale | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    // Storage blocked (private window, site data off): fall back to the default.
    return null;
  }
}

/** Korean is the default, so an unset preference is not a system lookup. */
let locale = $state<Locale>(stored() ?? "ko");

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  locale = next;
  document.documentElement.lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Preference simply does not survive the reload.
  }
}

export function applyStoredLocale(): Locale {
  document.documentElement.lang = locale;
  return locale;
}

export function t(
  key: string,
  params?: Record<string, string | number>,
): string {
  // A missing key renders as the key itself rather than blank, so a gap is
  // visible in the UI instead of silently swallowing the label.
  const template = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * A message that outlives the render that produced it. `t()` resolves against
 * the locale that is live when it is called, so a message stored as its result
 * would keep the language it was written in while the rest of the screen
 * switches. Our own text is therefore stored as its key and parameters and
 * resolved at render time; a bare string is text we did not author — a server
 * message — and is shown verbatim because there is nothing to translate it to.
 */
export type Message =
  | string
  | { key: string; params?: Record<string, string | number> };

export function resolve(message: Message | null): string | null {
  if (message === null) return null;
  return typeof message === "string" ? message : t(message.key, message.params);
}
