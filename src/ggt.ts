import ms from "ms";
import * as root from "./commands/root.js";
import { Context } from "./services/command/context.js";
import { println } from "./services/output/print.js";
import { installErrorHandlers, reportErrorAndExit } from "./services/output/report.js";
import { installJsonExtensions } from "./services/util/json.js";

export const ggt = async (ctx = Context.init({ name: "ggt" })): Promise<void> => {
  installJsonExtensions();
  installErrorHandlers(ctx);

  try {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      process.once(signal, async () => {
        ctx.log.trace("received signal", { signal });

        // when ggt is run via npx, and the user presses ctrl+c, npx
        // sends sigint twice in quick succession. in order to prevent
        // the second sigint from triggering the force exit listener,
        // we wait a bit before registering it
        setTimeout(() => {
          process.once(signal, () => {
            println(" Exiting immediately");
            process.exit(1);
          });
        }, ms("100ms")).unref();

        const spinner = println({ output: "spinner" })`
          Stopping {gray Press Ctrl+C again to force}
        `;

        ctx.onAbort(() => new Promise((resolve) => setTimeout(resolve, ms("2s"))));

        try {
          ctx.abort();
          await ctx.done;
          spinner.succeed();
        } catch (error) {
          spinner.fail();
          await reportErrorAndExit(ctx, error);
        }
      });
    }

    await root.command(ctx);
  } catch (error) {
    await reportErrorAndExit(ctx, error);
  }
};
