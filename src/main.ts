import { init } from "@sentry/node";
import arg from "arg";
import Debug from "debug";
import { run } from "./commands/root.js";
import { globalArgsSpec, parseBoolean } from "./services/args.js";
import { config, env } from "./services/config.js";

init({
  dsn: "https://0c26e0d8afd94e77a88ee1c3aa9e7065@o250689.ingest.sentry.io/6703266",
  release: config.version,
  enabled: env.productionLike && parseBoolean(process.env["GGT_SENTRY_ENABLED"] ?? "true"),
});

const globalArgs = arg(globalArgsSpec, {
  argv: process.argv.slice(2),
  permissive: true,
  stopAtPositional: false,
});

if (process.env["DEBUG"]) {
  if (parseBoolean(process.env["DEBUG"])) {
    // treat DEBUG=true as DEBUG=ggt:*
    Debug.enable("ggt:*");
  } else {
    // otherwise, use the value of DEBUG as-is
    Debug.enable(process.env["DEBUG"]);
  }
}

if (globalArgs["--debug"]) {
  Debug.enable("ggt:*");
}

await run(globalArgs);
