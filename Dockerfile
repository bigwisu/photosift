# Multi-stage build for PhotoSift

# Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY src/frontend/package*.json ./
RUN npm install
COPY src/frontend/ ./
RUN npm run build

# Stage 2: Production image
FROM node:18-alpine
WORKDIR /app

# Install Sharp dependencies for HEIC conversion
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    vips-dev \
    libheif-dev \
    libde265-dev

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy backend source
COPY src/server/ ./src/server/

# Copy built frontend from previous stage
COPY --from=frontend-builder /app/frontend/build ./src/frontend/build

# Create volume mount points
RUN mkdir -p /app/data /target /input /duplicates

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/photos.db
ENV TARGET_DIR=/target
ENV INPUT_DIR=/input
ENV DUPLICATES_DIR=/duplicates
ENV INDEXER_THROTTLE_MS=500
ENV HEIC_CONVERT_QUALITY=90

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "src/server/index.js"]

# Made with Bob
