# TASKS.md

> 마지막 업데이트: 2026-03-09

## 완료된 작업

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
- **상태**: 🔄 진행 중

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| pnpm build 성공 | ✅ | nest build exit 0 |
| pnpm test 통과 | ✅ | 41 tests passed |
| git commit | 🔄 | 커밋 대기 |
