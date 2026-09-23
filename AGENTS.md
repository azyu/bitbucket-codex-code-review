# AGENTS.md

## 작업 규칙

- 작업 시작 전 `.context/STEERING.md`를 읽을 것
- GitHub Issues의 open + `backlog` 라벨을 유일한 작업 큐로 사용할 것
- 지정된 이슈는 `gh issue view <번호> --comments`로 읽고, 지정이 없으면 `gh issue list --state open --label backlog`에서 선택할 것
- **DoD를 모두 확인했으면 승인을 묻지 말고 커밋 → push → PR 생성까지 진행할 것.** 작업 브랜치에서만 하고 `main`에 직접 push하지 않는다
- DoD 중 확인하지 못한 항목이 있으면 커밋 전에 멈추고, 무엇을 왜 확인하지 못했는지 보고한 뒤 결정을 받는다

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

## 코드 리뷰 사이클 (GitHub Codex 커넥터)

PR을 열면 `chatgpt-codex-connector`가 리뷰를 남긴다. 결과는 즉시 오지 않으므로 **열자마자 확인하지 말고 기다렸다가 확인한다.**

1. PR open (또는 `@codex review` 댓글로 재트리거)
2. **10분 대기**
3. 확인 — 두 명령을 모두 써야 한다. 인라인 리뷰 코멘트는 첫 명령에 나오지 않는다.
   - `gh pr view <번호> --comments`
   - `gh api repos/azyu/bitbucket-codex-code-review/pulls/<번호>/comments --jq '.[] | "\(.path):\(.line) \(.body)"'`
4. 20분이 지나도 리뷰가 없으면 `@codex review` 댓글로 재트리거한다

대기 시간 근거 — PR #85/#86/#101/#105에서 트리거→리뷰 게시 지연 24건을 측정(2026-09-17): 중앙값 8.0분, p90 10.6분, 최소 1.1분(지적 없음일 때). 표본 중 1건(165분)은 다른 요인으로 보여 제외했다. 큰 PR의 라운드트립은 6~10분대에 몰려 있고, 짧은 확인 요청은 1~3분에 돌아온다.

리뷰를 확인할 때 지킬 것:

- **지적은 결론이 아니라 증거 후보다.** 실제 코드·정규식·런타임으로 재현한 뒤 수용 여부를 정한다. PR #105의 P1(봇 답글이 자기 트리거를 유발)은 메커니즘은 사실이었지만 영향 주장은 거짓이었다 — 문구의 백틱 때문에 두 트리거 regex가 모두 불일치했다. 대신 그 지적이 드러낸 진짜 공백(작성자 미검사)은 회귀 테스트로 고정했다.
- **"Committed as `<sha>`"를 그대로 믿지 않는다.** 커넥터가 자기 샌드박스에서만 커밋하고 origin에는 올리지 않은 사례가 반복된다(PR #63의 `e64502a`, PR #105의 `61202d8` — 둘 다 존재하지 않음). `git cat-file -t <sha>` 또는 `gh api repos/azyu/bitbucket-codex-code-review/commits/<sha>`로 존재를 확인한 뒤 상태를 보고한다. 분석 자체는 정확했던 적이 많으므로, 의심할 대상은 분석이 아니라 "반영됐다"는 주장이다.

## Definition of Done (DoD)

태스크 완료 판정 기준:

- [ ] `pnpm build` 성공
- [ ] `pnpm lint` 경고/에러 없음
- [ ] `pnpm test` 전체 통과
- [ ] 테스트 커버리지 80% 이상
- [ ] 보안 체크리스트 통과 (하드코딩 시크릿, 입력 검증, 에러 누출 없음)
- [ ] GitHub Issue에 검증 결과와 상태 업데이트 완료
- [ ] 위 항목이 모두 확인되면 커밋(conventional commit 형식) → push → PR 생성 (승인 요청 없이)

## 의존성 업데이트 (Renovate)

Renovate PR의 CI green은 타입 호환성만 증명한다. 테스트가 실제 Redis/MySQL을 띄우지 않으므로 런타임 동작 변경은 통과한다. major 범프는 릴리스 노트의 BREAKING 항목을 코드에 직접 대조할 것.

그 green은 브랜치가 만들어진 시점의 main 기준이기도 하다. main이 움직여도 충돌만 없으면 Renovate는 리베이스하지 않는다 — #110·#92·#73·#68·#67·#55에 리베이스 체크박스를 찍었으나 다음 주기에 체크만 해제되고 브랜치는 그대로였으며, 이틀 뒤에도 `packageManager`가 `pnpm@10.34.5`였다. 충돌 상태였던 #94만 리베이스됐다. `gh run rerun`은 원래 이벤트의 SHA를 다시 쓰므로 낡은 병합 커밋을 재검증할 뿐이다. 오래된 Renovate PR은 병합 트리를 직접 만들어 확인할 것:

```bash
t=$(git merge-tree --write-tree origin/main origin/<branch> | head -1)
git archive "$t" | tar -x -C <dir>
cd <dir> && pnpm install --frozen-lockfile && pnpm build && pnpm lint && pnpm test
```

peer dependency가 optional로 강등되는 변경은 lockfile이 이전 트리의 잔재를 유지해 정상으로 보인다. `package.json`만 빈 디렉터리에 복사해 `pnpm install --lockfile-only`로 재해석하고 패키지가 살아남는지 확인할 것 (bullmq v6 → ioredis 유실, PR #90).

CI가 빌드하는 이미지 레이어는 `--target deps`까지다. build·runtime stage에서만 깨지는 변경은 CI 전 항목 green으로 main에 들어가고 publish 잡에서야 터진다. Dockerfile이나 툴체인을 건드렸으면 `docker build .`를 직접 한 번 돌릴 것.

pnpm 메이저를 올릴 때는 corepack부터 확인할 것. pnpm은 npm 패키지의 `bin` 매핑을 메이저마다 바꿨고(10 `bin/pnpm.cjs` → 11 `bin/pnpm.mjs` → 12 네이티브 런처), `node:*-alpine`에 번들된 corepack이 새 레이아웃을 모르면 `pnpm install`이 시작조차 못 하고 `MODULE_NOT_FOUND`로 죽는다. `pnpm/action-setup`은 멀쩡히 동작하므로 CI는 전부 통과한다 — 이미지만 깨진다(PR #112 → #114). 확인은 `docker run --rm node:24-alpine sh -c 'corepack enable && corepack prepare pnpm@<버전> --activate && pnpm -v'`.

`minimumReleaseAge`는 pnpm·Renovate 양쪽에 2일로 맞춰져 있다. lockfile에 그보다 어린 항목이 있으면 경고가 아니라 install 실패다. 선언 범위가 어린 버전만 허용하면 `pnpm-workspace.yaml`의 `minimumReleaseAgeExclude`에 버전까지 박아 넣어야 하고, 해당 패키지가 다음에 올라가면 그 줄은 죽은 항목이 되므로 같이 지울 것.

`package.json`의 `pnpm` 필드는 pnpm 12부터 읽히지 않는다. `overrides`·`allowBuilds` 같은 설정은 `pnpm-workspace.yaml`에만 있다. 경고 한 줄만 찍고 install은 성공하므로 무시된 것을 눈치채기 어렵다.

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
