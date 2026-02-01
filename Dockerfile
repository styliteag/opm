# Multi-stage build for combined frontend + backend container

ARG VERSION=unknown

# Stage 1: Frontend builder
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json ./
RUN npm install

COPY frontend/ ./

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL:-}

ARG VERSION=unknown
ARG VITE_APP_VERSION=${VERSION}
ENV VITE_APP_VERSION=${VITE_APP_VERSION}

RUN npm run build

# Stage 2: Backend builder
FROM python:3.12-slim AS backend-builder

WORKDIR /app

# Install uv for dependency management
RUN pip install --no-cache-dir uv

# Install dependencies
COPY backend/pyproject.toml ./
COPY backend/uv.lock* ./
RUN uv sync --no-dev --frozen || uv sync --no-dev

# Copy source for production image
COPY backend/src ./src
COPY backend/alembic.ini ./

# Stage 3: Runtime
FROM python:3.12-slim AS runtime

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app/src"

# Install nginx, wget, bash, and uv
RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx wget bash && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    pip install --no-cache-dir uv

# Copy backend virtual environment and source
COPY --from=backend-builder /app/.venv /app/.venv
COPY --from=backend-builder /app/src /app/src
COPY --from=backend-builder /app/alembic.ini /app/alembic.ini

# Copy backend startup script and scripts
COPY backend/start.sh ./start.sh
RUN chmod +x start.sh
COPY backend/scripts/wait-for-db.py ./scripts/wait-for-db.py
COPY backend/scripts/init_admin.py ./scripts/init_admin.py
RUN chmod +x ./scripts/wait-for-db.py ./scripts/init_admin.py

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Copy nginx configuration
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default

# Copy combined startup script
COPY docker/start.sh /app/docker-start.sh
RUN chmod +x /app/docker-start.sh

ARG VERSION=unknown
ENV APP_VERSION=${VERSION}

# Copy VERSION file into image (baked at build time) - LAST STEP for better caching
# VERSION file should exist in build context when using push-to-registry.sh
# Build arg VERSION is also passed as backup
COPY VERSION /app/VERSION.build
RUN cp /app/VERSION.build /app/VERSION || echo "${VERSION:-unknown}" > /app/VERSION

EXPOSE 80

CMD ["/app/docker-start.sh"]
