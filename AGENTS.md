# AGENTS.md

## 작업 규칙

- 작업 시작 전 반드시 `.context/PLAN.md`와 `.context/TASKS.md`를 읽고 현재 상태를 파악할 것
- 작업 완료 후 `.context/TASKS.md`의 해당 태스크 상태를 업데이트할 것
- **정상적으로 작업이 끝나면 커밋할 것** (빌드 성공 확인 후)

## Definition of Done (DoD)

태스크 완료 판정 기준:

- [ ] `pnpm build` 성공
- [ ] `pnpm lint` 경고/에러 없음
- [ ] `pnpm test` 전체 통과
- [ ] 테스트 커버리지 80% 이상
- [ ] 보안 체크리스트 통과 (하드코딩 시크릿, 입력 검증, 에러 누출 없음)
- [ ] `.context/TASKS.md` 상태 업데이트 완료
- [ ] 커밋 완료 (conventional commit 형식)

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
pnpm test           # jest (테스트 파일 아직 없음)
pnpm lint           # eslint
```
