# TASKS.md

> 마지막 업데이트: 2026-09-04


## 진행 중/최근 작업


### Task 36: Codex bubblewrap user namespace 배포 조건
- **상태**: ✅ 완료 (정적 검증 완료; 실제 클러스터 런타임 미검증)
- **배경**: 대형 PR branch-diff 모드에서 Codex read-only sandbox의 bubblewrap이 user namespace를 만들지 못하면 Git diff를 읽지 못하고 내용 없는 리뷰를 생성함. tools-infra에서 `seccomp:unconfined`만으로 해결됨.

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 배포물 점검 | ✅ | `docker-compose.yml`에 worker `security_opt`가 없었고 Helm container securityContext에 seccompProfile이 없음을 확인. |
| Compose 수정 | ✅ | `code-review-worker`에 `seccomp:unconfined` 추가. `CAP_SYS_ADMIN`/`privileged`는 추가하지 않음. |
| Helm 수정 | ✅ | `securityContext.seccompProfile.type: Unconfined`를 기본값으로 추가. 기존 values 경로를 통해 `RuntimeDefault` 등으로 덮어쓸 수 있음. |
| 문서화 | ✅ | README에 branch-diff의 bubblewrap user namespace 요구사항과 `unshare --user --map-root-user true` 확인 절차 추가. |
| 검증 | ✅ | `docker compose config --quiet`, `helm lint charts/code-review-worker`, Helm 렌더링, `pnpm build`, `pnpm lint`, `pnpm test --runInBand` 확인. 실제 클러스터/동일 런타임에서 `unshare` 또는 Codex 셸 실행은 접근 불가로 미검증. |
| 커밋/푸시 | ⏸️ | 사용자 승인 전 보류. |

### Task 35: 동일 commit 강제 재리뷰
- **상태**: ✅ 완료
- **배경**: 동일 PR commit hash는 idempotency key로 차단되어, 이미 완료된 리뷰를 명시적으로 다시 실행할 방법이 없었음.

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| `--force` 명령 감지 | ✅ | `@codex --force`와 `@codex review --force`를 독립 옵션으로 인식하고 `--forceful` 같은 부분 일치는 거부 |
| 강제 재리뷰 큐잉 | ✅ | 기존 commit key 대신 댓글 ID가 포함된 force key를 사용해 완료 리뷰를 유지한 채 새 리뷰 생성. 같은 댓글 웹훅 재전송은 계속 중복 차단 |
| 트리거 모드 우회 | ✅ | 명시적 force 명령은 `auto` 모드에서도 수동 재리뷰 가능 |
| 문서 | ✅ | README에 명령과 댓글 단위 멱등성 동작 추가 |
| 회귀 테스트 | ✅ | 기존 commit key가 중복이어도 force key로 DB 실행과 BullMQ job이 생성되는 경로 검증 |
| 빌드/린트/테스트 | ✅ | `pnpm lint`, `pnpm build`, `pnpm test --runInBand` 성공 (244 tests) |
| 커버리지 | ✅ | `pnpm test:cov --runInBand` 성공, statement 89.92%, branch 80.69% |
| 보안 체크리스트 | ✅ | force는 서명 검증된 기존 webhook 경계 내부에서만 처리. 신규 시크릿·에러 노출 없음. 옵션 경계 및 webhook 재전송 중복 방지 검증 |
| 커밋 | ✅ | conventional commit 완료 |

### Task 34: Codex CLI 런타임 버전 업그레이드
- **상태**: ✅ 완료
- **배경**: Docker 런타임의 `@openai/codex` 핀이 `0.149.1`에 머물러 npm `latest`(`0.153.2`)와 4개 마이너 뒤처짐.

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 버전 핀 갱신 | ✅ | `Dockerfile:36`을 `@openai/codex@0.153.2`로 변경. 이 프로젝트의 codex 버전 핀은 이 한 줄뿐이고 `CODEX_BINARY_PATH`는 PATH 조회(`codex`)라 이미지 재빌드로만 반영 |
| CLI 인터페이스 호환성 | ✅ | 사용 중인 `codex exec --model/--sandbox/--json/--output-last-message/-c model_reasoning_effort` (`src/codex/codex.service.ts:46-61`)에 0.150~0.153.2 릴리스 노트상 breaking change 없음. 변경은 TUI/MCP/Guardian 위주 |
| 0.152.0 chore 확인 | ✅ | `update_plan` 툴이 기본 비활성으로 전환됐으나 헤드리스 `codex exec` 경로에는 영향 없음 |
| 빌드/린트/테스트 | ✅ | `pnpm lint`, `pnpm build`, `pnpm test --runInBand` 성공 (242 tests) |
| 보안 체크리스트 | ✅ | 시크릿·외부 입력·에러 노출 변경 없음. 버전 문자열 한 줄 변경 |
| Docker 이미지 검증 | ⚠️ | 이미지 빌드 및 컨테이너 내부 `codex --version` 확인은 미실행 (CI/배포 시 검증 필요) |

### Task 33: Bitbucket 인증 실패 관측성과 재시도 분류
- **상태**: ✅ 완료
- **배경**: repo 전용 토큰 만료 시 진행·실패 댓글과 git fetch가 모두 같은 토큰으로 실패하고, 복구 불가능한 인증 오류를 3회 재시도한 뒤 로그만 남긴 운영 인시던트.

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 인증 실패 즉시 중단 | ✅ | git `fatal: Authentication failed`와 Bitbucket API 401을 영구 실패로 분류해 첫 시도에 FAILED를 저장하고 `UnrecoverableError`로 재시도 차단 |
| 독립 관측 표면 | ✅ | `code_review_authentication_failures_total{repository,stage}` Prometheus counter 추가. `OTEL_SDK_DISABLED=true`여도 `METRICS_PORT` exporter는 독립 실행 |
| 댓글 자격증명 폴백 | ✅ | repo 토큰 요청이 401이면 기존 global API token 또는 username/app password로 댓글 API를 한 번 재시도. global 자격증명이 없으면 추가 요청 없이 실패 |
| 실패 통지 await | ✅ | fire-and-forget 실패 댓글을 await해 종료 전에 게시 결과 또는 실패 로그를 확정 |
| 회귀 테스트 | ✅ | 실제 Prometheus endpoint에서 repo git 인증 실패 metric과 첫 시도 중단 검증, repo token 401의 global 폴백/폴백 없음 검증. RED → GREEN 확인 |
| 빌드/린트/테스트 | ✅ | `pnpm lint`, `pnpm build`, `pnpm test --runInBand` 성공 (241 tests) |
| 커버리지 | ✅ | `pnpm test:cov --runInBand` 성공, statement 89.79%, branch 80.24% |
| 보안 체크리스트 | ✅ | metric label은 repository slug와 고정 stage만 노출. 토큰·응답 본문 신규 노출 없음. 외부 입력·설정 추가 없음 |
| 커밋 | ✅ | 사용자 승인 후 conventional commit 및 원격 브랜치 push |

### Task 32: 게시 후 상태 기록 실패 중복 리뷰 차단
- **상태**: ✅ 완료
- **배경**: GitHub 이슈 #27. Bitbucket 요약 댓글 게시 후 `markCompleted()`가 실패하면 런이 `FAILED`가 되고, 같은 웹훅 재수신 시 기존 행을 삭제해 Codex와 리뷰 댓글을 중복 실행·게시하던 경로.

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 게시 증거 조기 저장 | ✅ | JSON summary/raw fallback의 첫 일반 댓글 ID를 인라인 게시·완료 처리 전에 `resultCommentId`로 저장. 상태를 바꾸지 않는 전용 update라 supersede 상태를 되살리지 않음 |
| 멱등성 경계 수정 | ✅ | `FAILED + resultCommentId 없음`만 삭제해 재시도하고, 게시 흔적이 있는 FAILED 및 모든 PUBLISHING 행은 중복 요청으로 차단 |
| 연속 DB 실패 방어 | ✅ | ID 저장 전에 process-local ID를 보존하고 catch의 FAILED metadata에 포함. ID 저장과 FAILED 저장이 모두 실패하면 PUBLISHING이 남아 webhook 재수신을 차단 |
| 회귀 테스트 | ✅ | FAILED/null·FAILED/ID·PUBLISHING/null 판정, ID-only update await/rejection, JSON/raw 저장 순서, 완료 실패, ID/FAILED 연속 실패 경로 검증 |
| 적대적 리뷰 | ✅ | correctness/security-operations/contracts 3축, 보완 후 2회 재검토. 최종 blocking finding 없음 |
| PR #31 P1 보완 | ✅ | `updateResultCommentId` 일시 실패가 인라인 게시·완료 처리를 중단하지 않도록 콜백에서 격리하고 회귀 테스트 추가 |
| 빌드/린트/테스트 | ✅ | `pnpm lint`, `pnpm build`, `pnpm test --runInBand` 성공 (238 tests), `pnpm test:cov --runInBand` statement 88.01% |
| 보안 체크리스트 | ✅ | 신규 외부 입력·시크릿·에러 노출·스키마 변경 없음. 내부 result comment ID와 상태만 조회·갱신 |
| 범위 밖 | ⚠️ | #26 stalled redelivery/supersede TOCTOU, #28 첫 쓰기 429/503, Bitbucket ambiguous response success는 별도 이슈 범위 유지 |


### Task 31: 최초 clone 타임아웃 + 큐 재시도 미배선 수정
- **상태**: ✅ 완료
- **배경**: 운영에서 `todoeng-academy-web` PR #31 리뷰가 정확히 120.005초에 `Git clone failed`로 실패. 인증·인스턴스 병목 아님(같은 순간 API 코멘트 성공, CPU 1.9%). 같은 컨테이너에서 수동 재현 시 28초/29MB 성공 — 최초 pack 생성 대기로 **추정**. 로그는 `failed permanently after 1 attempts`로, 정의된 재시도도 실효 없었음.

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| clone 타임아웃 설정화 | ✅ | `ensureBareRepo` 120s 하드코딩 → `workspace.cloneTimeoutMs`(`GIT_CLONE_TIMEOUT_MS`, 기본 600s). 타임아웃 kill 시 git이 부분 디렉토리를 정리해 재시도도 0부터 다시 받는 구조라 넉넉한 값이 필요 |
| fetchLatest 타임아웃 | ✅ | 60s → 300s 하드코딩 유지. 오래 방치된 repo의 증분 fetch도 같은 서버측 pack 생성 대기를 겪음. clone과 달리 실패해도 bare repo가 남아 재시도가 저렴하므로 env 노출은 생략 |
| 큐 등록 일원화 | ✅ | `WebhookModule`의 중복 `registerQueue`(defaultJobOptions 없음) 제거 → `QueueModule` import. producer(`webhook.controller.ts`의 `@InjectQueue`)가 옵션 없는 별개 인스턴스를 쓰던 원인 |
| QUEUE_RETRY_* 실제 배선 | ✅ | `registerQueueAsync` + `ConfigService`로 `attempts`=`queue.retryAttempts`, exponential backoff delay=`queue.retryDelay`. 죽은 설정 2개를 살리는 쪽을 선택. `REVIEW_QUEUE_CONFIG`의 `attempts: 2`/`delay: 10_000`은 producer 경로에 적용된 적이 없어 제거(단일 출처 = env) |
| 회귀 테스트 | ✅ | `queue.module.spec.ts` 3케이스 — 등록된 큐의 `attempts>1`, env override 반영, producer가 자체 `registerQueue`를 하지 않음. 수정 전 상태 재현 시 RED 확인 |
| clone 타임아웃 테스트 | ✅ | `workspace.service.spec.ts` clone 호출이 config 값(900s)을 `timeout`으로 받는지 검증 |
| 빌드/린트/테스트 | ✅ | `pnpm build`, `pnpm lint`, `pnpm test:cov` 성공 (210 tests, statement 86.82%) |
| 보안 체크리스트 | ✅ | 시크릿·신규 외부 입력 없음, clone 에러 URL 마스킹 로직 유지 |
| PR #25 Codex 리뷰 반영 (P1 2건) | ✅ | 재시도를 실제로 켜면서 생긴 노출 2건. ① 게시 전 실패는 마지막 시도에서만 FAILED 기록·실패 코멘트 → 중간 시도의 "❌ 실패" 코멘트와, 백오프 중 `existsByIdempotencyKey`가 FAILED 행을 지우고 재시도 잡을 제거하는 경로를 차단 ② 게시 단계 진입 후 실패는 `UnrecoverableError`로 재시도 차단(리뷰 코멘트 중복 게시 + Codex 재실행 방지). `onFailed` 로그도 재시도/최종 실패를 구분 — BullMQ는 재시도로 이어지는 실패에도 `failed`를 emit한다 |
| PR #25 Codex 재리뷰 반영 (P1 1건) | ✅ | catch의 `updateStatus(FAILED)`가 던지면 `UnrecoverableError` 분기에 도달하지 못해 게시 이후 실패가 재시도된다(DB 장애면 `markCompleted`와 이 쓰기가 같이 실패하는 상관 케이스). 상태 기록을 try/catch로 감싸 재시도 판단이 DB 성공 여부에 의존하지 않게 했다. 회귀 테스트 1케이스 추가 |
| PR #25 Codex 3차 리뷰 반영 (P1 1건) | ✅ | `publishStarted`를 `publishResults()` 진입 시점에 세우면 그 안의 `updateStatus(PUBLISHING)` DB 실패까지 재시도 불가로 처리되어 리뷰가 유실된다. 상태 전이를 `process()`로 끌어올려 **Bitbucket 쓰기 직전**에만 플래그를 세운다 — 남은 구간은 파싱·포맷팅(순수 연산)뿐. 회귀 테스트 1케이스 추가 |
| PR #25 Codex 4차 리뷰 반영 (P1 1건) | ✅ | 백오프 중 새 커밋 리뷰가 `supersedeActivePrReviews`로 이 런을 `SUPERSEDED`로 바꿔도, 재시도가 `prepareWorkspace()`에서 `PREPARING`으로 되살리고 구버전 리뷰를 게시했다. 재시도(`attemptsMade > 0`)일 때만 `findById`로 상태를 확인해 `SUPERSEDED`/행 삭제면 작업 없이 종료. 회귀 테스트 2케이스 |
| codex CLI 독립 리뷰 반영 (P1 1건) | ✅ | 재시도 사전 조회(`findById`)가 `try` 밖에 있어, DB 장애로 조회 자체가 실패하면 마지막 시도에서도 FAILED 기록과 사용자 알림이 모두 생략되고 런이 `preparing`으로 영구 잔류한다. 가드를 `try` 안으로 이동해 기존 최종 실패 경로를 타게 했다. 회귀 테스트 1케이스 |
| PR #25 Codex 5차 리뷰 반영 (P2 1건) | ✅ | `GIT_CLONE_TIMEOUT_MS`가 `Joi.number()`라 음수·소수를 통과시키고, `execFile`이 git 실행 전에 `ERR_OUT_OF_RANGE`를 던져 모든 clone이 실패한다. `.integer().positive()`로 부팅 시 차단. 0(타임아웃 없음)도 불허 — 멈춘 clone이 워커 슬롯을 영구 점유한다. 회귀 테스트 4케이스 |
| PR #25 Codex 6차 리뷰 반영 (P2 2건) | ✅ | ① `QUEUE_RETRY_DELAY=-1`이 Joi를 통과하면 BullMQ가 계산된 백오프 `-1`을 "재시도 안 함" 신호로 읽어, 이 PR이 켠 재시도가 조용히 죽는다. 게다가 `process()`의 "시도가 남았으면 보류" 분기는 여전히 참이라 FAILED 기록·실패 코멘트가 생략되고 런이 `preparing`으로 잔류한다. `QUEUE_RETRY_ATTEMPTS`는 0·음수·소수도 통과. → attempts `.integer().positive()`, delay `.integer().min(0)` ② `GIT_CLONE_TIMEOUT_MS` 상한 없음 — 2^31-1 초과는 Node 타이머가 ~1ms로 접어 타임아웃이 되레 짧아진다. `.max(2_147_483_647)` 추가. 회귀 테스트 7케이스 |
| 미적용 (기존 스키마) | ⚠️ | `CODEX_TIMEOUT_MS`·`WORKSPACE_MAX_CONCURRENT`도 같은 laxity를 갖지만 손대지 않았다. `QUEUE_RETRY_*`는 이 PR이 BullMQ에 실제로 주입하기 시작해 잘못된 값이 곧 기능 상실이라 예외로 조였다(운영값 3/5000은 통과 확인) |
| 후속 과제 (이 PR 범위 밖) | ⚠️ | 코드로 확인한 뒤 이슈로 분리했다 — #26 supersede/idempotency 모델(실행 중 구버전 게시 + 사전조회 TOCTOU + 워커 SIGKILL 우회), #27 게시 후 상태 기록 실패 시 웹훅 재수신으로 중복 게시(`existsByIdempotencyKey`가 FAILED 행 삭제), #28 Bitbucket 첫 쓰기 429/503에도 남은 재시도 폐기(현재는 안전한 쪽 실패), #29 인라인 코멘트 부분 실패 삼킴, #30 재시도 시 중간 시도의 Codex 토큰·소요시간 통계 누락 |
| 미포함 | ⚠️ | `GIT_CLONE_TIMEOUT_MS`를 charts/docker-compose에는 추가하지 않음(기본값이 튜닝된 값이고 운영 env는 tools-infra가 관리). `REVIEW_DLQ_NAME`은 기존 미사용 상수로 손대지 않음 |

### Task 30: 리뷰 근거 범위 분리 + 검증 가능성 게이트
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 오탐 근본 원인 확인 | ✅ | inline-diff 분기가 `"diff만 근거로 사용해줘"`로 증거 수집을 봉쇄하면서 판정기준 6번은 "검증 불가 가정 금지"를 요구 — 검증 수단을 뺏고 검증을 요구하는 구조. branch-diff 분기는 파일 읽기를 허용해 같은 봇이 모드에 따라 증거 권한이 달랐음 |
| 봇 실행 능력 실측 | ✅ | read-only 샌드박스에서 셸 실행·파일 읽기 가능, 네트워크는 차단(`curl` → DNS 실패). worktree는 `git clone --bare` 전체 클론이라 `git log` 조회 가능 |
| 지적 범위/근거 범위 분리 | ✅ | `scopeInstruction`(지적은 diff 안) + `evidenceInstruction`(근거는 worktree 파일·git 이력)으로 분리. 파일 읽기는 "diff에 안 보이는 레포 전역 동작에 의존하는 지적"에 한해 조건부 |
| 검증 가능성 게이트 | ✅ | 판정기준 6번에 런타임 동작 주장의 확인 수단(`git log -- <경로>` / `git show`)을 명시하고, findings에 "확인 못 하면 blocking → suggestion 강등" 규칙 추가 |
| 회귀 테스트 | ✅ | `verifiability gate` 3케이스 추가. 수정 전 프롬프트에 대해 3건 모두 실패(RED) → 수정 후 통과(GREEN) 확인 |
| 빌드/린트/테스트 | ✅ | `pnpm build`, `pnpm lint`, `pnpm test --runInBand` 성공 (207 tests) |
| 커버리지 | ✅ | `pnpm test:cov --runInBand` statement 86.78%, `review.prompt.ts` 100% |
| 보안 체크리스트 | ✅ | 프롬프트 문구 변경만, 시크릿·신규 입력·에러 누출 없음 |
| 한계 | ⚠️ | 단위 테스트는 "지시문이 프롬프트에 들어갔는지"까지만 검증. 모델이 실제로 강등하는지는 오탐 4건 diff를 실환경에 태워야 확인 가능 |
| 운영 `trigger.mode` 확인 | ✅ | 멘션 없이 PR 생성만으로 봇이 동작한 관측으로 `auto` 계열 확정. 차트 기본값 `mention`과 다름. CI 게이트를 채택하지 않았으므로 이번 수정 내용에는 영향 없음 |
| Pull Request | ✅ | GitHub PR [#22](https://github.com/azyu/bitbucket-codex-code-review/pull/22) 생성, CI `lint-and-build` 성공 |
| PR 리뷰 피드백 반영 | ✅ | 머지 전례를 "그 자체가 반증"으로 넓게 쓰면 기존 패턴의 새 인스턴스에 대한 정상 지적까지 억제될 수 있어, 자동 검사 거부 주장에 한정하고 "코드가 옳다는 근거는 아니다"를 명시 |

### Task 29: Codex 실제 실패 메시지 노출
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 실패 원인 추출 | ✅ | `codex exec --json` stdout의 `error`와 `turn.failed` 이벤트에서 실제 오류 메시지 추출 |
| 사용자 오류 코멘트 전달 | ✅ | allowlist된 capacity 오류만 기존 실패 코멘트와 DB 오류 메시지 경로로 전달, 나머지는 워커 로그에만 기록 |
| 회귀 테스트 | ✅ | 두 JSON 오류 이벤트와 Bitbucket capacity 답글을 검증하고 미승인 구조화 오류의 비공개를 검증 |
| 빌드/린트/테스트 | ✅ | `pnpm build`, `pnpm lint`, `pnpm test --runInBand` 성공 (204 tests) |
| 커버리지 | ✅ | `pnpm test:cov --runInBand` 성공, statement coverage 86.77% |
| 보안 체크리스트 | ✅ | 구조화 오류는 capacity 문구만 allowlist, 그 외 메시지는 PR/DB에 노출하지 않음 |

### Task 28: GPT-5.6 모델 패밀리 전환
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 전환 설계/계획 승인 | ✅ | 기본 모델 `gpt-5.6-sol`, 런타임 버전 probe 없이 클린 전환하는 설계와 단계별 계획 확정 |
| Codex CLI 업그레이드 | ✅ | Docker runtime을 공식 최소 `0.144.0` 이상인 `@openai/codex@0.144.1`로 고정, npm 레지스트리 버전 확인 |
| 기본 모델 전환 | ✅ | 애플리케이션, `.env.example`, Compose, Helm, README 기본값을 `gpt-5.6-sol`로 일괄 변경 |
| Reasoning 검증 | ✅ | `none`/`low`/`medium`/`high`/`xhigh`/`max`만 허용하고 기본값 `medium` 유지 |
| 모델 전달 회귀 테스트 | ✅ | `gpt-5.6`, Sol, Terra, Luna가 정확한 `--model` argv와 `medium` 설정으로 전달되는 4케이스 추가 |
| 배포 설정 검증 | ✅ | 기본/Sol/Terra/Luna Helm 렌더링, `helm lint`, `docker compose config --quiet` 성공 |
| 독립 코드 리뷰 | ✅ | 호환성·보안 차단 finding 없음 |
| 빌드/린트/테스트 | ✅ | `pnpm build`, `pnpm lint`, `pnpm test --runInBand` 성공 (187 tests) |
| 커버리지 | ✅ | `pnpm test:cov --runInBand` 성공, statement coverage 85.92% |
| 보안 체크리스트 | ✅ | 하드코딩 시크릿 없음, reasoning 입력을 Joi enum으로 검증, 신규 에러 누출 없음 |
| Docker 이미지 검증 | ⚠️ | OrbStack Docker 소켓이 없어 이미지 빌드 및 컨테이너 내부 `codex --version` 확인은 실행하지 못함 |
| Pull Request | ✅ | GitHub PR [#17](https://github.com/azyu/bitbucket-codex-code-review/pull/17) 생성, CI `lint-and-build` 성공 |

### Task 27: GPT-5.6 모델 패밀리 호환성 검토
- **상태**: ✅ 검토 완료 (현재 운영 이미지 기준 미대응)

| 검토 항목 | 판정 | 근거 |
|-----------|------|------|
| 모델 ID 전달 경로 | ✅ | `CODEX_MODEL`은 임의 문자열로 수용되어 `codex exec --model`에 그대로 전달되고, Helm에서 `gpt-5.6-sol`/`terra`/`luna` 렌더링 확인 |
| 공식 Codex 최소 버전 | ❌ | OpenAI 공식 요구사항은 Codex CLI `0.144.0` 이상이나 Dockerfile은 `@openai/codex@0.124.0` 고정 |
| 기본 설정/배포 예시 | ⚠️ | 애플리케이션, `.env.example`, Compose, Helm, 문서의 기본 모델은 모두 `gpt-5.5` |
| Reasoning 호환성 | ⚠️ | 기본 `medium`은 세 변형에서 유효하지만 `CODEX_REASONING_EFFORT` 검증이 없고 CLI `0.124.0`은 GPT-5.6의 `max`를 정식 지원하지 않음 |
| 회귀 테스트 | ⚠️ | Codex 실행/설정 테스트는 통과하지만 GPT-5.6 세 모델 ID 전달 및 최소 CLI 버전을 직접 검증하는 테스트는 없음 |
| 집중 검증 | ✅ | 관련 Jest 27 tests 통과, Helm에서 세 모델 ID의 ConfigMap 전달 확인 |
| 전체 DoD | ✅ | `pnpm build`, `pnpm lint`, `pnpm test --runInBand` 175 tests, `pnpm test:cov --runInBand` statement 85.74% 통과 |

### Task 26: 대형 PR Codex 브랜치 리뷰 모드
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 운영 실패 원인 확인 | ✅ | PR #177 diff가 약 2.3MB로 Codex `turn/start` 입력 제한 1,048,576자를 초과 |
| 회귀 테스트 추가 | ✅ | 대형 diff에서는 Codex 프롬프트에 diff 본문을 포함하지 않고, 소형 diff는 기존 inline diff 유지 |
| 브랜치 리뷰 모드 추가 | ✅ | 900,000자 초과 diff는 현재 worktree에서 Codex가 `git diff`를 직접 조회하도록 프롬프트 전환 |
| PR 리뷰 피드백 반영 | ✅ | branch-diff 프롬프트의 `<merge-base>` placeholder를 실행 가능한 `merge_base=$(...)` 시퀀스로 교체 |
| 추가 PR 리뷰 피드백 반영 | ✅ | branch-diff 프롬프트의 base ref를 shell-quote해 `&`, `'` 포함 브랜치명에서도 실행 가능하게 수정 |
| custom prompt 크기 피드백 반영 | ✅ | inline diff와 custom prompt를 합친 최종 프롬프트 길이가 임계값을 넘으면 branch-diff 모드로 재전환 |
| 빌드/린트/테스트 통과 | ✅ | `pnpm build`, `pnpm lint`, `pnpm test --runInBand` 성공 (175 tests) |
| 커버리지 확인 | ✅ | `pnpm test:cov --runInBand` 성공, statement coverage 85.74% |

### Task 25: 리뷰 diff lockfile 제외
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 대형 PR 실패 원인 확인 | ✅ | PR #2721에서 `pnpm-lock.yaml` 포함 대형 diff가 Codex context window 초과를 유발 |
| 회귀 테스트 추가 | ✅ | `WorkspaceService.createReviewDiff`가 lockfile exclude pathspec을 `git diff`에 전달하는지 검증 |
| diff 생성 수정 | ✅ | 루트/하위 디렉터리의 `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lockb`를 리뷰 입력 diff에서 제외 |
| 리뷰 피드백 반영 | ✅ | `:(exclude,glob)**/<lockfile>` pathspec으로 중첩 lockfile 제외 보장 |
| 빌드/린트/테스트 통과 | ✅ | `pnpm lint`, `pnpm build`, `pnpm test --runInBand` 성공 |
| 커버리지 확인 | ✅ | `pnpm test:cov --runInBand` 성공, statement coverage 85.48% |

### Task 24: Codex shell snapshot 실패 수정
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 운영 실패 원인 확인 | ✅ | `codex-code-review` Pod에서 `CODEX_AUTH_JSON` 멀티라인 env 상속 시 Codex CLI shell snapshot이 `/bin/sh` quoting 오류를 내는 것을 재현 |
| Codex 실행 환경 정리 | ✅ | `CodexService`가 자식 프로세스에 `CODEX_AUTH_JSON`과 개행 포함 env를 전달하지 않도록 수정 |
| 회귀 테스트 추가 | ✅ | 멀티라인 인증 env가 Codex child process env에서 제거되는 케이스 추가 |
| 빌드/린트/테스트 통과 | ✅ | `pnpm lint`, `pnpm build`, `pnpm test --runInBand` 성공 |
| 커버리지 확인 | ✅ | `pnpm test:cov --runInBand` 성공, statement coverage 85.45% |

### Task 23: 테스트 커버리지 80% 이상 달성
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 커버리지 병목 확인 | ✅ | `webhook.controller.ts`, `workspace.service.ts`, `bitbucket.service.ts`, validation/module wiring 중심으로 미커버 영역 확인 |
| 컨트롤러/워크스페이스 테스트 추가 | ✅ | webhook 분기/검증/큐 등록 및 workspace git 경계/mock 테스트 추가 |
| Bitbucket/validation/DB wiring 테스트 추가 | ✅ | reply/inline/error API, Joi validation, AppModule import, DB helper, migration 테스트 추가 |
| 빌드/린트/테스트 통과 | ✅ | `pnpm build`, `pnpm lint`, `pnpm test --runInBand` 성공 |
| 커버리지 확인 | ✅ | `pnpm test:cov --runInBand` 성공, statement coverage 85.43% |

### Task 22: 대형 PR diff 리뷰 시 Codex spawn E2BIG 수정
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 운영 실패 원인 확인 | ✅ | PR #2602/#2608 등에서 긴 diff prompt가 argv 제한을 넘어 `spawn E2BIG` 발생 |
| Codex 입력 방식 수정 | ✅ | `codex exec -`를 사용하고 prompt를 stdin으로 전달해 argv 크기 제한 회피 |
| 회귀 테스트 추가 | ✅ | 대형 prompt가 spawn args에 포함되지 않고 stdin으로 전달되는 케이스 추가 |
| 빌드/린트/테스트 통과 | ✅ | `pnpm build`, `pnpm lint`, `pnpm test` 성공 |
| 커버리지 확인 | ⚠️ | `pnpm test:cov` 성공, 전체 statement coverage 62.15%로 DoD 80% 미달 |

### Task 21: PR 리뷰 diff 문맥 오염 방지
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| PR #2582 원인 확인 | ✅ | `bb`로 실제 PR diff는 `tools/swagger-hub/*` 5개 파일뿐이고, 잘못된 inline comment는 #2581의 timezone 변경 문맥임을 확인 |
| merge-base diff 생성 | ✅ | `WorkspaceService.createReviewDiff`가 `git merge-base refs/heads/<base> HEAD` 기준 diff를 생성 |
| Codex 입력 고정 | ✅ | 프롬프트에 워커가 생성한 PR diff를 포함하고 diff 밖 파일/라인을 findings에서 제외하도록 명시 |
| 게시 전 방어 필터 | ✅ | parsed findings 중 diff에 없는 path를 제거하고 summary table/verdict/inline posting에 필터된 결과만 사용 |
| 회귀 테스트 추가 | ✅ | diff 밖 `libs/base/src/constants/timezone.ts` finding이 inline comment로 게시되지 않는 케이스 추가 |
| 빌드/린트/테스트 통과 | ✅ | `pnpm build`, `pnpm lint`, `pnpm test` 성공 |
| 커버리지 확인 | ⚠️ | `pnpm test:cov` 성공, 전체 statement coverage 62.12%로 DoD 80% 미달 |

### Task 20: 대시보드 "최근 리뷰 10건" 섹션 추가 (Stage 1)
- **상태**: ✅ 완료
- **참고**: 후속 보안/단계2 항목은 `.context/BACKLOG.md` 참조

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| `IRecentReview` + `listRecent` 추가 | ✅ | reviewOutput 제외 whitelist 매핑, limit 1~50 clamp |
| `sanitizeErrorMessage` 헬퍼 | ✅ | 절대경로/UUID/git sha/이메일 마스킹 |
| `GET /api/internal/reviews/recent` | ✅ | `:id` 라우트 앞에 배치 (NestJS 매칭 순서) |
| 대시보드 UI (Alpine.js + Tailwind) | ✅ | `<tbody>` 패턴 + lazy fetch 토글, `x-text`만 사용 |
| 단위 테스트 추가 | ✅ | listRecent 6케이스 + sanitize 7케이스 + controller 3케이스 (137 tests total) |
| 빌드/린트/테스트 통과 | ✅ | `pnpm build`, `pnpm lint`, `pnpm test` 성공 |
| XSS grep 검증 | ✅ | `x-html`/`innerHTML`/`v-html` 0건 |

### Task 19: 기본 리뷰 모델 gpt-5.5 전환
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 기본 설정 업데이트 | ✅ | `DEFAULTS.CODEX_MODEL`을 `gpt-5.5`로 변경 |
| 실행/배포 기본값 업데이트 | ✅ | `.env.example`, `docker-compose.yml`, Helm values 기본 모델을 `gpt-5.5`로 변경 |
| 문서 업데이트 | ✅ | README와 chart README의 기본 모델 표기를 `gpt-5.5`로 변경 |
| 빌드/린트/테스트 통과 | ✅ | `pnpm build`, `pnpm lint`, `pnpm test` 성공 |
| 커버리지 확인 | ⚠️ | `pnpm test:cov` 성공, 전체 statement coverage 59.89%로 DoD 80% 미달 |
| Docker 이미지 빌드 확인 | ✅ | `docker build -t code-review-worker:gpt-5.5-default .` 성공 |
| 커밋 | ✅ | conventional commit 완료 |

### Task 18: Codex CLI 0.124.0 업데이트
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 최신 버전 확인 | ✅ | `@openai/codex` 최신 버전 `0.124.0` 확인 |
| Dockerfile 업데이트 | ✅ | runtime 이미지의 전역 Codex CLI 설치 버전을 `0.124.0`으로 변경 |
| 빌드/린트/테스트 통과 | ✅ | `pnpm build`, `pnpm lint`, `pnpm test` 성공 |
| 커버리지 확인 | ⚠️ | `pnpm test:cov` 성공, 전체 statement coverage 59.89%로 DoD 80% 미달 |
| Docker 이미지 빌드 확인 | ✅ | `docker build -t code-review-worker:codex-0.124.0 .` 성공, 컨테이너 내부 `codex-cli 0.124.0` 확인 |
| 커밋 | ✅ | conventional commit 완료 |

### Task 17: 내장 대시보드 Bootstrap 전환
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| Bootstrap 5 CDN 적용 | ✅ | `/dashboard` HTML을 Bootstrap 5.3.8 기반으로 전환 |
| 한국어 문구 유지 | ✅ | 제목, 상태 문구, 카드/테이블 라벨을 한국어로 유지 |
| 다크 모드 유지 | ✅ | `data-bs-theme="auto"`와 Bootstrap 변수 기반 배경/상태 스타일 적용 |
| 실제 다크 모드 전환 추가 | ✅ | 시스템 테마 감지 + `자동/라이트/다크` 토글 + localStorage 저장 |
| 좌측 사이드바 추가 | ✅ | 데스크톱 고정 sidebar와 모바일 접이식 메뉴 추가 |
| 아이콘형 테마 토글 전환 | ✅ | 텍스트 버튼 대신 아이콘 버튼 + aria-label 적용 |
| 운영 콘솔형 레이아웃 정리 | ✅ | shadcn project-management 계열의 정보 위계를 참고해 상단 유틸리티/분석 패널/테이블 구조로 재구성 |
| Alpine.js 전환 | ✅ | sidebar/theme/data fetch/리스트 렌더링을 Alpine 상태 기반으로 이전 |
| UI 리뷰 반영 | ✅ | 불필요한 메모 섹션 제거, 상단 보조 탐색 제거로 개행/중복 내비게이션 정리 |
| 카드/테이블 마크업 정리 | ✅ | 요약 카드와 저장소 테이블을 Bootstrap 카드/테이블 클래스로 재구성 |
| 테스트 갱신 | ✅ | `app.controller.spec.ts` 기대값을 Bootstrap 마크업에 맞게 업데이트 |
| 빌드/린트/테스트 통과 | ✅ | `pnpm build`, `pnpm lint`, `pnpm test` 성공 |

### Task 15: 리뷰 사용량 통계 + 내부 대시보드 API 준비
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| Codex usage 파싱 추가 | ✅ | `codex exec --json`의 `turn.completed.usage`에서 input/cached/output 토큰 추출 |
| ReviewRun 메트릭 컬럼 확장 | ✅ | `totalDurationMs`, `inputTokens`, `cachedInputTokens`, `outputTokens` 추가 |
| 실패/성공 메트릭 저장 | ✅ | 완료/실패 리뷰 모두 가능한 범위의 시간/토큰 저장 |
| 내부 stats API 추가 | ✅ | `/api/internal/stats/repos`, `/api/internal/stats/repos/:repoSlug` 추가 |
| migration/data-source 추가 | ✅ | TypeORM data source + 메트릭 컬럼 migration 추가 |
| 테스트 추가 | ✅ | parser, review service, internal controller, processor 메트릭 저장 검증 |
| 빌드/린트/테스트 통과 | ✅ | `pnpm build`, `pnpm lint`, `pnpm test` 성공 |
| 커버리지 확인 | ⚠️ | `pnpm test:cov` 전체 52.92%로 DoD 80% 미달 (프로젝트 전체 기준) |

### Task 16: 간단한 내장 대시보드 추가
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| `/dashboard` HTML 추가 | ✅ | NestJS가 정적 HTML 문서를 직접 반환 |
| `/dashboard.js` 스크립트 추가 | ✅ | same-origin `/api/internal/stats/repos` fetch 후 카드/테이블 렌더링 |
| global prefix 제외 처리 | ✅ | `/dashboard`, `/dashboard.js`는 `/api` prefix 없이 노출 |
| 샘플 데이터 시드 파일 추가 | ✅ | `scripts/seed-review-stats.sql`로 로컬 demo 데이터 주입 가능 |
| 로컬 컨테이너 검증 | ✅ | docker rebuild 후 `/dashboard`와 stats API 응답 확인 |
| 빌드/린트/테스트 통과 | ✅ | `pnpm build`, `pnpm lint`, `pnpm test` 성공 |

### Task 14: Per-Repository Webhook Secret 지원
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| configuration.ts 수정 | ✅ | `BITBUCKET_REPO_WEBHOOK_SECRETS` → `bitbucket.repoWebhookSecrets` |
| validation.ts 수정 | ✅ | Joi 스키마 + JSON 형식 검증 |
| webhook.guard.ts 수정 | ✅ | `repoWebhookSecrets[slug]` → `webhookSecret` fallback |
| 테스트 추가 | ✅ | per-repo secret 5케이스 추가 (87 tests total) |
| 빌드/린트/테스트 통과 | ✅ | 전부 통과 |

### Task 13: Per-Repository Bitbucket Token 지원
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| configuration.ts 수정 | ✅ | `BITBUCKET_REPO_TOKENS` JSON 파싱 → `bitbucket.repoTokens` |
| validation.ts 수정 | ✅ | Joi 스키마에 `BITBUCKET_REPO_TOKENS` 추가 |
| BitbucketService 수정 | ✅ | 생성자 고정 authHeader → `resolveAuthHeader(repoSlug)` 런타임 lookup |
| WorkspaceService 수정 | ✅ | `buildGitAuthEnv(repoSlug)` 파라미터 추가, repo별 토큰 우선 사용 |
| 빌드/린트/테스트 통과 | ✅ | 69 tests passed |

### Task 12: Docker runtime curl 추가
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| Dockerfile 런타임 패키지 업데이트 | ✅ | `apk add`에 `curl` 추가 |
| 검증 실행 | ✅ | `pnpm build`, `pnpm lint`, `pnpm test` 성공 |
| Docker 이미지 빌드 확인 | ⚠️ | Docker daemon 미실행으로 `docker build` 확인 불가 |
| 커밋 | ✅ | conventional commit 완료 |

### Task 11: Codex 인증 간소화
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| OPENAI_API_KEY 환경변수 지원 | ✅ | docker-compose.yml에 env passthrough 추가 |
| codex_auth 볼륨 제거 | ✅ | named volume → 선택적 bind mount 코멘트로 교체 |
| OPENAI_BASE_URL 지원 확인 | ✅ | config.toml의 openai_base_url 키로 설정 (env var 아님) |

### Task 10: 리뷰 프롬프트 Codex upstream 강화
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 코멘트 가이드 확장 | ✅ | AI 톤, 심각도 과장 금지, 조건부 심각도 전달 |
| 발견 건수 가이드 추가 | ✅ | 전수 탐색, 억지 발견 금지, 첫 발견에서 멈추지 않기 |
| line_range 최소화 가이드 | ✅ | 5-10줄 이내 최소 범위 선택 |

### Task 9: severity 단일 축 체계 + 커스텀 프롬프트 지원
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| P0-P3 priority 축 제거 | ✅ | severity만 남김 (blocking/recommended/suggestion/tech-debt) |
| 커스텀 프롬프트 파일 지원 | ✅ | REVIEW_CUSTOM_PROMPT_FILEPATH env → 기본 프롬프트에 append |
| resolveReviewPrompt 함수 | ✅ | 파일 있으면 append, 없으면 기본값, 실패 시 throw |
| ConfigService 주입 | ✅ | review.processor.ts에서 config 기반 filepath 조회 |
| 테스트 업데이트 | ✅ | 69 tests passed |

### Task 8: ESLint 설정 복구
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| lint 실패 원인 분석 | ✅ | `eslint` 바이너리와 설정 파일이 누락된 상태로 확인 |
| 최소 devDependency 복구 | ✅ | `eslint`, `typescript-eslint`, `globals` 추가 |
| flat config 적용 | ✅ | `eslint.config.mjs` 기준으로 Node/Jest globals 설정 |
| `pnpm lint` 성공 | ✅ | `eslint "{src,test}/**/*.ts" --fix` exit 0 |
| `pnpm test` 성공 | ✅ | 68 tests passed |
| `pnpm build` 성공 | ✅ | `nest build` exit 0 |

### Task 7: Bitbucket 리뷰 요약 Markdown 정규화
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| summary Markdown 렌더링 원인 분석 | ✅ | Bitbucket payload 대신 summary 문자열 shape 문제로 확인 |
| summary 정규화 로직 추가 | ✅ | `1)` 섹션/inline `-` 목록을 `###` + `-` bullet 형식으로 변환 |
| review 프롬프트 수정 | ✅ | Bitbucket 호환 Markdown 섹션 형식을 명시적으로 유도 |
| 회귀 테스트 추가 | ✅ | formatter + processor에서 summary 정규화 검증 |
| ESLint 설정/의존성 추가 | ✅ | `eslint.config.mjs` 추가 및 lint 실행 가능 상태로 복구 |
| `pnpm test` 성공 | ✅ | 68 tests passed |
| `pnpm build` 성공 | ✅ | `nest build` exit 0 |
| `pnpm test:cov` 확인 | ✅ | 전체 커버리지 43.41%로 DoD 80% 미달(기존 상태) |
| `pnpm lint` 성공 | ✅ | ESLint 설치 및 flat config 추가 후 exit 0 |

## 완료된 작업

### Task 6: 리뷰 프롬프트 하이브리드 업그레이드
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| review.prompt.ts 신규 | ✅ | Codex 기반 버그 판정 8조, 코멘트 가이드, P0-P3 우선순위 |
| review.types.ts 확장 | ✅ | title, priority, ILineRange, lineRange 추가 |
| review.formatter.ts 파서 업데이트 | ✅ | line_range→lineRange 매핑, line 하위호환, title/priority 파싱 |
| review.formatter.ts 포매터 업데이트 | ✅ | title 헤더, priority 태그, 라인 범위 표시 |
| review.processor.ts 프롬프트 분리 | ✅ | 인라인 → buildReviewPrompt() import |
| review.processor.ts lineRange 사용 | ✅ | item.line → item.lineRange.end |
| 테스트 업데이트 | ✅ | 65 tests passed (하위호환, 새 필드 등) |
| pnpm build 성공 | ✅ | nest build exit 0 |

### Task 5: PR 오픈 시 자동 리뷰/서머리 트리거
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| IBitbucketWebhookBase 추출 + IBitbucketPrWebhook 추가 | ✅ | webhook.interfaces.ts 리팩터 |
| triggerCommentId optional 처리 | ✅ | queue + review 인터페이스 |
| shouldAutoReview / shouldMentionReview | ✅ | trigger.service.ts 확장 |
| WebhookController 이벤트 라우팅 | ✅ | handleCommentEvent + handlePrEvent + enqueueReview 추출 |
| ReviewProcessor auto 에러 댓글 | ✅ | triggerCommentId 없을 때 createComment fallback |
| TriggerService 테스트 | ✅ | shouldAutoReview 8케이스 + shouldMentionReview 3케이스 |
| ReviewProcessor 에러 핸들링 테스트 | ✅ | auto/mention 분기 테스트 |
| pnpm build + test | ✅ | 55 tests passed |

### Task 1: 구조화된 리뷰 출력 포맷
- **파일**: `src/queue/review.types.ts`, `src/queue/review.formatter.ts`, `src/queue/review.processor.ts`
- **상태**: ✅ 완료

### Task 2: 리뷰 요약 테이블
- **파일**: `src/queue/review.formatter.ts`, `src/queue/review.processor.ts`
- **상태**: ✅ 완료

### Task 3: 리뷰 파이프라인 단일 Codex 호출 통합
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| IUnifiedReviewResult + verdict 상수 | ✅ | review.types.ts에 타입/상수 추가 |
| parseReviewItems 추출 | ✅ | review.formatter.ts DRY 리팩터 |
| parseUnifiedReviewJson | ✅ | 통합 JSON 파서 추가 |
| buildVerdictBadge | ✅ | verdict 뱃지 포매터 추가 |
| executeReview 단일 호출 | ✅ | 2개 Codex 프로세스 → 1개로 통합 |
| publishResults 리팩터 | ✅ | unified/fallback 분기 처리 |
| postInlineComments 추출 | ✅ | inline loop → 별도 메서드 |
| markCompleted 단순화 | ✅ | 단일 result 처리 |
| 테스트 업데이트 | ✅ | 신규 파서/포매터 단위 테스트 추가 (41 tests) |

### 빌드 검증 + 커밋
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| pnpm build 성공 | ✅ | nest build exit 0 |
| pnpm test 통과 | ✅ | 41 tests passed |
| git commit | ✅ | 완료 |

### Task 4: Helm Chart
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| Chart.yaml + values.yaml + .helmignore | ✅ | Phase 1 scaffold |
| _helpers.tpl (4개 secret name 헬퍼) | ✅ | fullname, labels, secret helpers |
| configmap.yaml | ✅ | 비민감 env vars 전체 |
| secret.yaml (3그룹 조건부) | ✅ | db/redis/bitbucket existingSecret 패턴 |
| deployment.yaml | ✅ | container+init+volumes+probes |
| service.yaml (ClusterIP 듀얼포트) | ✅ | http:3000, metrics:9463 |
| ingress.yaml | ✅ | 선택적, /api/webhooks |
| pvc.yaml | ✅ | persistence.workspaces.enabled 조건 |
| hpa.yaml | ✅ | autoscaling.enabled 조건 |
| servicemonitor.yaml | ✅ | Prometheus Operator |
| networkpolicy.yaml | ✅ | ingress/egress 제한 |
| NOTES.txt | ✅ | 설치 후 안내 |
| helm lint 통과 | ✅ | 0 chart(s) failed |
| helm template 렌더링 | ✅ | 정상 출력 확인 |
| pnpm build + test | ✅ | 42 tests passed |

### repo별 커스텀 리뷰 프롬프트 매핑
- **상태**: ✅ 완료

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| REVIEW_REPO_CUSTOM_PROMPT_FILEPATHS 설정 추가 | ✅ | configuration.ts, parseJsonRecord 재사용 (slug→filepath JSON 맵) |
| executeReview repo별 프롬프트 해석 | ✅ | repoMap[slug] → REVIEW_CUSTOM_PROMPT_FILEPATH fallback |
| 테스트 (TDD RED→GREEN) | ✅ | 맵 매칭/전역 fallback/파일 누락 reject 3케이스, 190 tests passed |
| 문서 업데이트 | ✅ | README.md env 테이블, .env.example |
| pnpm build + lint + test:cov | ✅ | 커버리지 85.93% (기준 80%) |
| PR #18 Codex 리뷰 반영 | ✅ | validation.ts에 jsonObjectValidator 추가 (부팅 시 fail-fast), 192 tests passed |

### lock 파일 제외로 인한 리뷰 오탐 제거
- **상태**: ✅ 완료
- **배경**: lxp_services `171df0940` 리뷰에서 "pnpm-lock.yaml 갱신 없음" blocking 오탐 발생. 실제로는 3535줄 변경됨. `REVIEW_DIFF_EXCLUDED_PATHS`가 lock 파일을 diff에서 제거하는데, 프롬프트가 그 사실을 모델에게 알려주지 않아 "diff에 없음 = 변경 없음"으로 오독됨.

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| createReviewDiff가 IReviewDiff 반환 | ✅ | diff + excludedChangedFiles (`git diff --name-status`, exclude pathspec을 positive로 반전) |
| 제외 목록 조회 실패 시 degrade | ✅ | warn 로그 후 빈 배열, 리뷰는 계속 진행 |
| 프롬프트에 "diff에서 제외된 변경 파일" 섹션 | ✅ | inline-diff/branch-diff 두 모드 공통, 목록 없으면 "변경된 파일 없음"으로 명시해 진짜 lock 미갱신은 계속 지적 가능 |
| 테스트 | ✅ | workspace 3케이스 + 프롬프트 4케이스 + process() 배선 1케이스, 199 tests passed |
| pnpm build + lint + test:cov | ✅ | 커버리지 86.7% (기준 80%) |
| 실물 검증 | ✅ | `171df0940`에 positive pathspec 실행 → `M pnpm-lock.yaml` 출력 확인 |
| PR #19 Codex 리뷰 반영 (P2 2건) | ✅ | ① 조회 실패를 `null`(알 수 없음)로 구분해 "변경 없음" 단정 제거 ② 상태값(M/A/D/R) 설명 추가로 lock 삭제·이름 변경은 계속 지적 가능, 201 tests passed |

### 컨테이너 재시작이 남긴 고아 worktree 등록으로 리뷰 영구 실패
- **상태**: ✅ 완료
- **배경**: `godot-env` PR #5 리뷰가 3회 재시도 전부 `fatal: '...' is a missing but already registered worktree`로 실패. 07:49에 worktree를 만든 리뷰가 07:52:38 컨테이너 재생성(설정 반영 배포)으로 죽어 `cleanupWorktree`를 못 탔고, workspace가 bind mount라 디렉터리·등록이 둘 다 디스크에 남았다. 재시도의 `createWorktree`가 **디렉터리만** `rm -rf`하고 `worktree add`를 부르면서 살아남은 등록에 막혔다. 재시도로는 절대 안 풀려서, 사람이 인스턴스에 들어가 `git worktree prune`을 하기 전까지 그 repo의 그 커밋은 영구히 리뷰 불가였다.

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 로컬 재현 | ✅ | bare repo에 worktree add → 디렉터리만 삭제 → 재 add에서 프로덕션과 동일 fatal 재현 |
| `createWorktree`에 `worktree prune` 추가 | ✅ | `rm -rf` 다음, `add` 직전. `add -f`는 등록을 덮어쓸 뿐 다른 고아를 남겨 prune을 택함 |
| prune이 살아있는 worktree를 안 건드리는지 실측 | ✅ | worktree 2개 등록 상태에서 prune → 둘 다 잔존. 디렉터리가 사라진 등록만 지운다 |
| 테스트 (TDD RED→GREEN) | ✅ | 실제 git으로 도는 회귀 1케이스(mock 걷어냄) + 기존 호출 순서 검증 갱신, 230 tests passed |
| `pnpm build` + `lint` + `test:cov` | ✅ | 커버리지 86.91% (기준 80%) |
| 프로덕션 응급 조치 | ✅ | `godot-env.git`에 `worktree prune` 수동 실행, 전 repo 15개 `prunable=0` 확인 |

- **남긴 것**: `cleanupWorktree`의 `rm -rf` 폴백도 등록을 남기지만, 다음 리뷰의 prune이 흡수하므로 별도 수정하지 않았다. 리뷰 사이에 남은 고아 등록은 무해하다.
