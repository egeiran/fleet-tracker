# syntax=docker/dockerfile:1
# Build context: repository root (run `fly deploy --config apps/ingest/fly.toml` from the root).
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/ingest/package.json apps/ingest/
COPY packages/domain/package.json packages/domain/
COPY packages/mock/package.json packages/mock/
RUN pnpm install --frozen-lockfile --filter @vakt/ingest...
COPY packages ./packages
COPY apps/ingest ./apps/ingest
RUN pnpm --filter @vakt/ingest build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8080 DB_PATH=/data/ingest.sqlite
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY --from=build /repo/apps/ingest/dist/index.js ./index.js
USER node
EXPOSE 8080
CMD ["node", "--no-warnings=ExperimentalWarning", "index.js"]
