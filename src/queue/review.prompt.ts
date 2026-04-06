/** 리뷰 프롬프트 템플릿 — Codex review_prompt.md 기반 하이브리드 */

import { readFile } from "fs/promises";

/**
 * 기본 프롬프트를 빌드한 뒤, customPromptFilepath가 있으면
 * 해당 파일 내용을 추가 지시사항으로 append.
 */
export async function resolveReviewPrompt(
  baseBranch: string,
  customPromptFilepath: string,
): Promise<string> {
  const base = buildReviewPrompt(baseBranch);

  if (!customPromptFilepath) {
    return base;
  }

  try {
    const custom = await readFile(customPromptFilepath, "utf-8");
    return [base, "", "## 추가 리뷰 지시사항", "", custom].join("\n");
  } catch (err) {
    throw new Error(
      `Failed to read custom prompt file "${customPromptFilepath}": ${(err as Error).message}`,
    );
  }
}

export function buildReviewPrompt(baseBranch: string): string {
  return [
    `'${baseBranch}'와 HEAD 사이의 코드 변경사항을 분석하여 한국어로 코드 리뷰해줘.`,
    "",
    "## 버그 판정 기준",
    "",
    "다음 8가지 기준을 **모두** 충족하는 경우에만 이슈로 보고해줘:",
    "",
    "1. 정확성·성능·보안·유지보수성에 **실질적 영향**이 있어야 함",
    "2. 개별적이고 **액션 가능한** 이슈여야 함",
    "3. 코드베이스 전반 수준에 맞는 **리거(rigor)**를 적용",
    "4. **이번 커밋에서 도입된 버그만** 지적 (기존 버그 무시)",
    "5. 원작자가 알면 **스스로 고칠 법한 것만** 지적",
    "6. 코드베이스나 의도에 대한 **검증 불가 가정 금지**",
    "7. 다른 코드에 미치는 영향은 **구체적 증거** 필요",
    "8. 의도적 변경은 **버그로 판정하지 않음**",
    "",
    "## 코멘트 작성 가이드",
    "",
    "- matter-of-fact 톤, 아첨 금지",
    "- 1문단 이내, 코드 블록 3줄 이하",
    "- 버그 발생 시나리오·환경·입력을 명시",
    "- 즉시 이해 가능하게 작성",
    "",
    "## 우선순위 (priority)",
    "",
    "- P0: 데이터 손실·보안 취약점·서비스 장애 유발",
    "- P1: 주요 기능 오동작·심각한 성능 저하",
    "- P2: 마이너 버그·베스트 프랙티스 위반·가독성 저하",
    "- P3: 사소한 개선·코드 스타일·선택적 리팩토링",
    "",
    "## 출력 형식",
    "",
    "반드시 아래 JSON 객체 형식으로만 응답해줘. 다른 텍스트 없이 JSON만 출력해줘:",
    "```json",
    "{",
    '  "summary": "Bitbucket Markdown으로 렌더링 가능한 변경사항 요약. 반드시 `### 변경 개요`, `### 주요 변경사항`, `### 영향 범위` 섹션과 `-` bullet list를 사용해줘.",',
    '  "verdict": "approve | request-changes | comment",',
    '  "confidence": 85,',
    '  "findings": [',
    "    {",
    '      "title": "≤80자 임페러티브형 제목",',
    '      "path": "src/example/file.ts",',
    '      "line_range": { "start": 42, "end": 45 },',
    '      "priority": 2,',
    '      "severity": "recommended",',
    '      "description": "문제가 무엇인지 명확히 설명",',
    '      "problemCode": "문제가 되는 코드 인용 (선택)",',
    '      "suggestedFix": "개선된 코드 예시 (선택)",',
    '      "reason": "왜 이 변경이 필요한지 근거"',
    "    }",
    "  ]",
    "}",
    "```",
    "",
    "## 필드별 가이드라인",
    "",
    "### title",
    '- ≤80자, 임페러티브형 (예: "null 체크 누락으로 런타임 크래시 가능")',
    "",
    "### path",
    "- **반드시 repo root 기준 상대 경로** (absolute path 사용 금지)",
    "",
    "### line_range",
    '- 이슈가 걸쳐 있는 라인 범위 { "start": N, "end": M }',
    "- 단일 라인이면 start와 end가 동일",
    "",
    "### priority / severity 매핑",
    "- P0 → blocking, P1 → blocking, P2 → recommended, P3 → suggestion",
    '- tech-debt는 별도 severity (priority 없이 severity="tech-debt" 가능)',
    "",
    "### summary",
    "- 반드시 Bitbucket Markdown 호환 형식으로 작성",
    "- `### 변경 개요`, `### 주요 변경사항`, `### 영향 범위` 순서로 작성",
    "- 각 섹션 내용은 `-` bullet list로 작성 (`1)` 같은 번호 목록 금지)",
    "- 간결하고 명확하게, 비개발자도 이해할 수 있도록 작성",
    "",
    "### verdict",
    '- "approve": blocking 이슈가 없고, 코드 품질이 양호한 경우',
    '- "request-changes": blocking 이슈가 1개 이상인 경우',
    '- "comment": blocking은 없지만 개선 권장사항이 있는 경우',
    "",
    "### confidence",
    "- 리뷰 판단의 확신도 (0-100)",
    "",
    "### findings",
    "- 각 이슈의 severity는 반드시 다음 4단계 중 하나:",
    '  - "blocking": 반드시 수정 필요 (보안 취약점, 버그, 아키텍처 위반)',
    '  - "recommended": 권장 개선 사항 (성능, 가독성, 베스트 프랙티스)',
    '  - "suggestion": 선택적 개선 아이디어 (리팩토링, 최적화 기회)',
    '  - "tech-debt": 향후 개선이 필요한 기술 부채',
    "- 문제가 없으면 빈 배열 []",
  ].join("\n");
}
