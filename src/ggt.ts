import ms from "ms";
import * as root from "./commands/root.js";
import { Context } from "./services/command/context.js";
import { stderr } from "./services/output/output.js";
import { println } from "./services/output/print.js";
import { installErrorHandlers, reportErrorAndExit } from "./services/output/report.js";
import { spin } from "./services/output/spinner.js";
import { installJsonExtensions } from "./services/util/json.js";

export const ggt = async (ctx = Context.init({ name: "ggt" })): Promise<void> => {
  installJsonExtensions();
  installErrorHandlers(ctx);

  try {
    let stopping = false;

    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      process.on(signal, async () => {
        if (stopping) {
          return;
        }

        stopping = true;
        ctx.log.trace("received signal", { signal });

        setTimeout(() => {
          // when ggt is run with npx, and the user presses ctrl+c, ggt
          // receives SIGINT twice in quick succession. in order to
          // prevent the second SIGINT from triggering the force exit
          // listener, we wait a bit in this setTimeout before adding it
          process.once(signal, () => {
            println(" Exiting immediately");
            process.exit(1);
          });
        }, ms("100ms")).unref();

        // ctrl+c was pressed, so we need to clear the line
        stderr.write("\n");

        // if there was any sticky text, it needs to be persisted now
        stderr.persistFooter();

        // FIXME: might cause multiple spinners to be printed (assertion error)
        const spinner = spin({ successSymbol: "👋" })`
          Stopping {gray Press Ctrl+C again to force}
        `;

        // TODO: remove me
        // await delay("5s");

        try {
          ctx.abort();
          await ctx.done;
          spinner.succeed("Goodbye!");
          // TODO: remove me
          // throw new Error("🤮");
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
