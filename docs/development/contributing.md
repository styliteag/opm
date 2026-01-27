# Contributing to Open Port Monitor

This guide covers code standards, commit conventions, and the pull request process for contributing to Open Port Monitor.

## Code Style

### Python (Backend & Scanner)

Both the backend and scanner use **ruff** for linting and formatting.

**Configuration** (in `pyproject.toml`):
- Target: Python 3.12
- Line length: 100 characters
- Rules: `E` (errors), `F` (pyflakes), `I` (isort), `W` (warnings)

**Commands:**

```bash
# Run linter (inside container)
docker compose exec backend uv run ruff check src/

# Run linter with auto-fix
docker compose exec backend uv run ruff check --fix src/

# Format code
docker compose exec backend uv run ruff format src/

# Same commands for scanner
docker compose exec scanner uv run ruff check src/
docker compose exec scanner uv run ruff format src/
```

**Type Checking:**

Both backend and scanner use **mypy** in strict mode with Pydantic plugin support.

```bash
# Backend type check
docker compose exec backend uv run mypy src/

# Scanner type check
docker compose exec scanner uv run mypy src/
```

### TypeScript (Frontend)

The frontend uses **ESLint** with TypeScript support and **Prettier** for formatting.

**ESLint Configuration** (`eslint.config.js`):
- Uses `@eslint/js` recommended rules
- Uses `typescript-eslint` recommended rules
- Includes `react-hooks` and `react-refresh` plugins
- Integrates with Prettier to avoid conflicts

**Prettier Configuration** (`.prettierrc.json`):
```json
{
  "singleQuote": true,
  "semi": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

**Commands:**

```bash
# Run ESLint
cd frontend && bun run lint

# Format with Prettier
cd frontend && bun run format

# Type check
cd frontend && bun run typecheck
```

## Commit Message Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

### Format

```
<type>: <description>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature or functionality |
| `fix` | Bug fix |
| `docs` | Documentation changes only |
| `style` | Code style changes (formatting, whitespace) |
| `refactor` | Code changes that neither fix bugs nor add features |
| `test` | Adding or modifying tests |
| `chore` | Build process, dependencies, or tooling changes |

### Examples

```
feat: Add bulk alert acknowledgment endpoint
fix: Resolve race condition in scan job claiming
docs: Document scanner authentication flow
refactor: Extract scan result processing into separate service
chore: Update FastAPI to 0.115.0
```

### Guidelines

- Keep the description under 72 characters
- Use imperative mood ("Add feature" not "Added feature")
- Don't end with a period
- Reference issue numbers when applicable: `fix: Resolve login timeout (#123)`

## Pull Request Process

### Before Opening a PR

1. **Create a feature branch** from `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the code style guidelines above

3. **Run all quality checks** locally:
   ```bash
   # Backend
   docker compose exec backend uv run ruff check src/
   docker compose exec backend uv run mypy src/

   # Frontend
   cd frontend && bun run lint
   cd frontend && bun run typecheck
   ```

4. **Commit your changes** following the commit message conventions

5. **Push your branch**:
   ```bash
   git push -u origin feature/your-feature-name
   ```

### Opening the PR

1. Open a pull request against the `main` branch
2. Fill out the PR template with:
   - A clear description of what the PR does
   - Any related issue numbers
   - Screenshots for UI changes
   - Notes on testing performed

### Review Expectations

- All automated checks must pass (lint, typecheck)
- Code should follow existing patterns in the codebase
- PRs should be focused - avoid mixing unrelated changes
- Documentation should be updated if behavior changes
- Be responsive to review feedback

### After Approval

- PRs are merged via squash merge to keep history clean
- Delete your feature branch after merging

## Testing Requirements

### What Needs Tests

- **API endpoints**: Test request/response handling, validation, and error cases
- **Services**: Test business logic and data transformations
- **Utilities**: Test helper functions with various inputs

### Backend Testing

The backend uses **pytest** with **pytest-asyncio** for async test support.

```bash
# Run all backend tests
docker compose exec backend uv run pytest

# Run specific test file
docker compose exec backend uv run pytest tests/test_auth.py

# Run with verbose output
docker compose exec backend uv run pytest -v

# Run with coverage
docker compose exec backend uv run pytest --cov=app
```

Test files should be placed in `backend/tests/` and follow the naming convention `test_*.py`.

### Frontend Testing

The frontend uses standard React testing patterns.

```bash
# Run frontend tests
cd frontend && bun test

# Run with watch mode
cd frontend && bun test --watch
```

### Writing Good Tests

1. **Test one thing per test** - Keep tests focused and readable
2. **Use descriptive names** - `test_login_returns_401_for_invalid_credentials`
3. **Arrange-Act-Assert** - Structure tests clearly
4. **Test edge cases** - Empty inputs, invalid data, boundary conditions
5. **Mock external dependencies** - Don't rely on external services in unit tests

## Development Workflow Summary

```
1. Create feature branch from main
2. Make changes following code style
3. Run linters and type checks
4. Write/update tests as needed
5. Commit with conventional commit message
6. Push and open PR
7. Address review feedback
8. Merge after approval
```

## Getting Help

- Check existing documentation in `docs/`
- Look at similar code in the codebase for patterns
- Ask questions in PR comments or issues
