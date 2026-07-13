# syntax=docker/dockerfile:1

# ---- Base ----------------------------------------------------------------
# Node 22 (Alpine) — matches Next.js 16 runtime requirements.
FROM node:22-alpine AS base
WORKDIR /app

# ---- Dependencies --------------------------------------------------------
# Install ALL dependencies (incl. dev) with the toolchain needed to compile
# the native better-sqlite3 module against musl libc.
FROM base AS deps
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
RUN npm ci

# ---- Builder -------------------------------------------------------------
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Runner --------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3010 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data

# Runtime tools: wget (busybox) is available for the healthcheck; tini for
# correct signal handling / zombie reaping.
RUN apk add --no-cache tini

# Copy the standalone server output. `output: 'standalone'` produces a minimal
# node_modules (including the traced native better-sqlite3 build).
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Persistent data directory (SQLite DB + per-user markdown files).
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
