# Re-run CI Jobs

Re-run jobs in the most recent CI run for the current branch.

## Steps

1. **Find the latest run** — use `gh run list --branch <current-branch> --limit 1 --json databaseId,status,conclusion` to get the most recent run. If no runs exist, tell the user and stop.

2. **Choose scope** — if the run has failed jobs, default to re-running only failed jobs (`--failed`). If the user explicitly asks to re-run all jobs, or the run has no failures, re-run everything.

3. **Execute** — run `gh run rerun <run-id> [--failed]`.

4. **Watch** — use `gh run watch <run-id>` to stream status updates and wait for completion.

5. **Report** — summarize the result. If failures remain after the re-run, suggest using the fix operation.
