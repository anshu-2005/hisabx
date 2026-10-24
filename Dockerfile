# ==============================================================================
# HisabX Production SaaS Dockerfile
# Multi-stage optimized Node.js runtime
# ==============================================================================

FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Install dependencies first for efficient caching
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts

# Copy application assets and services
COPY server.js ./
COPY database.js ./
COPY authService.js ./
COPY hisabx_app.html ./
COPY api/ ./api/

# Ensure data directory exists with write permissions
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
