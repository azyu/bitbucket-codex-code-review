FROM node:24-alpine AS deps

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile


FROM node:24-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN ./node_modules/.bin/nest build


FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable
RUN apk add --no-cache git ca-certificates

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
RUN npm install -g @openai/codex@latest

COPY --from=build /app/dist ./dist

EXPOSE 3000
EXPOSE 9463

CMD ["node", "dist/main"]
