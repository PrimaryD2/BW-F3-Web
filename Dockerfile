# ── Stage 1: Build React client ─────────────────────────────────────────────────
FROM node:20-alpine AS client-builder

WORKDIR /app/client

COPY client/package.json ./
RUN npm install

COPY client/ ./
RUN npm run build

# ── Stage 2: Production server ─────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app/server

# Install server production deps (cached layer)
COPY server/package.json ./
RUN npm install --omit=dev

# Copy server source and shared constants
COPY server/ ./
COPY shared/ /app/shared/

# Copy the freshly built React client dist from stage 1
COPY --from=client-builder /app/client/dist /app/client/dist

RUN chmod +x /app/server/docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3001

ENTRYPOINT ["sh", "/app/server/docker-entrypoint.sh"]
