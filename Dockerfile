# ── Stage 1: Build the React client ───────────────────────────────────────────
FROM node:20-alpine AS client-builder

# Set working dir to the client folder so Vite runs in the right place
WORKDIR /app/client

# Install deps (separate layer — cached unless package.json changes)
COPY client/package.json ./
RUN npm install

# Copy the full client source, then build
COPY client/ ./
RUN npm run build
# Output: /app/client/dist

# ── Stage 2: Production server ─────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app/server

# Install server production deps (cached layer)
COPY server/package.json ./
RUN npm install --omit=dev

# Copy server source and shared constants
COPY server/ ./
COPY shared/ /app/shared/

# Copy the built React app from stage 1
COPY --from=client-builder /app/client/dist /app/client/dist

# Ensure entrypoint is executable
RUN chmod +x /app/server/docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3001

# Entrypoint: waits for DB, runs migrate+seed, then starts Express
ENTRYPOINT ["sh", "/app/server/docker-entrypoint.sh"]
