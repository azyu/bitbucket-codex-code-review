# TASKS.md

> 마지막 업데이트: 2026-04-08

## 진행 중/최근 작업

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
