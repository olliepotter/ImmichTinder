# syntax=docker/dockerfile:1
#
# ImmichTinder: multi-stage image for the Nuxt 4 / Nitro server.
#
# Base: Debian bookworm-slim (glibc). better-sqlite3 ships prebuilt binaries for
# both glibc and musl, but glibc is its most widely used and tested target, and
# Debian needs no musl compatibility shims. The build stage also carries a C++
# toolchain so `npm ci` can fall back to node-gyp if a prebuild download fails.
#
# Build and runtime stages MUST use the same base (libc + Node ABI): the native
# addon fetched in the build stage reaches the runtime image inside Nitro's
# traced `.output/server/node_modules`.
#
# Build args:
#   NODE_VERSION   Node.js major.minor tag (default 22.23)
#   APP_UID/GID    runtime user ids (default 568:568 = TrueNAS SCALE "apps")
#   VERSION/REVISION  written into the OCI labels (set by CI)

ARG NODE_VERSION=22.23

# ---------------------------------------------------------------------------
# Build stage
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS build

# Toolchain is only used if better-sqlite3 has to compile from source.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates python3 make g++

WORKDIR /app

ENV NUXT_TELEMETRY_DISABLED=1

# Dependencies first, so this layer stays cached until the lockfile changes.
# `postinstall` runs `nuxt prepare`, which needs the Nuxt config files.
COPY package.json package-lock.json .nuxtrc nuxt.config.ts tsconfig.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY . .

# Build, then fail early if Nitro did not trace the native SQLite addon.
RUN npm run build \
    && if [ -z "$(find .output/server/node_modules -name better_sqlite3.node -print -quit)" ]; then \
         echo 'better_sqlite3.node is missing from .output/server/node_modules' >&2; exit 1; \
       fi

# ---------------------------------------------------------------------------
# Runtime stage
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ARG APP_UID=568
ARG APP_GID=568
ARG VERSION=dev
ARG REVISION=unknown

LABEL org.opencontainers.image.title="ImmichTinder" \
      org.opencontainers.image.description="Tinder-style photo review for Immich: keep, favourite or move to Immich trash (never permanent delete)." \
      org.opencontainers.image.source="https://github.com/olliepotter/ImmichTinder" \
      org.opencontainers.image.url="https://github.com/olliepotter/ImmichTinder" \
      org.opencontainers.image.documentation="https://github.com/olliepotter/ImmichTinder/blob/main/docs/deployment.md" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

# tini as PID 1 forwards SIGTERM to node and reaps zombies.
# The fixed UID/GID must match the owner of the /data bind mount on the host.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && groupadd --system --gid "${APP_GID}" app \
    && useradd --system --uid "${APP_UID}" --gid "${APP_GID}" \
       --home-dir /app --no-create-home --shell /usr/sbin/nologin app \
    && mkdir -p /data \
    && chown "${APP_UID}:${APP_GID}" /data

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NUXT_DATABASE_PATH=/data/immich-tinder.db

# Only the self-contained Nitro output. Left root-owned so the app user
# cannot modify its own code.
COPY --from=build /app/.output ./.output

VOLUME ["/data"]
EXPOSE 3000

USER ${APP_UID}:${APP_GID}

# No curl in slim images: use Node's built-in fetch. /api/health returns 503
# when the database is down (200 even if Immich is unreachable).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", ".output/server/index.mjs"]
