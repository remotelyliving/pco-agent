FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Production deps only — used for prisma CLI at container startup
FROM base AS prod-deps
WORKDIR /app
COPY --from=deps /app/package.json ./
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --omit=dev

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Production node_modules first (includes prisma CLI + all transitive deps)
COPY --from=prod-deps /app/node_modules ./node_modules
# Next.js standalone output overwrites with its optimized bundles
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

RUN mkdir -p /data/uploads && chown nextjs:nodejs /data/uploads

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["./entrypoint.sh"]
