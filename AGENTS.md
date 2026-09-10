# AGENTS.md

## 작업 규칙

- 작업 시작 전 `.context/STEERING.md`를 읽을 것
- GitHub Issues의 open + `backlog` 라벨을 유일한 작업 큐로 사용할 것
- 지정된 이슈는 `gh issue view <번호> --comments`로 읽고, 지정이 없으면 `gh issue list --state open --label backlog`에서 선택할 것
- **작업이 정상적으로 끝나면 커밋 승인을 요청할 것** (빌드 성공 확인 후). 승인 없이 커밋하지 않는다

## Task Coordination (GitHub Issues)

작업 시작 전 이슈를 선점한다.

1. `gh issue edit <번호> --add-label in-progress --add-assignee @me`
2. `Claimed by <agent-name>: <한 줄 계획>` 형식으로 댓글을 남긴다.
3. 댓글을 다시 읽는다. 가장 이른 활성 claim이 소유권을 갖는다. 더 늦은 claim이면 철회 댓글을 남기고 다른 이슈로 이동한다.

완료 시 검증 결과를 댓글로 남기고 상태를 전환한다.

- 직접 반영: `in-progress` 제거 후 이슈 종료
- PR 작업: `in-progress` 제거, `awaiting-review` 추가, 이슈는 merge까지 open 유지
- 보류: `in-progress`와 assignee 제거 후 `needs-decision` 또는 `blocked` 추가

PR 본문에는 `Closes #<번호>`를 넣는다. 후속 작업은 별도 이슈로 만들고 양쪽을 링크한다.

## Definition of Done (DoD)

태스크 완료 판정 기준:

- [ ] `pnpm build` 성공
- [ ] `pnpm lint` 경고/에러 없음
- [ ] `pnpm test` 전체 통과
- [ ] 테스트 커버리지 80% 이상
- [ ] 보안 체크리스트 통과 (하드코딩 시크릿, 입력 검증, 에러 누출 없음)
- [ ] GitHub Issue에 검증 결과와 상태 업데이트 완료
- [ ] 커밋 승인 요청 → 승인 후 커밋 완료 (conventional commit 형식)

## 의존성 업데이트 (Renovate)

Renovate PR의 CI green은 타입 호환성만 증명한다. 테스트가 실제 Redis/MySQL을 띄우지 않으므로 런타임 동작 변경은 통과한다. major 범프는 릴리스 노트의 BREAKING 항목을 코드에 직접 대조할 것.

peer dependency가 optional로 강등되는 변경은 lockfile이 이전 트리의 잔재를 유지해 정상으로 보인다. `package.json`만 빈 디렉터리에 복사해 `pnpm install --lockfile-only`로 재해석하고 패키지가 살아남는지 확인할 것 (bullmq v6 → ioredis 유실, PR #90).

## 프로젝트 개요

Bitbucket PR webhook → Codex CLI 코드 리뷰 → PR 코멘트 게시하는 NestJS 워커 서비스.

## 아키텍처

```
Webhook(Bitbucket) → TriggerService → BullMQ Queue → ReviewProcessor
  → WorkspaceService (git worktree)
  → CodexService (codex exec CLI)
  → BitbucketService (PR 코멘트 게시)
```

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `src/queue/review.processor.ts` | 리뷰 파이프라인 핵심 로직 (프롬프트, 파싱, 게시) |
| `src/codex/codex.service.ts` | Codex CLI 실행 래퍼 |
| `src/bitbucket/bitbucket.service.ts` | Bitbucket REST API (댓글/인라인) |
| `src/workspace/workspace.service.ts` | git bare repo + worktree 관리 |
| `src/webhook/webhook.controller.ts` | 웹훅 진입점 + 큐 등록 |
| `src/review/review.service.ts` | DB 상태 관리 (idempotency, supersede) |
| `src/config/configuration.ts` | 환경 변수 기반 설정 |

## 빌드/테스트 명령어

```bash
pnpm build          # nest build
pnpm test           # jest
pnpm lint           # eslint
```
