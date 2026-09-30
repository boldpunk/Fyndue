# Fyndue production image (docs/deployment.md).
# One image runs the web app, the migration step and the Telegram webhook
# setup; the database and documents live in volumes, never in the image.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# lib/env.ts validates at import time; the build only needs placeholders.
# Real values are supplied at runtime by docker compose.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder-secret-0000000000 \
    BETTER_AUTH_URL=http://localhost:3000 \
    pnpm build \
 && rm -rf .next/cache node_modules/.pnpm/@embedded-postgres*

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 STORAGE_DIR=/app/storage
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
EXPOSE 3000
# No pnpm at runtime: binaries are called directly (no corepack download on start).
ENV PATH=/app/node_modules/.bin:$PATH
CMD ["next", "start"]
