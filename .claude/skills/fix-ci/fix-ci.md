# Fix CI Failures

Identify and fix all failures in the most recent CI run for the current branch.

1. **Find the latest CI run** — use `gh run list --branch <current-branch> --limit 1` to get the most recent run
2. **Identify failed jobs** — use `gh run view <run-id>` to list jobs and their statuses
3. **Download and analyze logs** — for each failed job, use `gh run view <run-id> --log-failed` to get the failure output; identify every distinct failure (test case, lint error, build error, etc.)
4. **Create a task for each failure** — use TaskCreate to track each distinct failure as a separate task
5. **Fix each failure** — work through tasks in order, fixing the underlying issue in the codebase; validate each fix locally before moving on (e.g. run the specific failing test)
6. **Report results** — summarize what was fixed and how
