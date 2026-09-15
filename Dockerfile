FROM node:24-alpine AS deps

WORKDIR /app

RUN corepack enable

# pnpm-workspace.yaml plus every member's package.json: --frozen-lockfile
# rejects a workspace lockfile whose importers are not all on disk.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY dashboard/package.json ./dashboard/
RUN pnpm install --frozen-lockfile


FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
# Workspace members get their own node_modules of symlinks into the store.
COPY --from=deps /app/dashboard/node_modules ./dashboard/node_modules
COPY . .

# Root `pnpm build` rather than nest directly: it also runs the dashboard's
# Vite build, which writes dist/dashboard. Running only `nest build` here is
# what makes /dashboard 404 in the image while working locally.
RUN pnpm build


FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable
# tini: PID 1 init that reaps orphaned grandchildren (codex-linux-sandbox)
# spawned by the codex CLI. Without it Node leaks zombies until cgroup
# pids.max is hit and new threads fail to spawn (EAGAIN).
RUN apk add --no-cache git ca-certificates curl tini

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY dashboard/package.json ./dashboard/
# The dashboard ships as built static assets under dist/. Every one of its
# dependencies is a devDependency, so --prod installs nothing for it and the
# runtime production set is unchanged by the rewrite.
RUN pnpm install --prod --frozen-lockfile
# renovate: datasource=npm depName=@openai/codex
RUN npm install -g @openai/codex@0.154.0

COPY --from=build /app/dist ./dist

# Declared inside this stage: a pre-FROM ARG is out of scope here and would
# silently resolve to empty. Kept last so a new SHA only busts this layer.
ARG GIT_COMMIT_HASH=unknown
ENV GIT_COMMIT_HASH=$GIT_COMMIT_HASH

EXPOSE 3000
EXPOSE 9463

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main"]
