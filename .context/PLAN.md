# PLAN.md

## 목표

LINE NEXT 테크블로그의 AI 코드 리뷰 플랫폼 접근법에서 가치 높은 2가지를 도입:
1. **구조화된 리뷰 출력 포맷** — 리뷰 항목을 문제설명/문제코드/수정제안/이유로 분리
2. **리뷰 요약 테이블** — severity별 건수 집계 테이블을 요약 코멘트에 삽입

## 변경 범위

모든 변경은 `src/queue/review.processor.ts` 단일 파일에 집중됨.

---

## Task 1: 구조화된 리뷰 출력 포맷

### 변경 사항

#### 1-1. `IReviewItem` 인터페이스 확장 (L12-17)

```typescript
// AS-IS
interface IReviewItem {
  path: string;
  line: number;
  severity: string;
  comment: string;
}

// TO-BE
interface IReviewItem {
  path: string;
  line: number;
  severity: "blocking" | "recommended" | "suggestion" | "tech-debt";
  description: string;      // 문제 설명
  problemCode?: string;      // 문제 코드 인용
  suggestedFix?: string;     // 수정 제안 코드
  reason: string;            // 왜 이게 문제인지
}
```

#### 1-2. `SEVERITY_EMOJI` 맵 업데이트 (L19-25)

```typescript
// AS-IS: bug, security, performance, structure, suggestion
// TO-BE: LINE 스타일 4단계
const SEVERITY_EMOJI: Record<string, string> = {
  blocking: "🚫",
  recommended: "⚠️",
  suggestion: "💡",
  "tech-debt": "📝",
};
```

#### 1-3. `reviewPrompt` 업데이트 (L78-100)

- 새 JSON 스키마에 맞춰 프롬프트 수정
- 5개 카테고리(bug/security/performance/structure/suggestion) → 4단계 severity로 전환
- 각 항목에 description, problemCode, suggestedFix, reason 필드 요구

#### 1-4. `parseReviewJson` 업데이트 (L270-291)

- 새 필수 필드 검증: `path`, `line`, `description`, `reason`
- 선택 필드: `problemCode`, `suggestedFix`
- `severity` 기본값: 유효하지 않은 값이면 `"suggestion"`으로 폴백

#### 1-5. 인라인 코멘트 포맷팅 업데이트 (L144-160)

```markdown
🚫 **Blocking**

**문제**: {description}

**문제 코드**:
```
{problemCode}
```

**수정 제안**:
```
{suggestedFix}
```

**이유**: {reason}
```

---

## Task 2: 리뷰 요약 테이블

### 변경 사항

#### 2-1. 집계 함수 추가

`inlineItems` 파싱 후 severity별 건수를 집계하는 헬퍼 메서드.

#### 2-2. 요약 코멘트에 테이블 삽입

현재 summary 코멘트 본문(`📋 변경사항 요약`) 하단에 리뷰 결과 요약 테이블 추가:

```markdown
## 📊 리뷰 결과 요약

| 분류 | 건수 |
|------|------|
| 🚫 Blocking Issues | N건 |
| ⚠️ Recommended Changes | N건 |
| 💡 Suggestions | N건 |
| 📝 Tech Debt | N건 |
```

이 테이블은 AI 출력이 아닌 **파싱된 데이터에서 코드로 생성** (안정적).

#### 2-3. 게시 순서 조정

현재: summary와 review를 병렬 실행 → 각각 게시
변경: 두 결과 모두 완료된 후 summary 코멘트에 요약 테이블을 합쳐서 게시.
(코드 흐름상 이미 `Promise.all` 이후이므로 순서 변경 불필요, 포맷팅만 추가)

---

## 변경하지 않는 것

- `codex.service.ts` — 변경 없음
- `bitbucket.service.ts` — 변경 없음 (인라인 코멘트 API 그대로 사용)
- `workspace.service.ts` — 변경 없음
- `webhook.controller.ts` — 변경 없음
- DB 스키마 — 변경 없음 (`reviewOutput`은 text 타입이라 새 포맷도 수용)
