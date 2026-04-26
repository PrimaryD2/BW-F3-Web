# ── Stage 1: Build the React client ───────────────────────────────────────────
FROM node:20-alpine AS client-builder
WORKDIR /build

COPY client/package.json ./client/
RUN cd client && npm install

COPY client/  ./client/
COPY shared/  ./shared/
RUN cd client && npm run build

# ── Stage 2: Production server ─────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

COPY server/package.json ./server/
RUN cd server && npm install --omit=dev

COPY server/  ./server/
COPY shared/  ./shared/

# Copy built React app from Stage 1
COPY --from=client-builder /build/client/dist ./client/dist

RUN chmod +x /app/server/docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3001

WORKDIR /app/server
ENTRYPOINT ["sh", "docker-entrypoint.sh"]
