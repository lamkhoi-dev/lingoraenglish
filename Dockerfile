FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NITRO_PRESET=node-server
# Which Paddle environment the site talks to is fixed at BUILD time by the prefix
# of this client token (test_ = sandbox, live_ = live; src/lib/payments-env.ts).
# By default it comes from .env.production (live). `deploy.bat sandbox` passes the
# test_ token from .env.development here instead, which overrides that file.
# The guard matters: Vite lets an env var beat .env.production even when it is
# EMPTY, so an unset build arg must be removed, not passed through as "".
ARG VITE_PAYMENTS_CLIENT_TOKEN
RUN [ -n "$VITE_PAYMENTS_CLIENT_TOKEN" ] || unset VITE_PAYMENTS_CLIENT_TOKEN; bun run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
COPY --from=builder --chown=node:node /app/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
