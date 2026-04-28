# BACKLOG.md

> 마지막 업데이트: 2026-04-28
>
> 별도 PR로 분리된 후속 작업 큐. 우선순위 순.

## 보안

### [security] codex-code-review ingress: `/api/internal` 외부 노출 차단
- **출처**: Task 20 (Stage 1) 작업 중 Codex 리뷰가 식별한 ingress 노출 이슈
- **현황**: LXP repo `deploy/k8s/eks/lxp-tools/codex-code-review/ingress-external.yaml`이 `path: /` prefix 매칭이라 외부 ALB(`codex-code-review.dev.kitkit.us`)에서 `/api/internal/*` 전체 도달 가능
- **결정 필요**:
  - (A) ingress-external에 `/api/internal` deny 룰 추가
  - (B) internal API를 ingress-internal(VPN 한정)로 분리
  - 임시 가드: application-level header 토큰 검증
- **주의**: 이번 Stage 1 PR은 list 응답에서 `reviewOutput`을 의도적으로 제외했지만, 현재 ingress 상태에서는 토큰/PR 메타데이터·sanitize된 errorMessage 등이 여전히 외부에 도달 가능

## Stage 2 (대시보드 확장)

### [stage 2] dashboard에 model / reasoningEffort / raw input prompt 노출
- **출처**: Task 20 (Stage 1) plan
- **선결**: 위 ingress 차단 또는 application-level guard 도입 후 진행 권장 (raw prompt는 민감도 높음)
- **포함 작업**:
  - `ReviewRunEntity`에 `model`, `reasoningEffort`, `inputPrompt` 컬럼 추가 + migration
  - `IRecentReview`/detail 응답 shape 확장
  - 대시보드에 모델/추론설정 컬럼 + 토글된 reviewOutput 옆 prompt 펼치기

### [stage 2] `/api/internal/reviews/:id` 호출 rate limit
- **출처**: Task 20 (Stage 1) plan
- **현황**: 토글 UX가 클릭마다 detail endpoint를 fetch하므로, 외부에서 ID 순회 시 reviewOutput까지 전부 빨아낼 수 있음
- **포함 작업**:
  - throttler 모듈 도입 또는 ingress-level rate limit
  - 클라이언트 캐시 정책 정리 (이미 단일 row 캐시는 적용됨)
