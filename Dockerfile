# syntax=docker/dockerfile:1
FROM node:20-slim AS base
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/engine/package.json packages/engine/

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY . .
RUN pnpm -r build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV STATIC_DIR=/app/apps/web/dist

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY --from=base /app/node_modules /app/node_modules
COPY --from=build /app/apps/server/dist /app/apps/server/dist
COPY --from=build /app/apps/web/dist /app/apps/web/dist
COPY --from=build /app/packages/engine/dist /app/packages/engine/dist
COPY apps/server/package.json apps/server/
COPY packages/engine/package.json packages/engine/

EXPOSE 3001
CMD ["node", "apps/server/dist/index.js"]
