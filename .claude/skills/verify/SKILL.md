---
name: verify
description: Run all local quality checks (typecheck, lint, tests) for backend and/or frontend. Use before committing or to validate changes.
---

Run quality checks for the components that were modified. Check git status to determine which components changed, then run only the relevant checks.

## Backend (if files in backend/ changed)

Run from the `backend/` directory:

```bash
cd backend && uv run --extra dev mypy src/
cd backend && uv run ruff check src/
cd backend && uv run --extra dev pytest
```

If ruff reports fixable issues, run `cd backend && uv run ruff check src/ --fix` and show what was fixed.

## Frontend (if files in frontend/ changed)

Run from the `frontend/` directory (requires `npm install` if `node_modules/` is missing):

```bash
cd frontend && npm run typecheck
cd frontend && npm run lint
cd frontend && npm run test
```

## Scanner (if files in scanner/ changed)

Run from the `scanner/` directory:

```bash
cd scanner && uv run mypy src/
```

## Reporting

After all checks complete, report a summary:
- Which components were checked
- Pass/fail status for each check
- For failures: show the relevant error output and suggest fixes

If all checks pass, confirm the changes are ready to commit. Remind to update CHANGELOG.md if not already done.
