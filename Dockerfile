# ── Stage 1: Build the React client ───────────────────────────────────────────
FROM node:20-alpine AS client-builder

# Work directly inside the client folder — Vite must run from here
WORKDIR /app/client

# Install deps as a separate cached layer
COPY client/package.json ./
RUN npm install

# Copy full client source, then build
COPY client/ ./
RUN npm run build
# Output lands in /app/client/dist

# ── Stage 2: Production server ─────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app/server

# Install server production deps (cached layer)
COPY server/package.json ./
RUN npm install --omit=dev

# Copy server source and shared constants
COPY server/ ./
COPY shared/ /app/shared/

# Grab the built React app from stage 1
COPY --from=client-builder /app/client/dist /app/client/dist

RUN chmod +x /app/server/docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3001

ENTRYPOINT ["sh", "/app/server/docker-entrypoint.sh"]
