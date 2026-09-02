FROM oven/bun:1.3.7-debian AS dependencies

WORKDIR /workspace
COPY package.json bun.lock ./
COPY apps/remote-mcp/package.json ./apps/remote-mcp/package.json
COPY packages/cli/package.json ./packages/cli/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/local-mcp/package.json ./packages/local-mcp/package.json
COPY packages/workflow-contract/package.json ./packages/workflow-contract/package.json
COPY apps/workflow-worker/package.json ./apps/workflow-worker/package.json
COPY apps/workflow-web/package.json ./apps/workflow-web/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS test-dependencies

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN ./node_modules/.bin/playwright install --with-deps chromium

FROM test-dependencies AS build

COPY packages/workflow-contract ./packages/workflow-contract
COPY apps/workflow-worker ./apps/workflow-worker
RUN bun run --filter @cwa-dev/sendkit-workflow-contract build \
  && bun test packages/workflow-contract/tests apps/workflow-worker/tests \
  && bun run --filter @cwa-dev/sendkit-workflow-worker build

FROM oven/bun:1.3.7-debian AS production-dependencies

WORKDIR /workspace
COPY package.json bun.lock ./
COPY apps/remote-mcp/package.json ./apps/remote-mcp/package.json
COPY packages/cli/package.json ./packages/cli/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/local-mcp/package.json ./packages/local-mcp/package.json
COPY packages/workflow-contract/package.json ./packages/workflow-contract/package.json
COPY apps/workflow-worker/package.json ./apps/workflow-worker/package.json
COPY apps/workflow-web/package.json ./apps/workflow-web/package.json
RUN bun install --frozen-lockfile --production --filter @cwa-dev/sendkit-workflow-worker

FROM node:22-bookworm-slim AS release

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PORT=8787
ENV ARTIFACTS_ROOT=/app/.local-data/artifacts

WORKDIR /app
COPY --from=production-dependencies /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/workflow-worker/dist ./dist
COPY --from=build /workspace/apps/workflow-worker/sql ./sql
RUN node node_modules/playwright/cli.js install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/* /root/.npm /root/.cache
RUN mkdir -p /app/.local-data/artifacts

EXPOSE 8787
CMD ["node", "dist/server.js"]
