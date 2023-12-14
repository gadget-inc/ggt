---
"ggt": minor
---

We have added a new command to ggt - the deploy command!

Users can now run `ggt deploy` to deploy their app to production straight from the CLI. `ggt deploy` will:

- Check if an app is in a deployable state
- Alert the user if there are any issues with the app
- Prompt the user how they would like to continue with the deploy if there are issues (skipped if they pass along the `--force` flag)
- Send back deploy status updates once the deploy is started and until the deploy has completed
