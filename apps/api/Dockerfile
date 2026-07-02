FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate && pnpm install --filter @classsphere/api... --no-frozen-lockfile

FROM deps AS build
COPY . .
RUN corepack enable && pnpm --filter @classsphere/api prisma:generate && pnpm --filter @classsphere/shared build && pnpm --filter @classsphere/api build

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
EXPOSE 4000
CMD ["node", "dist/main.js"]
