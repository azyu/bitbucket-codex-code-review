# TASKS.md

> 마지막 업데이트: 2026-07-10

## 진행 중/최근 작업

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
