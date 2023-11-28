---
"ggt": patch
---

We made some improvements to our debug logs!

Previously, we were using the `debug` package to log messages. This was good at first, but now that we're adding more features to `ggt` we need more control over our logs. We want to be able to output structured logs, control the verbosity, and output them as JSON so that we can pipe them to another tool or parse them in a script.

To accomplish this, we've added 2 new flags:

- `-v, --verbose` to output structured logs

  This replaces the `--debug` flag, which was a boolean flag that would print out all logs. This new flag is a counter, so you can use it multiple times to increase the verbosity of the logs. Currently, there are 3 levels of verbosity:

  - `-v` = INFO
  - `-vv` = DEBUG
  - `-vvv` = TRACE

- `--json` to print out logs in JSON format

  This is useful if you want to pipe the logs to another tool, or if you want to parse the logs in a script.
