FROM node:26.13-bookworm-slim AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8.14.1 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build && pnpm prune --prod

FROM node:26.13-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

RUN mkdir -p /archive && chown node:node /archive
USER node

VOLUME ["/archive"]
ENTRYPOINT ["node", "dist/app.js"]
CMD ["--out", "/archive"]
