# ── Stage 1: Production server ─────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app/server

# Install server production deps (cached layer)
COPY server/package.json ./
RUN npm install --omit=dev

# Copy server source and shared constants
COPY server/ ./
COPY shared/ /app/shared/

# Copy the pre-built React client dist
COPY client/dist /app/client/dist

RUN chmod +x /app/server/docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3001

ENTRYPOINT ["sh", "/app/server/docker-entrypoint.sh"]
