# Workflow

## Plan First
- Enter plan mode for any non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan — don't keep pushing
- Use subagents to keep main context clean; one task per subagent

## Execution
- Never mark a task complete without proving it works
- Run verification commands (typecheck, lint, tests) before declaring done
- For non-trivial changes: pause and ask "is there a more elegant way?"
- Skip elegance checks for simple, obvious fixes

## Bug Fixing
- When given a bug: just fix it. Point at logs/errors/tests, then resolve
- Zero context switching required from the user

## Self-Improvement
- After corrections from the user: update `tasks/lessons.md` with the pattern
- Write rules that prevent the same mistake recurring
