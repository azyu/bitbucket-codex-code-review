# STEERING.md

## Task tracking

GitHub Issues are the only actionable task source:

- Queue: https://github.com/azyu/bitbucket-codex-code-review/issues?q=is%3Aissue+is%3Aopen+label%3Abacklog
- Open issue + `backlog` = available work
- `in-progress` = claimed implementation
- `awaiting-review` = PR open; issue remains open until merge
- `needs-decision` / `blocked` = not selectable

Do not add task lists or implementation plans under `.context/`. Put executable scope, decisions, acceptance criteria, and verification steps in the issue body and comments.

## Product direction

Bitbucket PR events enter a NestJS worker, enqueue BullMQ jobs, run Codex CLI in isolated git worktrees, and publish review comments back to Bitbucket. MySQL is the durable review-state authority; Redis is queue infrastructure.

## Load-bearing constraints

- Database conditional state transitions decide whether a review run may publish. A run already in `PUBLISHING` must not be reclaimed for another publish attempt.
- Persist the first published summary comment ID before inline comments or completion state. It is the durable evidence used to prevent duplicate publication.
- Findings may target only changed paths. Repository files and git history may be read as evidence, but must not expand the finding scope beyond the review diff.
- Worktree preparation is serialized per repository within one process; Codex execution remains concurrent. Multiple worker processes require a cross-process lock before sharing the same bare repository.
- Production deployment uses the Docker image through the external infrastructure repository. The removed Helm chart is not a deployment target.

## Change discipline

Prefer one source of truth and clean cutovers. Preserve idempotency, supersede, and publication invariants when changing queue or review state transitions. Never expose credentials, raw prompts, review output, or unsanitized errors through unauthenticated surfaces.
