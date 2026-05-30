# ── Stage 1: Build frontend ────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY app/package*.json ./
RUN npm ci
COPY app/ .
RUN npm run build

# ── Stage 2: Proxy + static server ────────────────────────────────────────────
FROM node:20-slim
WORKDIR /app
COPY proxy/package*.json ./
RUN npm ci --omit=dev
COPY proxy/server.js .
COPY --from=frontend-builder /build/dist ./public
EXPOSE 3001
CMD ["node", "server.js"]
