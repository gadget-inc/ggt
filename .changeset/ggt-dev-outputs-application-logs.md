---
"ggt": minor
---

# `ggt dev` now outputs application logs!

In our push to make your local development experience as streamlined as possible, we've now included application logs, by default, to ouput during a sync session!

![CleanShot 2024-10-02 at 16 04 03@2x](https://github.com/user-attachments/assets/840c23fd-8532-4b99-ad30-e0bb936afc10)

Not only that, as long as your terminal supports linking, traceID(s) are also setup to take you to the editor logs!

![CleanShot 2024-10-02 at 16 10 53](https://github.com/user-attachments/assets/e5e2b172-c7a7-43b3-b329-d84600f9f8ab)

No worries if the verbose output isn't your thing, we've got you covered:

- `--no-logs` - completely turns off this new feature
- `--my-logs` - same as the editor logs boolean for only showing my logs/events
- `--log-level` - Set the log level for incoming application logs, `debug, info, error`

As always any more info can be found through `ggt dev --help`!
