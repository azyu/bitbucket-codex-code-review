{{/*
Expand the name of the chart.
*/}}
{{- define "code-review-worker.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "code-review-worker.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "code-review-worker.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "code-review-worker.labels" -}}
helm.sh/chart: {{ include "code-review-worker.chart" . }}
{{ include "code-review-worker.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "code-review-worker.selectorLabels" -}}
app.kubernetes.io/name: {{ include "code-review-worker.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Service account name
*/}}
{{- define "code-review-worker.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "code-review-worker.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Database secret name — use existingSecret or generate one
*/}}
{{- define "code-review-worker.databaseSecretName" -}}
{{- if .Values.database.existingSecret }}
{{- .Values.database.existingSecret }}
{{- else }}
{{- printf "%s-database" (include "code-review-worker.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Redis secret name
*/}}
{{- define "code-review-worker.redisSecretName" -}}
{{- if .Values.redis.existingSecret }}
{{- .Values.redis.existingSecret }}
{{- else }}
{{- printf "%s-redis" (include "code-review-worker.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Bitbucket secret name
*/}}
{{- define "code-review-worker.bitbucketSecretName" -}}
{{- if .Values.bitbucket.existingSecret }}
{{- .Values.bitbucket.existingSecret }}
{{- else }}
{{- printf "%s-bitbucket" (include "code-review-worker.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Codex auth secret name
*/}}
{{- define "code-review-worker.codexAuthSecretName" -}}
{{- .Values.codexAuth.existingSecret }}
{{- end }}
