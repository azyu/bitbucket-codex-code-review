# code-review-worker Helm Chart

Bitbucket PR webhook → Codex CLI 코드 리뷰 → PR 코멘트 게시하는 NestJS 워커 서비스.

## Quick Start

```bash
helm install code-review ./charts/code-review-worker \
  --set database.host=mysql \
  --set database.username=root \
  --set database.password=changeme \
  --set database.name=lxp_code_review \
  --set redis.host=redis \
  --set redis.password=changeme \
  --set codexAuth.existingSecret=codex-auth
```

## Codex CLI 인증 설정

두 가지 방식을 지원합니다:

### 방법 1: `OPENAI_API_KEY` 환경변수 (권장)

K8s Secret에 API 키를 저장하고 환경변수로 주입합니다.

```bash
kubectl create secret generic openai-api-key --from-literal=api-key=sk-...
```

`deployment.yaml`의 `env` 섹션에서 `OPENAI_API_KEY`로 매핑됩니다.

### 방법 2: `auth.json` 볼륨 마운트

`codex login`으로 생성되는 `~/.codex/auth.json`을 Secret으로 마운트합니다.

```bash
# Secret 생성
kubectl create secret generic codex-auth \
  --from-file=auth.json=$HOME/.codex/auth.json

# Helm 설치 시 적용
helm install code-review ./charts/code-review-worker \
  --set codexAuth.existingSecret=codex-auth
```

### 확인

```bash
# Codex CLI 인증 테스트
kubectl exec deploy/code-review-code-review-worker -- codex --version
```

> [!NOTE]
> 커스텀 엔드포인트는 `OPENAI_BASE_URL` 환경변수 또는 Codex `config.toml`의 `openai_base_url` 키로 설정합니다. 둘 다 설정된 경우 config.toml이 우선합니다.

## Secret 관리

4개 그룹으로 분리, 각각 `existingSecret` 또는 인라인 값 지원:

| 그룹 | `existingSecret` | 필요한 키 | 인라인 값 |
|------|-------------------|----------|----------|
| Database | `database.existingSecret` | `db-password` | `database.password` |
| Redis | `redis.existingSecret` | `redis-password` | `redis.password` |
| Bitbucket | `bitbucket.existingSecret` | `bitbucket-api-token`, `bitbucket-app-password`, `bitbucket-webhook-secret` | `bitbucket.apiToken`, `.appPassword`, `.webhookSecret` |
| Codex Auth | `codexAuth.existingSecret` | Secret 전체를 `/root/.codex`에 마운트 | — (볼륨 마운트만 지원) |

**프로덕션 권장**: External Secrets Operator 또는 Sealed Secrets로 `existingSecret` 사용.

```bash
# External Secrets 예시
kubectl apply -f - <<EOF
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: codex-auth
spec:
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: codex-auth
  data:
    - secretKey: auth.json
      remoteRef:
        key: /prod/codex/auth
EOF
```

## Configuration

### Required

| Parameter | Description |
|-----------|-------------|
| `database.host` | MySQL 호스트 |
| `database.username` | DB 사용자명 |
| `database.password` | DB 비밀번호 (또는 `database.existingSecret`) |
| `database.name` | DB 이름 |
| `redis.host` | Redis 호스트 |
| `redis.password` | Redis 비밀번호 (또는 `redis.existingSecret`) |

### Optional

| Parameter | Default | Description |
|-----------|---------|-------------|
| `image.repository` | `ghcr.io/anthropics/code-review-worker` | 이미지 저장소 |
| `image.tag` | `appVersion` | 이미지 태그 |
| `replicaCount` | `1` | 레플리카 수 |
| `nodeEnv` | `production` | NODE_ENV |
| `port` | `3000` | HTTP 포트 |
| `metricsPort` | `9463` | 메트릭 포트 |
| `codex.model` | `gpt-5.4` | Codex 모델 |
| `codex.timeoutMs` | `600000` | Codex 타임아웃 (ms) |
| `codex.reasoningEffort` | `medium` | Codex reasoning 수준 |
| `codexAuth.existingSecret` | `""` | Codex 인증 Secret 이름 |
| `bitbucket.baseUrl` | `https://api.bitbucket.org/2.0` | Bitbucket API URL |
| `workspace.basePath` | `/workspaces` | 워크스페이스 경로 |
| `workspace.maxConcurrent` | `3` | 최대 동시 워크스페이스 |
| `trigger.mode` | `mention` | 트리거 모드 (`mention`/`auto`/`both`) |
| `persistence.workspaces.enabled` | `false` | PVC 사용 여부 (기본: emptyDir 5Gi) |
| `migration.enabled` | `false` | Init container DB 마이그레이션 |
| `autoscaling.enabled` | `false` | HPA 활성화 |
| `serviceMonitor.enabled` | `false` | Prometheus ServiceMonitor |
| `networkPolicy.enabled` | `false` | NetworkPolicy |
| `ingress.enabled` | `false` | Ingress (기본 path: `/api/webhooks`) |

## Verification

```bash
helm lint charts/code-review-worker/
helm template test charts/code-review-worker/ \
  --set database.host=mysql \
  --set database.username=root \
  --set database.password=pass \
  --set database.name=lxp_code_review \
  --set redis.host=redis \
  --set redis.password=pass
```
