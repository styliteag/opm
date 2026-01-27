# Developer Setup Guide

This guide walks you through setting up a development environment for Open Port Monitor.

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

| Software | Minimum Version | Purpose |
|----------|-----------------|---------|
| Docker | 24.0+ | Container runtime |
| Docker Compose | 2.20+ | Multi-container orchestration |
| Git | 2.40+ | Version control |

### Verify Installation

```bash
# Check Docker version
docker --version
# Expected: Docker version 24.x.x or higher

# Check Docker Compose version
docker compose version
# Expected: Docker Compose version v2.20.x or higher

# Check Git version
git --version
# Expected: git version 2.40.x or higher
```

### Optional (for local development outside containers)

| Software | Version | Purpose |
|----------|---------|---------|
| Python | 3.12+ | Backend development |
| Node.js | 20+ | Frontend development |
| Bun | 1.0+ | Frontend package manager (alternative to npm) |
| uv | Latest | Python package manager |

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd open-port-monitor
```

### 2. Configure Environment Variables

```bash
# Copy the example environment file
cp .env.example .env
```

Review and modify `.env` as needed. Key variables for development:

```bash
# Database (defaults work for development)
DB_ROOT_PASSWORD=rootpassword
DB_NAME=openportmonitor
DB_USER=opm
DB_PASSWORD=opmpassword

# Backend
JWT_SECRET=dev-secret-change-in-production  # OK for dev, change for production
JWT_EXPIRATION_MINUTES=60
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin

# Scanner (leave API_KEY empty initially - create via UI after first login)
SCANNER_API_KEY=
```

### 3. Start the Development Environment

```bash
# Build and start all services
docker compose -f compose-dev.yml up --build

# Or run in detached mode (background)
docker compose -f compose-dev.yml up --build -d
```

### 4. Access the Services

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:5173 | React web dashboard |
| Backend API | http://localhost:8000 | FastAPI REST API |
| API Docs | http://localhost:8000/docs | Interactive Swagger UI |
| Database | localhost:3306 | MariaDB (use MySQL client) |

### 5. Initial Login

Log in with the default admin credentials:
- Email: `admin@example.com`
- Password: `admin`

> **Note**: Change these credentials in production deployments.

## Development Environment Details

### Service Architecture

The development environment consists of four services defined in `compose-dev.yml`:

```yaml
services:
  db:        # MariaDB 11 database
  backend:   # FastAPI application (Python 3.12)
  frontend:  # React + Vite application (Bun runtime)
  scanner:   # Network scanner agent (Python 3.12)
```

### Hot-Reloading

All services support hot-reloading through Docker bind mounts:

| Service | Local Path | Container Path | Reload Method |
|---------|------------|----------------|---------------|
| Backend | `./backend/src` | `/app/src` | uvicorn `--reload` |
| Frontend | `./frontend/src` | `/app/src` | Vite HMR |
| Scanner | `./scanner/src` | `/app/src` | Manual restart |

#### Backend Hot-Reload

The backend uses uvicorn with the `--reload` flag. Changes to Python files in `backend/src/` are detected automatically:

```bash
# View backend logs to confirm reload
docker compose -f compose-dev.yml logs -f backend
```

When you save a file, you'll see:
```
WARNING:  WatchFiles detected changes in 'src/app/routes/alerts.py'. Reloading...
INFO:     Application startup complete.
```

#### Frontend Hot-Reload

The frontend uses Vite's Hot Module Replacement (HMR). Changes to files in `frontend/src/` update in the browser instantly without a full page refresh.

#### Scanner Hot-Reload

The scanner does not have automatic hot-reload. After making changes to scanner code:

```bash
# Restart the scanner container
docker compose -f compose-dev.yml restart scanner
```

## Database Migrations

The project uses Alembic for database schema migrations.

### Schema Initialization

The database schema is automatically initialized on backend startup via SQLAlchemy's `metadata.create_all()`. Existing migrations are applied automatically.

### Running Migrations Manually

To run migrations inside the backend container:

```bash
# Enter the backend container
docker compose -f compose-dev.yml exec backend bash

# View current migration status
uv run alembic current

# Apply all pending migrations
uv run alembic upgrade head

# Rollback one migration
uv run alembic downgrade -1

# Rollback to specific revision
uv run alembic downgrade <revision_id>
```

### Creating New Migrations

When you modify SQLAlchemy models, create a migration:

```bash
# Enter the backend container
docker compose -f compose-dev.yml exec backend bash

# Auto-generate migration from model changes
uv run alembic revision --autogenerate -m "Add new_field to table_name"

# Or create an empty migration for manual editing
uv run alembic revision -m "Manual migration description"
```

Migration files are created in `backend/src/migrations/versions/`.

### Migration Best Practices

1. Always review auto-generated migrations before applying
2. Use `IF NOT EXISTS` for table/index creation
3. Test migrations on a copy of production data before deploying
4. Keep migrations small and focused on single changes

## Running Tests

### Backend Tests

The backend uses pytest with pytest-asyncio for async test support.

```bash
# Enter the backend container
docker compose -f compose-dev.yml exec backend bash

# Run all tests
uv run pytest

# Run with verbose output
uv run pytest -v

# Run specific test file
uv run pytest src/tests/test_auth.py

# Run with coverage
uv run pytest --cov=src/app
```

### Frontend Tests

The frontend uses standard React testing patterns. Run from the frontend directory:

```bash
# Enter the frontend container
docker compose -f compose-dev.yml exec frontend bash

# Run tests (if configured)
bun test

# Or from host with Node.js installed
cd frontend
npm test
```

### Type Checking

#### Backend (mypy)

```bash
# From backend container or host with dev dependencies
cd backend
uv run mypy src/app
```

#### Frontend (TypeScript)

```bash
# From frontend container
cd frontend
npm run typecheck

# Or with bun
bun run typecheck
```

## Code Quality

### Linting

#### Backend (ruff)

```bash
cd backend

# Check for issues
uv run ruff check src/

# Auto-fix issues
uv run ruff check --fix src/

# Format code
uv run ruff format src/
```

#### Frontend (ESLint)

```bash
cd frontend

# Run linter
npm run lint

# Or with bun
bun run lint
```

### Formatting

#### Frontend (Prettier)

```bash
cd frontend
npm run format
```

## Working with the Scanner

### Creating a Scanner API Key

1. Log into the web UI at http://localhost:5173
2. Navigate to Settings > Scanners
3. Click "Add Scanner" and provide a name
4. Copy the generated API key (shown only once)

### Configuring the Development Scanner

Update your `.env` file with the scanner API key:

```bash
SCANNER_API_KEY=your-generated-api-key
```

Then restart the scanner:

```bash
docker compose -f compose-dev.yml restart scanner
```

### Viewing Scanner Logs

```bash
# Follow scanner logs
docker compose -f compose-dev.yml logs -f scanner

# View recent logs
docker compose -f compose-dev.yml logs --tail=100 scanner
```

## Troubleshooting

### Database Connection Issues

**Symptom**: Backend fails to start with database connection errors.

**Solutions**:
1. Wait for the database to be ready (health check takes ~30 seconds)
2. Check database logs: `docker compose -f compose-dev.yml logs db`
3. Verify database credentials in `.env` match `compose-dev.yml`

```bash
# Reset database completely
docker compose -f compose-dev.yml down -v
docker compose -f compose-dev.yml up --build
```

### Port Conflicts

**Symptom**: "Port already in use" errors.

**Solutions**:
```bash
# Check what's using the ports
lsof -i :5173  # Frontend
lsof -i :8000  # Backend
lsof -i :3306  # Database

# Stop conflicting services or change ports in compose-dev.yml
```

### Hot-Reload Not Working

**Symptom**: Changes to source files not reflected.

**Solutions**:

1. **Backend**: Check uvicorn logs for reload messages
2. **Frontend**: Clear browser cache or hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
3. **Volume mounts**: Ensure paths in `compose-dev.yml` match your local structure

```bash
# Verify bind mounts are working
docker compose -f compose-dev.yml exec backend ls -la /app/src
docker compose -f compose-dev.yml exec frontend ls -la /app/src
```

### Container Build Failures

**Symptom**: Docker build fails with dependency errors.

**Solutions**:
```bash
# Clean build (no cache)
docker compose -f compose-dev.yml build --no-cache

# Remove all containers and volumes
docker compose -f compose-dev.yml down -v

# Prune Docker system (careful - removes unused resources)
docker system prune -a
```

### Permission Errors on Linux

**Symptom**: Permission denied when writing to mounted volumes.

**Solutions**:
```bash
# Fix ownership of project directories
sudo chown -R $USER:$USER backend/src frontend/src scanner/src

# Or run containers with current user
# Add to docker-compose: user: "${UID}:${GID}"
```

### Scanner Cannot Perform Scans

**Symptom**: Scanner connected but scans fail with permission errors.

**Cause**: Missing network capabilities.

**Solution**: Verify `compose-dev.yml` includes:
```yaml
scanner:
  cap_add:
    - NET_RAW
    - NET_ADMIN
```

### Alembic Migration Errors

**Symptom**: "Target database is not up to date" or revision conflicts.

**Solutions**:
```bash
# Check current state
docker compose -f compose-dev.yml exec backend uv run alembic current

# Mark current state as head (if schema is correct but alembic is confused)
docker compose -f compose-dev.yml exec backend uv run alembic stamp head

# View history
docker compose -f compose-dev.yml exec backend uv run alembic history
```

## Useful Commands Reference

```bash
# Start development environment
docker compose -f compose-dev.yml up --build

# Stop all services
docker compose -f compose-dev.yml down

# View logs for all services
docker compose -f compose-dev.yml logs -f

# View logs for specific service
docker compose -f compose-dev.yml logs -f backend

# Restart a specific service
docker compose -f compose-dev.yml restart backend

# Enter a container shell
docker compose -f compose-dev.yml exec backend bash
docker compose -f compose-dev.yml exec frontend sh

# Run backend typecheck
docker compose -f compose-dev.yml exec backend uv run mypy src/app

# Run frontend typecheck
docker compose -f compose-dev.yml exec frontend npm run typecheck

# Database shell
docker compose -f compose-dev.yml exec db mysql -u opm -popmpassword openportmonitor
```

## Next Steps

- Review the [Architecture Overview](architecture.md) to understand the system design
- Check the [Contributing Guidelines](contributing.md) for code standards
- Explore the [API Documentation](../api/overview.md) for backend endpoints
