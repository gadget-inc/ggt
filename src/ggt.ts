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
      process.once(signal, () => {
        ctx.log.trace("received signal", { signal });
        println` Stopping... {gray Press Ctrl+C again to force}`;
        ctx.abort();

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
      });
    }

    await root.command(ctx);
  } catch (error) {
    await reportErrorAndExit(ctx, error);
  }
};
