/** 리뷰 프롬프트 템플릿 — Codex review_prompt.md 기반 하이브리드 */

import { readFile } from "fs/promises";

export type ReviewPromptMode = "inline-diff" | "branch-diff";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * 기본 프롬프트를 빌드한 뒤, customPromptFilepath가 있으면
 * 해당 파일 내용을 추가 지시사항으로 append.
 */
export async function resolveReviewPrompt(
  baseBranch: string,
  customPromptFilepath: string,
  reviewDiff = "",
  mode: ReviewPromptMode = "inline-diff",
  excludedChangedFiles: readonly string[] = [],
): Promise<string> {
  const base = buildReviewPrompt(
    baseBranch,
    reviewDiff,
    mode,
    excludedChangedFiles,
  );

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

export function buildReviewPrompt(
  baseBranch: string,
  reviewDiff = "",
  mode: ReviewPromptMode = "inline-diff",
  excludedChangedFiles: readonly string[] = [],
): string {
  const isBranchDiffMode = mode === "branch-diff";
  const quotedBaseRef = shellQuote(`refs/heads/${baseBranch}`);
  const targetInstruction = isBranchDiffMode
    ? "프롬프트에 diff를 첨부하지 않는다. 현재 worktree의 체크아웃된 브랜치에서 Git으로 PR diff를 직접 조회하고, 조회한 변경사항만 근거로 사용해줘."
    : "반드시 이 프롬프트 하단의 `리뷰 대상 PR diff`만 근거로 사용해줘.";
  const excludedSection =
    excludedChangedFiles.length > 0
      ? [
          "## diff에서 제외된 변경 파일",
          "",
          "아래 파일들은 이번 PR에서 실제로 변경됐지만, 입력 크기를 줄이려고 diff 본문에서 의도적으로 제외했어.",
          "",
          ...excludedChangedFiles.map((file) => `- ${file}`),
          "",
          '이 파일들이 "변경되지 않았다" / "갱신이 누락됐다"고 단정하지 마.',
          "이 파일들 자체에 대한 findings도 만들지 마 (게시 단계에서 폐기됨).",
          "",
        ]
      : [
          "## diff에서 제외된 변경 파일",
          "",
          "lock 파일(pnpm-lock.yaml, package-lock.json, yarn.lock, bun.lockb)은 diff 본문에서 항상 제외되지만, 이번 PR에서는 그중 변경된 파일이 없어.",
          "의존성 매니페스트 변경에 lock 갱신이 빠졌다고 지적할 경우, path는 반드시 diff에 포함된 파일(예: package.json)로 지정해줘.",
          "",
        ];
  const diffSection = isBranchDiffMode
    ? [
        "## 리뷰 대상 PR diff",
        "",
        "대형 PR이라 diff 본문은 입력 크기 제한을 피하기 위해 첨부하지 않는다.",
        `기준 브랜치(base branch): ${baseBranch}`,
        "현재 worktree에서 다음 방식으로 PR 변경사항을 직접 조사해줘:",
        "",
        "```bash",
        `merge_base=$(git merge-base ${quotedBaseRef} HEAD)`,
        'git diff --no-ext-diff --find-renames --unified=80 "${merge_base}..HEAD" -- . \':(exclude,glob)**/pnpm-lock.yaml\' \':(exclude,glob)**/package-lock.json\' \':(exclude,glob)**/yarn.lock\' \':(exclude,glob)**/bun.lockb\'',
        "```",
        "",
        "필요하면 변경 파일을 직접 읽되, 위 diff 범위에 포함된 이번 브랜치 변경만 findings에 포함해줘.",
        "라인 번호는 직접 조회한 unified diff hunk의 new-side 라인 번호를 사용해줘.",
      ]
    : reviewDiff
      ? [
          "## 리뷰 대상 PR diff",
          "",
          "아래 diff만 이번 PR의 리뷰 대상이야. diff에 없는 파일/라인/변경사항은 절대 findings에 포함하지 마.",
          "라인 번호는 unified diff hunk의 new-side 라인 번호를 사용해줘.",
          "",
          "```diff",
          reviewDiff,
          "```",
        ]
      : [
          "## 리뷰 대상 PR diff",
          "",
          "diff가 비어 있으면 findings는 빈 배열 []로 반환해줘.",
        ];

  return [
    `'${baseBranch}' 기준 PR merge-base부터 HEAD까지의 코드 변경사항을 한국어로 코드 리뷰해줘.`,
    targetInstruction,
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
    "- matter-of-fact 톤, 아첨 금지 (AI 어시스턴트 제안 톤, 사람 리뷰어 흉내 금지)",
    "- 이슈의 심각도를 과장하지 말 것 — 실제보다 심각하게 표현하면 신뢰도 하락",
    "- 1문단 이내, 코드 블록 3줄 이하",
    "- 버그가 발생하는 시나리오·환경·입력을 명확히 명시하고, 심각도가 이 조건에 의존함을 전달",
    "- 즉시 이해 가능하게 작성 — close reading 없이 요점을 파악할 수 있어야 함",
    "",
    "## 발견 건수 가이드",
    "",
    "- 원작자가 알면 고칠 만한 이슈를 **전부** 보고할 것",
    "- 확실한 이슈가 하나도 없으면 빈 배열 [] 반환 — 억지로 만들지 말 것",
    "- 첫 번째 발견에서 멈추지 말고 끝까지 탐색할 것",
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
    "- **5-10줄 이내로 최소화** — 문제를 정확히 짚는 가장 짧은 범위를 선택",
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
    "",
    ...excludedSection,
    ...diffSection,
  ].join("\n");
}
