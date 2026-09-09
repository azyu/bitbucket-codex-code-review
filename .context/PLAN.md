# PLAN.md

## 목표

Secret Manager에 있던 **운영 중 변경 가능한 리뷰 설정과 연동 자격증명**을 대시보드에서 관리하고, 저장 이후 새 작업부터 Pod 재시작 없이 적용한다.

첫 배포에서 DB 마이그레이션과 설정 이관을 위해 한 번은 롤아웃이 필요하다. 이후에도 DB/Redis 접속정보, 포트처럼 프로세스 부팅 전에 필요한 설정은 Secret Manager에 남고 변경 시 재시작이 필요하다.

## 결정

### 1. 설정 소유권 seam

`RuntimeSettingsService` 하나가 다음 책임을 가진다.

- 전역 설정과 `(workspaceSlug, repositorySlug)`별 override 조회
- 입력 검증, 전역/저장소 우선순위 해석
- secret 암복호화와 응답 redaction
- revision 기반 조건부 갱신
- 한 작업에서 사용할 immutable snapshot 생성

초기 구현은 매 webhook/job 시작 시 MySQL을 한 번 읽는다. 캐시, Redis pub/sub, 설정 provider interface, 이벤트 버스는 추가하지 않는다.

### 2. 저장 구조

`runtime_settings` 한 테이블을 사용한다.

- `scopeKey`: 전역은 고정값 `global`, repository는 `repo:<workspaceSlug>/<repositorySlug>`
- `scope`: `global` 또는 `repository`
- `workspaceSlug`, `repositorySlug`: nullable을 쓰지 않고 전역 row에는 빈 문자열 sentinel, repository row에는 실제 복합 식별자
- `values`: 검증된 비밀이 아닌 JSON 설정
- `encryptedSecrets`: 해당 scope의 secret JSON 전체를 담은 AES-256-GCM envelope
- `revision`: optimistic concurrency용 정수
- `updatedAt`
- primary/unique: `scopeKey`; 보조 unique `(scope, workspaceSlug, repositorySlug)`

전역 row는 하나이며 repository row는 override가 있을 때만 존재한다. append-only 설정 이력과 별도 감사 테이블은 만들지 않는다. 변경 로그에는 scope, revision, 바뀐 key 이름만 남기고 값은 남기지 않는다.

암호화 키는 `SETTINGS_ENCRYPTION_KEY` 32-byte 값으로 Secret Manager에 남긴다. 매 저장마다 12-byte random IV를 쓰고 scope와 repository identity를 AAD로 인증한다.

### 3. 대시보드 인증

`DASHBOARD_SECRET_KEY` 하나를 Secret Manager에서 발급한다.

- 최소 32 bytes, 부팅 시 필수 검증
- `/dashboard`와 정적 JS는 공개 shell로 유지
- 기존 조회를 포함한 모든 `/api/internal/*` route에 controller-level guard 적용
- 클라이언트는 `Authorization: Bearer <key>` 사용
- key는 JS closure 메모리에만 보관하고 input은 즉시 비운다
- cookie, session, localStorage, sessionStorage, login endpoint, CSRF token은 사용하지 않는다
- 새로고침/로그아웃/401이면 key와 화면 데이터를 지우고 polling을 중단한다
- 잘못된 key는 항상 동일한 401을 반환하고 key/header를 로그에 남기지 않는다

Bearer header는 ambient credential이 아니고 CORS를 열지 않으므로 cookie 기반 CSRF 방어는 필요 없다. 모든 내부 응답은 `Cache-Control: no-store`를 사용한다.

### 4. 관리 대상

대시보드에서 변경:

- Codex: model, reasoning effort, timeout, custom prompt **본문**
- OpenAI: API key, HTTPS base URL
- Review: trigger mode
- Queue: 새 job의 retry attempts/delay
- Worker: global concurrency
- Workspace: git clone timeout
- Bitbucket: global/repository API token, global/repository webhook secret, global legacy Basic credential pair(username + app password)

repository override 우선순위:

1. PR 댓글의 model override
2. `(workspaceSlug, repositorySlug)` 설정
3. global 설정
4. 코드 기본값

대시보드에서 변경하지 않음:

- DB/Redis 주소와 자격증명, pool
- HTTP/metrics port, NODE_ENV, telemetry, service metadata
- Codex executable/auth.json mount
- workspace base path
- Bitbucket API base URL
- `DASHBOARD_SECRET_KEY`, `SETTINGS_ENCRYPTION_KEY`

이 값들은 DB를 읽기 전 또는 프로세스/클라이언트 생성 시 필요하므로 bootstrap-static 설정이다.

OpenAI base URL은 HTTPS만 허용하며 API key와 같은 job-start DB 읽기에서 하나의 connection snapshot으로 원자적으로 resolve한다. 비밀이 아닌 값이지만 webhook 시점의 review snapshot에는 넣지 않는다.

### 5. secret API 규칙

GET은 secret 값, 암호문, hash, mask 문자열을 반환하지 않고 `configured`, `source`만 반환한다.

PATCH에서:

- 필드 생략: 유지
- `{ "operation": "replace", "value": "..." }`: 교체
- `{ "operation": "clear" }`: 삭제; repository에서는 global 상속으로 복귀

legacy Basic credential은 전역에서만 하나의 atomic secret으로 관리한다.

- `{ "operation": "replace", "username": "...", "appPassword": "..." }`: 두 값을 함께 교체
- `{ "operation": "clear" }`: 두 값을 함께 삭제
- username이나 app password 한쪽만 저장·수정하는 요청은 거부

GET은 `basicCredentialConfigured`만 반환한다.

빈 secret, unknown key, 잘못된 scope/type/range는 저장 전에 400으로 거부한다. `expectedRevision` 불일치는 현재 redacted 문서와 함께 409를 반환하며 자동 재시도나 force overwrite는 하지 않는다.

### 6. 최초 이관과 cutover

최초 배포의 one-time importer는 현재 runtime env/default의 global 값 전체(OpenAI 연결, queue/Codex/worker/workspace/review 설정, Bitbucket API token·webhook secret·legacy username/app-password)와 repository prompt 본문·API token·webhook secret을 해당 current row로 옮긴다. `repositorySlug`만 있는 기존 항목은 workspace를 추측하지 않고 명시적인 `repositorySlug` → `workspaceSlug` mapping을 요구하며, 누락된 mapping이 있으면 cutover하지 않는다.

한 번의 배포에서 webhook ingress를 잠시 멈추고 기존 queued/retrying/running job을 현재 `job.data.model`로 모두 drain한 뒤 DB migration/import와 모든 runtime consumer를 rolling 배포한다. 모든 Pod 전환과 import 성공을 확인한 후 ingress를 재개하여 snapshot 없는 기존 job이 새 processor에 들어가지 않게 한다.

## runtime 적용 불변식

- webhook 검증 secret은 요청 시작 때 한 번 읽는다.
- webhook controller는 effective 비밀 아닌 review 설정을 resolve하고 model override를 적용한 뒤 `review_runs`의 JSON snapshot으로 저장한다. OpenAI base URL은 제외한다.
- queue attempts/backoff는 enqueue 옵션에 명시해 새 job에만 적용한다.
- `postInProgressReply`, `postInProgressComment`, `buildProgressMessage`는 별도 `ConfigService` 조회 없이 같은 resolved review snapshot의 model/reasoning을 표시한다.
- processor는 저장된 review snapshot과 작업 시작 시 읽은 credential snapshot을 끝까지 재사용한다.
- OpenAI HTTPS base URL과 API key는 같은 job-start DB 읽기에서 하나의 immutable connection snapshot으로 만들고 함께 재사용한다. 서로 다른 revision의 endpoint와 key를 섞지 않는다.
- 실행 중 설정 변경은 해당 webhook/job/Bitbucket 게시 흐름을 바꾸지 않는다.
- 새 webhook은 새 review 설정을, 새 job 시작은 새 credential과 OpenAI connection 설정을 사용한다.
- worker concurrency만 live global control이며 각 Pod가 짧은 revision polling으로 DB를 읽어 자신의 `worker.concurrency` setter에 적용한다. 낮춰도 이미 실행 중인 job은 취소하지 않는다.

`CodexService`는 binary path만 constructor에 유지하고 model/reasoning/timeout/prompt는 review snapshot, OpenAI HTTPS base URL/API key는 atomic job-start connection snapshot 인자로 받는다. 현재 `process.env` 전체를 child에 복사하는 방식은 고정 allowlist와 명시적 OpenAI 변수 주입으로 바꿔 dashboard/encryption/Bitbucket/DB/Redis secret 유출을 막는다.

`WorkspaceService`는 base path만 constructor에 유지하고 clone timeout과 credential을 작업 snapshot으로 받는다. repo path와 lock key도 workspace+repository 복합 식별자를 사용한다.

## 내부 interface와 route

핵심 interface:

- `resolveReviewSettings(identity, modelOverride?)`
- `resolveWebhookSecret(identity)`
- `resolveBitbucketCredentials(identity)`
- `getSettingsDocument()`
- `updateGlobal(dto)`
- `updateRepository(identity, dto)`

route:

- `GET /api/internal/settings`
- `PATCH /api/internal/settings/global`
- `PATCH /api/internal/settings/repositories/:workspaceSlug/:repositorySlug`

별도 delete route는 만들지 않는다. repository override는 PATCH의 `null`/`clear`로 제거하며 빈 row는 revision 충돌 방지를 위해 유지한다.

## 구현 순서

### Phase 1: 저장과 보호

- migration/entity 및 `RuntimeSettingsService`
- one-time importer로 현재 runtime env/default의 global 값 전체와 repository prompt 본문·API token·webhook secret을 current row에 이관
- `repositorySlug`-only 항목의 명시적 workspace mapping 검증; 누락 시 cutover 중단
- AES-256-GCM secret 저장과 redacted DTO
- `DASHBOARD_SECRET_KEY` guard를 모든 internal route에 적용
- settings GET/PATCH와 revision CAS

### Phase 2: 안전한 cutover와 runtime consumer 전환

- Phase 1·2를 한 번에 배포: webhook ingress 일시 중단 → 기존 queued/retrying/running job을 현재 `job.data.model`로 drain → migration/import와 모든 consumer rolling 배포 → 전체 Pod와 import 확인 후 ingress 재개
- webhook secret/trigger mode/queue options를 runtime settings로 전환
- review run에 OpenAI base URL을 제외한 비밀 아닌 effective review snapshot 저장
- Codex model/reasoning/timeout/prompt를 review snapshot 인자로 전환
- OpenAI HTTPS base URL/API key를 같은 job-start 읽기의 atomic connection snapshot 인자로 전환
- Bitbucket/Git credential을 작업 시작 snapshot으로 전환
- 진행 중 댓글의 model/reasoning도 review snapshot에서 렌더링하도록 `WebhookController`의 별도 `ConfigService` 조회 제거
- clone timeout과 worker concurrency live 적용
- Codex child env를 allowlist로 전환

### Phase 3: 대시보드

- 잠금 화면과 memory-only key 처리
- global/repository 설정 form
- secret configured/inherited 표시와 replace/clear UX
- legacy Basic credential pair의 configured 표시와 atomic replace/clear UX
- 400/401/409/5xx 상태 처리

### Phase 4: 정리와 검증

- runtime env/filepath prompt 조회 제거
- `.env.example`, Compose, README를 bootstrap-static 설정 중심으로 정리
- build/lint/test/coverage와 보안 체크
- 실제 브라우저에서 로그인, 조회, 저장, 충돌, secret redaction, 다음 job 적용 확인

## 수용 기준

- 인증 없거나 틀린 key로 모든 `/api/internal/*` 요청이 401
- 올바른 key는 조회/수정 가능하고 reload 뒤 재입력 필요
- DB의 secret column에 평문이 없고 API/로그/에러에 secret이 없음
- 같은 revision의 동시 PATCH는 정확히 하나만 성공하고 나머지는 409
- 저장 후 Pod 재시작 없이 다음 webhook은 새 review 설정을, 다음 job 시작은 새 credential/OpenAI connection 설정을 사용
- 실행 중 job은 저장 전 review snapshot과 job-start credential/OpenAI connection snapshot 유지
- 최초 이관이 현재 runtime env/default의 global 값 전체와 repository prompt 본문·API token·webhook secret을 모두 보존하며 `repositorySlug`-only 항목은 명시적 workspace mapping 없이는 cutover되지 않음
- ingress pause와 queue drain 뒤 배포되어 snapshot 없는 queued/retrying job이 새 processor에서 실행되지 않고, drain 중 기존 job은 현재 `job.data.model`을 유지
- OpenAI base URL은 HTTPS만 허용되고 API key와 같은 job-start 읽기에서 생성된 connection snapshot이어서 새 key가 이전 endpoint와 결합되지 않음
- 진행 중 댓글이 같은 review snapshot의 model/reasoning을 표시해 실제 job 설정과 일치
- repository slug가 같아도 workspace가 다르면 설정/secret이 분리
- legacy Basic credential은 username/app password를 항상 함께 replace/clear할 수 있고 GET에는 configured 여부만 노출
- Codex child env에 dashboard/encryption/Bitbucket/DB/Redis secret이 없음
- 여러 Pod가 같은 새 concurrency revision을 관측해 각 worker setter에 적용하고, 이미 실행 중인 job은 유지
- bootstrap-static 설정은 대시보드에서 노출·수정되지 않음

## 명시적으로 생략

- 사용자별 계정/RBAC/SSO
- 세션 저장소와 CSRF token
- 설정 변경 이력/rollback UI
- Redis 기반 캐시 무효화
- 실행 중 job 강제 재설정

둘 이상의 운영자 식별이나 설정 감사/복구 요구가 생길 때만 계정과 append-only history를 추가한다.
