# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web
RUN npm run build

FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
# Only the server's runtime dependencies; the web app ships as static files.
RUN npm ci --omit=dev --workspace @mieru/server --include-workspace-root=false --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STORAGE_DIR=/var/lib/mieru/storage \
    WEB_DIST_DIR=/app/apps/web/dist
# Fixed UID/GID so the bind-mounted storage directory on the host can be chowned once.
RUN groupadd --system --gid 10001 mieru \
 && useradd --system --uid 10001 --gid mieru --home-dir /app --shell /usr/sbin/nologin mieru \
 && mkdir -p /var/lib/mieru/storage \
 && chown -R mieru:mieru /var/lib/mieru
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/migrations apps/server/migrations
COPY --from=build /app/apps/server/assets apps/server/assets
COPY --from=build /app/apps/web/dist apps/web/dist
USER mieru
WORKDIR /app/apps/server
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["sh", "-c", "node dist/scripts/migrate.js && exec node dist/src/server.js"]
