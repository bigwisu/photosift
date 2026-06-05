# Multi-stage build for PhotoSift

# Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY src/frontend/package*.json ./
RUN npm ci
COPY src/frontend/ ./
RUN npm run build

# Stage 2: Production image
FROM node:18-alpine
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy backend source
COPY src/server/ ./src/server/

# Copy built frontend from previous stage
COPY --from=frontend-builder /app/frontend/build ./src/frontend/build

# Create volume mount points
RUN mkdir -p /app/data /target /input

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/photos.db
ENV TARGET_DIR=/target
ENV INPUT_DIR=/input
ENV INDEXER_THROTTLE_MS=500

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "src/server/index.js"]

# Made with Bob
