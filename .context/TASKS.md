# TASKS.md

> 마지막 업데이트: 2026-02-20

## 현재 진행 중인 작업

### Task 1: 구조화된 리뷰 출력 포맷
- **파일**: `src/queue/review.processor.ts`
- **상태**: 🔲 대기

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 1-1. IReviewItem 인터페이스 확장 | 🔲 | severity 4단계 + description/problemCode/suggestedFix/reason 필드 |
| 1-2. SEVERITY_EMOJI 맵 업데이트 | 🔲 | blocking/recommended/suggestion/tech-debt |
| 1-3. reviewPrompt 업데이트 | 🔲 | 새 JSON 스키마에 맞춘 프롬프트 |
| 1-4. parseReviewJson 업데이트 | 🔲 | 새 필드 검증 로직 |
| 1-5. 인라인 코멘트 포맷팅 | 🔲 | 구조화된 마크다운 출력 |

### Task 2: 리뷰 요약 테이블
- **파일**: `src/queue/review.processor.ts`
- **상태**: 🔲 대기

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| 2-1. 집계 헬퍼 메서드 | 🔲 | severity별 건수 집계 |
| 2-2. 요약 테이블 생성 | 🔲 | 마크다운 테이블 문자열 생성 |
| 2-3. summary 코멘트에 삽입 | 🔲 | 요약 코멘트 하단에 테이블 추가 |

### 빌드 검증 + 커밋
- **상태**: 🔲 대기

| 서브태스크 | 상태 | 설명 |
|-----------|------|------|
| pnpm build 성공 | 🔲 | nest build exit 0 |
| lsp_diagnostics 클린 | 🔲 | review.processor.ts 에러 없음 |
| git commit | 🔲 | 빌드 성공 후 커밋 |
