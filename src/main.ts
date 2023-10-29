import { init } from "@sentry/node";
import { run } from "./commands/root.js";
import { parseBoolean } from "./services/args.js";
import { config, env } from "./services/config.js";

init({
  dsn: "https://0c26e0d8afd94e77a88ee1c3aa9e7065@o250689.ingest.sentry.io/6703266",
  release: config.version,
  enabled: env.productionLike && parseBoolean(process.env["GGT_SENTRY_ENABLED"] ?? "true"),
});

await run();
