# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3.14-alpine AS manifests
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/extension/package.json apps/extension/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/site/package.json apps/site/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/client/package.json packages/client/package.json
COPY packages/plugin-api/package.json packages/plugin-api/package.json
COPY packages/public-network/package.json packages/public-network/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/wrangler/package.json packages/wrangler/package.json
COPY patches patches

FROM manifests AS dependencies
RUN bun install --frozen-lockfile \
  --filter edgeever \
  --filter @edgeever/api \
  --filter @edgeever/public-network \
  --filter @edgeever/web

FROM dependencies AS build
COPY apps/api apps/api
COPY apps/web apps/web
COPY packages packages
COPY docs docs
COPY release-summary.json release-summary.json
COPY scripts/self-hosted-config.mjs scripts/self-hosted-secrets.mjs scripts/self-hosted-server.mjs scripts/
COPY tsconfig.json tailwind.config.ts ./
RUN bun run build:web && bun run build:self-hosted

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
ARG EDGE_EVER_BUILD_ID=unknown
ENV NODE_ENV=production \
    EDGE_EVER_BUILD_ID=${EDGE_EVER_BUILD_ID} \
    EDGE_EVER_DATA_DIR=/data \
    EDGE_EVER_WEB_DIR=/app/apps/web/dist \
    PORT=8787

LABEL org.opencontainers.image.title="EdgeEver" \
      org.opencontainers.image.description="Self-hosted notes and knowledge management" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

COPY --from=build /app/dist/self-hosted/self-hosted-server.js ./scripts/self-hosted-server.js
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY migrations ./migrations
COPY LICENSE ./LICENSE

RUN mkdir -p /data && chown -R bun:bun /data
USER bun
VOLUME ["/data"]
EXPOSE 8787
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "const r=await fetch('http://127.0.0.1:8787/api/health');if(!r.ok)process.exit(1)"
CMD ["bun", "scripts/self-hosted-server.js"]
