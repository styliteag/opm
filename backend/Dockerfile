FROM python:3.12-slim AS builder

WORKDIR /app

# Install uv for dependency management
RUN pip install --no-cache-dir uv

# Install dependencies
COPY pyproject.toml ./
COPY uv.lock* ./
RUN uv sync --no-dev --frozen || uv sync --no-dev

# Copy source for production image (now includes migrations)
COPY src ./src
COPY alembic.ini ./

FROM python:3.12-slim AS runtime

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app/src"

# Install uv in runtime as well (needed for 'uv run' in start.sh)
RUN pip install --no-cache-dir uv

# Copy virtual environment and source code
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/src /app/src
COPY --from=builder /app/alembic.ini /app/alembic.ini

# Copy startup script
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 8000

CMD ["./start.sh"]
