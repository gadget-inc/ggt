# Fix CI Failures

Identify and fix all failures in the most recent CI run for the current branch.

## Steps

1. **Find the latest CI run** — use `gh run list --branch <current-branch> --limit 1 --json databaseId,status,conclusion,event,headBranch` to get the most recent run. If no runs exist, tell the user and stop.

2. **Check run status** — use `gh run view <run-id>` to list jobs and their statuses. If all jobs are passing, report that CI is green and stop.

3. **Fetch and categorize failure logs** — use `gh run view <run-id> --log-failed` to get failure output. Categorize each failure:
   - **Test failures** — assertion errors, failing test names, expected vs actual output
   - **Lint/format errors** — file locations, rule names, formatting diffs
   - **Build/type errors** — compilation errors, type mismatches, missing imports
   - **Infra/flaky failures** — timeouts, network errors, resource exhaustion → suggest re-running instead of fixing

4. **Create a task for each failure** — use TaskCreate to track each distinct failure as a separate task. Group related errors (e.g. multiple lint errors from the same root cause) into a single task.

5. **Fix each failure** — work through tasks in order:
   - Fix the underlying issue in the codebase
   - Check CLAUDE.md and CONTRIBUTING.md for project-specific validation commands
   - Validate locally by running the specific failing check (e.g. the exact test, lint rule, or build command)
   - Mark the task as completed before moving on

6. **Final validation** — run the project's full lint/test suite (as documented in CLAUDE.md/CONTRIBUTING.md) to catch regressions introduced by fixes.

7. **Report results** — summarize what was fixed and how. Offer to commit and push the fixes.
